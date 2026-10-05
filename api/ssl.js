/**
 * /api/ssl — Real TLS certificate inspection via node:tls
 */

import tls from 'node:tls';

export const config = { maxDuration: 30 };

function inspectCert(host, port = 443, timeout = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = tls.connect({
      host, port, servername: host,
      rejectUnauthorized: false,
      timeout
    }, () => {
      const cert = socket.getPeerCertificate(true);
      const protocol = socket.getProtocol();
      const cipher = socket.getCipher();
      const authorized = socket.authorized;
      const authError = socket.authorizationError;
      socket.end();

      if (!cert || !cert.subject) {
        return resolve({
          ok: false, ms: Date.now() - start,
          error: 'No certificate presented'
        });
      }

      const now = Date.now();
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const daysLeft = Math.floor((validTo - now) / 86400000);

      resolve({
        ok: true,
        ms: Date.now() - start,
        protocol,
        cipher: cipher?.name || '',
        authorized,
        authorizationError: authError || null,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        daysLeft,
        expired: now > validTo,
        notYetValid: now < validFrom,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint,
        fingerprint256: cert.fingerprint256,
        subjectAltName: cert.subjectaltname,
        isSelfSigned: cert.issuer?.CN === cert.subject?.CN,
        keyUsage: cert.keyUsage || []
      });
    });

    socket.on('error', (e) => resolve({
      ok: false, ms: Date.now() - start,
      error: e.message, code: e.code
    }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, ms: Date.now() - start, error: 'Timeout' });
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { host, port = 443 } = req.query;
  if (!host) return res.status(400).json({ error: 'Missing host' });

  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  const result = await inspectCert(cleanHost, parseInt(port));

  return res.json({
    host: cleanHost, port: parseInt(port),
    inspectedAt: new Date().toISOString(),
    certificate: result
  });
    }
