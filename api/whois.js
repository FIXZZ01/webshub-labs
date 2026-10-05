/**
 * /api/whois — RDAP lookup (modern WHOIS, no API key, free)
 * https://rdap.org/domain/<domain> returns structured JSON
 */

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: 'Missing domain' });

  const clean = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  const baseDomain = clean.split('.').slice(-2).join('.');

  try {
    const r = await fetch(`https://rdap.org/domain/${baseDomain}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/rdap+json, application/json' }
    });

    if (!r.ok) {
      return res.json({ domain: baseDomain, ok: false, error: `RDAP ${r.status}` });
    }

    const data = await r.json();

    // Extract key info
    const events = (data.events || []).reduce((acc, e) => {
      acc[e.eventAction] = e.eventDate;
      return acc;
    }, {});

    const nameservers = (data.nameservers || []).map(ns => ns.ldhName);
    const status = data.status || [];

    const entities = (data.entities || []).map(e => ({
      roles: e.roles,
      handle: e.handle,
      vcard: e.vcardArray?.[1]?.reduce((acc, v) => {
        acc[v[0]] = v[3];
        return acc;
      }, {}) || {}
    }));

    return res.json({
      domain: baseDomain,
      ok: true,
      handle: data.handle,
      ldhName: data.ldhName,
      status,
      events: {
        registered: events.registration || null,
        expires: events.expiration || null,
        lastChanged: events['last changed'] || null,
        lastUpdate: events['last update of RDAP database'] || null
      },
      nameservers,
      entities,
      secureDNS: data.secureDNS || null,
      raw: process.env.NODE_ENV === 'development' ? data : undefined
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
