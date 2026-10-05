/**
 * /api/test — REAL proxy testing via Node.js net + socks + tls
 * Vercel Node.js runtime supports raw TCP/UDP.
 */

import net from 'node:net';
import tls from 'node:tls';
import { SocksClient } from 'socks';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';

export const config = { maxDuration: 60, memory: 1024 };

/* ═══════════ STATUS CLASSIFICATION ENGINE ═══════════ */
const STATUS_MAP = {
  200: { label: 'OK', severity: 'ok', icon: '✓' },
  201: { label: 'Created', severity: 'ok', icon: '✓' },
  204: { label: 'No Content', severity: 'ok', icon: '✓' },
  301: { label: 'Moved Permanently', severity: 'warn', icon: '↪' },
  302: { label: 'Found', severity: 'warn', icon: '↪' },
  304: { label: 'Not Modified', severity: 'info', icon: '≈' },
  307: { label: 'Temporary Redirect', severity: 'warn', icon: '↪' },
  308: { label: 'Permanent Redirect', severity: 'warn', icon: '↪' },
  400: { label: 'Bad Request', severity: 'error', icon: '✕' },
  401: { label: 'Unauthorized', severity: 'error', icon: '🔑' },
  403: { label: 'Forbidden', severity: 'error', icon: '🚫' },
  404: { label: 'Not Found', severity: 'error', icon: '🔍' },
  405: { label: 'Method Not Allowed', severity: 'error', icon: '✕' },
  408: { label: 'Request Timeout', severity: 'error', icon: '⏱' },
  410: { label: 'Gone', severity: 'error', icon: '💀' },
  429: { label: 'Too Many Requests', severity: 'warn', icon: '⏳' },
  451: { label: 'Unavailable (Legal)', severity: 'error', icon: '⚖' },
  500: { label: 'Internal Server Error', severity: 'error', icon: '💥' },
  502: { label: 'Bad Gateway', severity: 'error', icon: '🔌' },
  503: { label: 'Service Unavailable', severity: 'error', icon: '🛑' },
  504: { label: 'Gateway Timeout', severity: 'error', icon: '⏱' },
  520: { label: 'Unknown Error (CF)', severity: 'error', icon: '❓' },
  521: { label: 'Web Server Is Down', severity: 'error', icon: '📉' },
  522: { label: 'Connection Timed Out', severity: 'error', icon: '⏱' },
  523: { label: 'Origin Unreachable', severity: 'error', icon: '📡' },
  524: { label: 'A Timeout Occurred', severity: 'error', icon: '⏱' }
};

function classifyStatus(code) {
  if (STATUS_MAP[code]) return { code, ...STATUS_MAP[code] };
  if (code >= 200 && code < 300) return { code, label: `HTTP ${code}`, severity: 'ok', icon: '✓' };
  if (code >= 300 && code < 400) return { code, label: `HTTP ${code}`, severity: 'warn', icon: '↪' };
  if (code >= 400 && code < 500) return { code, label: `HTTP ${code}`, severity: 'error', icon: '✕' };
  if (code >= 500) return { code, label: `HTTP ${code}`, severity: 'error', icon: '💥' };
  return { code: code || 0, label: 'Unknown', severity: 'info', icon: '?' };
}

function classifyError(e) {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('timeout') || m.includes('timed out')) return { code: 'TIMEOUT', label: 'Timeout', severity: 'error', icon: '⏱' };
  if (m.includes('refused')) return { code: 'CONNECTION_REFUSED', label: 'Connection Refused', severity: 'error', icon: '🚫' };
  if (m.includes('reset')) return { code: 'CONNECTION_RESET', label: 'Connection Reset', severity: 'error', icon: '↺' };
  if (m.includes('dns') || m.includes('enotfound')) return { code: 'DNS_ERROR', label: 'DNS Failed', severity: 'error', icon: '🔍' };
  if (m.includes('unreachable')) return { code: 'HOST_UNREACHABLE', label: 'Host Unreachable', severity: 'error', icon: '📡' };
  if (m.includes('certificate') || m.includes('ssl') || m.includes('tls')) return { code: 'SSL_ERROR', label: 'SSL Error', severity: 'error', icon: '🔒' };
  if (m.includes('socks')) return { code: 'SOCKS_ERROR', label: 'SOCKS Error', severity: 'error', icon: '🔗' };
  return { code: 'UNKNOWN', label: e?.message || 'Unknown', severity: 'error', icon: '❓' };
}

/* ═══════════ REAL PROXY TESTERS ═══════════ */

// SOCKS5 full handshake
async function testSocks5(proxy, host, port, timeout = 8000) {
  const start = Date.now();
  try {
    const info = await SocksClient.createConnection({
      proxy: { host: proxy.ip, port: proxy.port, type: 5 },
      command: 'connect',
      destination: { host, port },
      timeout
    });
    info.socket.destroy();
    return {
      ok: true, ms: Date.now() - start,
      classification: { code: 'SOCKS_OK', label: 'SOCKS5 OK', severity: 'ok', icon: '✓' }
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, classification: classifyError(e) };
  }
}

