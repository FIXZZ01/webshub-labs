/**
 * /api/portscan — TCP port scanner via node:net
 * Real TCP connections, no simulation.
 */

import net from 'node:net';

export const config = { maxDuration: 30 };

const COMMON_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 143, 443, 445,
  993, 995, 1433, 1521, 3306, 3389, 5432, 5900,
  6379, 8080, 8443, 9000, 9200, 27017
];

function scanPort(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;

    const finish = (status) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ port, status, ms: Date.now() - start });
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish('open'));
    socket.once('timeout', () => finish('timeout'));
    socket.once('error', (e) => {
      if (e.code === 'ECONNREFUSED') finish('closed');
      else if (e.code === 'EHOSTUNREACH') finish('unreachable');
      else finish('filtered');
    });

    try { socket.connect(port, host); }
    catch { finish('error'); }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { host, ports } = req.query;
  if (!host) return res.status(400).json({ error: 'Missing host' });

  const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');

  let portList = COMMON_PORTS;
  if (ports) {
    portList = ports.split(',').map(p => parseInt(p.trim())).filter(p => p > 0 && p < 65536).slice(0, 50);
  }

  const startedAt = Date.now();

  // Batch to avoid socket exhaustion
  const BATCH = 10;
  const results = [];
  for (let i = 0; i < portList.length; i += BATCH) {
    const batch = portList.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(p => scanPort(cleanHost, p)));
    results.push(...batchResults);
  }

  const open = results.filter(r => r.status === 'open');
  const closed = results.filter(r => r.status === 'closed');
  const filtered = results.filter(r => r.status === 'filtered' || r.status === 'timeout');

  return res.json({
    host: cleanHost,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totalScanned: results.length,
    summary: {
      open: open.length,
      closed: closed.length,
      filtered: filtered.length
    },
    openPorts: open.sort((a, b) => a.port - b.port),
    results: results.sort((a, b) => a.port - b.port)
  });
}
