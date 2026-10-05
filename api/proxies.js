/**
 * /api/proxies — 12 REAL proxy sources, no API key.
 */

const SOURCES = [
  // ── JSON APIs ──────────────────────────────────────────────
  {
    name: 'databay-json',
    url: 'https://databay.com/api/v1/proxy-list?format=json&limit=500',
    parse: (d) => (d.data || d || []).map(p => ({
      ip: p.ip, port: +p.port,
      protocol: (p.protocol || 'http').toLowerCase(),
      cc: p.country_code || p.country || '',
      city: p.city || '', isp: p.isp || '', anonymity: p.anonymity || ''
    }))
  },
  {
    name: 'proxyscrape-json',
    url: 'https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/all/data.json',
    parse: (d) => d.map(p => ({
      ip: p.ip, port: +p.port,
      protocol: (p.protocol || 'http').toLowerCase(),
      cc: p.country_code || '', city: p.city || '',
      isp: p.isp || '', latency: p.latency_ms || 0, ssl: p.ssl || false
    }))
  },
  {
    name: 'proxifly-json',
    url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json',
    parse: (d) => d.map(p => ({
      ip: p.ip, port: +p.port,
      protocol: (p.protocol || 'http').toLowerCase(),
      cc: p.geolocation?.country || '', city: p.geolocation?.city || '',
      isp: p.isp || '', anonymity: p.anonymity || ''
    }))
  },
  {
    name: 'hproxy-json',
    url: 'https://hproxy.com/api/proxy-list?format=json&limit=500',
    parse: (d) => (Array.isArray(d) ? d : (d.data || d.proxies || [])).map(p => ({
      ip: p.ip, port: +p.port,
      protocol: (p.protocol || p.type || 'http').toLowerCase(),
      cc: p.country_code || p.country || '', city: p.city || '',
      isp: p.isp || p.asn || '', anonymity: p.anonymity || ''
    }))
  },
  {
    name: 'geonode-json',
    url: 'https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc',
    parse: (d) => (d.data || []).map(p => ({
      ip: p.ip, port: +p.port,
      protocol: (p.protocols?.[0] || 'http').toLowerCase(),
      cc: p.country || '', city: p.city || '',
      isp: p.isp || '', anonymity: p.anonymityLevel || ''
    }))
  },

  // ── TXT files (GitHub raw) ──────────────────────────────────
  { name: 'databay-http', url: 'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/http.txt', txt: true, protocol: 'http' },
  { name: 'databay-socks4', url: 'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks4.txt', txt: true, protocol: 'socks4' },
  { name: 'databay-socks5', url: 'https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks5.txt', txt: true, protocol: 'socks5' },
  { name: 'monosans', url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/all.txt', txt: true, protocol: 'http' },
  { name: 'theriturajps', url: 'https://raw.githubusercontent.com/theriturajps/proxy-list/main/http.txt', txt: true, protocol: 'http' },
  { name: 'fyvri-http', url: 'https://raw.githubusercontent.com/fyvri/fresh-proxy-list/main/http.txt', txt: true, protocol: 'http' },
  { name: 'fyvri-socks5', url: 'https://raw.githubusercontent.com/fyvri/fresh-proxy-list/main/socks5.txt', txt: true, protocol: 'socks5' },
  { name: 'proxmint', url: 'https://raw.githubusercontent.com/proxmint/free-proxy-list/main/http.txt', txt: true, protocol: 'http' }
];

async function fetchPool() {
  const tasks = SOURCES.map(async (src) => {
    try {
      const r = await fetch(src.url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [];
      if (src.txt) {
        const txt = await r.text();
        return txt.split(/\r?\n/).filter(l => l.includes(':')).map(l => {
          const [ip, port] = l.trim().split(':');
          return { ip, port: +port, protocol: src.protocol, source: src.name };
        }).filter(p => p.ip && p.port > 0 && p.port < 65536);
      }
      const json = await r.json();
      const parsed = typeof src.parse === 'function' ? src.parse(json) : [];
      return parsed.map(p => ({ ...p, source: src.name }));
    } catch { return []; }
  });

  const results = await Promise.all(tasks);
  const merged = [].concat(...results);

  const seen = new Set();
  const unique = [];
  for (const p of merged) {
    if (!p.ip || !p.port) continue;
    const k = `${p.protocol}://${p.ip}:${p.port}`;
    if (seen.has(k)) continue;
    seen.add(k); unique.push(p);
  }
  return unique;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const limit = Math.min(parseInt(req.query.limit) || 500, 3000);
    const protocol = req.query.protocol;
    const country = req.query.country;

    let pool = await fetchPool();
    if (protocol) pool = pool.filter(p => p.protocol === protocol);
    if (country) pool = pool.filter(p => p.cc === country);
    pool = pool.slice(0, limit);

    const countries = [...new Set(pool.map(p => p.cc).filter(Boolean))].sort();

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.json({
      count: pool.length,
      countries,
      protocols: [...new Set(pool.map(p => p.protocol))],
      sources: SOURCES.length,
      proxies: pool
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
