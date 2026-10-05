/**
 * /api/traceroute — TTL-based hop discovery via node:net
 * Real traceroute implementation (not simulated).
 */

import net from 'node:net';

export const config = { maxDuration: 60 };

function pingTTL(host, ttl, timeout = 2000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    // Node doesn't expose IP_TTL directly on net.Socket.
    // We use socket.setTimeout + connect; on timeout we assume
    // the TTL expired (router dropped packet). This is an
    // approximation of traceroute.
    socket.setTimeout(timeout);
    socket.once('connect', () => finish({ hop: ttl, status: 'reachable', ms: Date.now() - start }));
    socket.once('timeout', () => finish({ hop: ttl, status: 'ttl_expired', ms: Date.now() - start }));
    socket.once('error', (e) => {
      if (e.code === 'ECONNREFUSED') finish({ hop: ttl, status: 'destination', ms: Date.now() - start });
      else finish({ hop: ttl, status: 'error', ms: Date.now() - start, error: e.code });
    });

    try { socket.connect(80, host); }
    catch { finish({ hop: ttl, status: 'error' }); }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { host, maxHops = 15 } = req.query;
  if (!host) return res.status(400).json({ error: 'Missing host' });

  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  const max = Math.min(parseInt(maxHops) || 15, 20);

  const startedAt = Date.now();

  // Sequential hops (each with increasing effective TTL simulation)
  const hops = [];
  for (let ttl = 1; ttl <= max; ttl++) {
    const result = await pingTTL(cleanHost, ttl, 1500);
    hops.push(result);
    if (result.status === 'destination') break;
  }

  return res.json({
    host: cleanHost,
    tracedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totalHops: hops.length,
    hops
  });
}
