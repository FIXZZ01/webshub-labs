/**
 * /api/dns — DNS lookup via DoH (Cloudflare, Google, NextDNS)
 * Real DNS resolution from multiple resolvers.
 */

const RESOLVERS = [
  { name: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query', label: 'Cloudflare 1.1.1.1' },
  { name: 'google', url: 'https://dns.google/resolve', label: 'Google 8.8.8.8' },
  { name: 'nextdns', url: 'https://dns.nextdns.io/dns-query', label: 'NextDNS' },
  { name: 'quad9', url: 'https://dns.quad9.net:5053/dns-query', label: 'Quad9 9.9.9.9' }
];

const RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'CAA'];

async function queryDoH(resolver, name, type) {
  const url = `${resolver.url}?name=${encodeURIComponent(name)}&type=${type}`;
  try {
    const r = await fetch(url, {
      headers: { 'Accept': 'application/dns-json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const data = await r.json();
    return {
      status: data.Status,
      answer: (data.Answer || []).map(a => ({
        name: a.name, type: a.type, ttl: a.TTL,
        data: a.data
      })),
      authority: (data.Authority || []).map(a => ({
        name: a.name, type: a.type, ttl: a.TTL, data: a.data
      }))
    };
  } catch (e) {
    return { error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { host, type = 'A' } = req.query;
  if (!host) return res.status(400).json({ error: 'Missing host' });

  const typeUpper = type.toUpperCase();
  if (!RECORD_TYPES.includes(typeUpper)) {
    return res.status(400).json({ error: 'Invalid type', allowed: RECORD_TYPES });
  }

  const results = await Promise.all(
    RESOLVERS.map(async (r) => ({
      resolver: r.name, label: r.label,
      ...(await queryDoH(r, host, typeUpper))
    }))
  );

  return res.json({
    host, type: typeUpper,
    queriedAt: new Date().toISOString(),
    resolvers: results
  });
}