// SOCKS4 full handshake
async function testSocks4(proxy, host, port, timeout = 8000) {
  const start = Date.now();
  try {
    const info = await SocksClient.createConnection({
      proxy: { host: proxy.ip, port: proxy.port, type: 4, userId: '' },
      command: 'connect',
      destination: { host, port },
      timeout
    });
    info.socket.destroy();
    return {
      ok: true, ms: Date.now() - start,
      classification: { code: 'SOCKS4_OK', label: 'SOCKS4 OK', severity: 'ok', icon: '✓' }
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, classification: classifyError(e) };
  }
}

// HTTP CONNECT tunnel
async function testHttpProxy(proxy, host, port, timeout = 8000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect(proxy.port, proxy.ip);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, ms: Date.now() - start,
                classification: { code: 'PROXY_TIMEOUT', label: 'Proxy Timeout', severity: 'error', icon: '⏱' } });
    }, timeout);

    socket.on('connect', () => {
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\nUser-Agent: WebsHub-Labs/4.0\r\n\r\n`);
    });
    socket.once('data', (buf) => {
      clearTimeout(timer);
      const line = buf.toString().split('\r\n')[0];
      const m = line.match(/ (\d{3}) /);
      const code = m ? +m[1] : 0;
      socket.destroy();
      if (code === 200) {
        resolve({ ok: true, ms: Date.now() - start,
                  classification: { code: 'HTTP_PROXY_OK', label: 'HTTP CONNECT OK', severity: 'ok', icon: '✓' } });
      } else {
        resolve({ ok: false, ms: Date.now() - start,
                  classification: { code: `HTTP_PROXY_${code}`, label: `Proxy HTTP ${code}`, severity: 'error', icon: '🚫' } });
      }
    });
    socket.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, ms: Date.now() - start, classification: classifyError(e) });
    });
  });
}

// Direct fetch (from Vercel serverless region)
async function testDirect(targetUrl, timeout = 15000) {
  const start = Date.now();
  try {
    const r = await fetch(targetUrl, {
      method: 'GET', redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
      headers: { 'User-Agent': 'WebsHub-Labs/4.0' }
    });
    return {
      ok: r.status < 400, ms: Date.now() - start,
      status: r.status, statusText: r.statusText,
      classification: classifyStatus(r.status),
      server: r.headers.get('server') || '',
      location: r.headers.get('location') || '',
      contentType: r.headers.get('content-type') || '',
      cfRay: r.headers.get('cf-ray') || ''
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, status: 0,
             classification: classifyError(e) };
  }
}

/* ═══════════ ORCHESTRATOR ═══════════ */
async function testProxy(proxy, target, timeout) {
  const url = new URL(target);
  const host = url.hostname;
  const port = url.port ? +url.port : (url.protocol === 'https:' ? 443 : 80);
  const p = (proxy.protocol || 'http').toLowerCase();

  if (p === 'socks5') return testSocks5(proxy, host, port, timeout);
  if (p === 'socks4') return testSocks4(proxy, host, port, timeout);
  if (p === 'http' || p === 'https') return testHttpProxy(proxy, host, port, timeout);

  return { ok: false, ms: 0,
           classification: { code: 'UNKNOWN_PROTO', label: 'Unknown Protocol', severity: 'error', icon: '❓' } };
}

/* ═══════════ HANDLER ═══════════ */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { target, proxies = [], timeout = 8000 } = req.body || {};
  if (!target) return res.status(400).json({ error: 'Missing target' });

  let url;
  try { url = new URL(target.startsWith('http') ? target : 'https://' + target); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const startedAt = Date.now();

  const [proxyResults, directResult] = await Promise.all([
    Promise.all(proxies.slice(0, 30).map(async (p) => {
      const r = await testProxy(p, url.toString(), timeout);
      return {
        proxy: `${p.ip}:${p.port}`,
        protocol: p.protocol, country: p.cc || '',
        city: p.city || '', isp: p.isp || '', source: p.source,
        ok: r.ok, ms: r.ms, classification: r.classification
      };
    })),
    testDirect(url.toString())
  ]);

  const ok = proxyResults.filter(r => r.ok);
  const lats = ok.map(r => r.ms).sort((a, b) => a - b);
  const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;

  const byClass = {};
  proxyResults.forEach(r => { byClass[r.classification.code] = (byClass[r.classification.code] || 0) + 1; });

  return res.json({
    target: url.toString(),
    testedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    poolSize: proxies.length,
    ok: ok.length,
    failed: proxyResults.length - ok.length,
    successRate: Math.round((ok.length / (proxyResults.length || 1)) * 100),
    stats: {
      avg, median: lats[Math.floor(lats.length / 2)] || 0,
      fastest: lats[0] || 0, slowest: lats.at(-1) || 0,
      jitter: lats.length > 1 ? Math.round(lats.reduce((a, b) => a + Math.abs(b - avg), 0) / lats.length) : 0
    },
    byClass, direct: directResult, results: proxyResults
  });
                      }
