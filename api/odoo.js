module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ODOO_URL = 'https://pizza-express.odoo.com';
  const ODOO_DB = 'pizza-express';
  const ODOO_EMAIL = 'dzhabrail.b@gmail.com';
  const ODOO_APIKEY = process.env.ODOO_API_KEY || 'a12c75e9d46da9c27aa7aad49204ac904e2caed5';

  try {
    const { method, model, args, kwargs } = req.body;

    // Step 1: authenticate
    const authResp = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: {
          service: 'common', method: 'authenticate',
          args: [ODOO_DB, ODOO_EMAIL, ODOO_APIKEY, {}]
        }
      })
    });
    const authData = await authResp.json();
    const uid = authData.result;
    if (!uid) return res.status(401).json({ error: 'Odoo auth failed', detail: authData.error });

    // Step 2: call method
    const rpcResp = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 2,
        params: {
          service: 'object', method: 'execute_kw',
          args: [ODOO_DB, uid, ODOO_APIKEY, model, method, args || [], kwargs || {}]
        }
      })
    });
    const rpcData = await rpcResp.json();
    if (rpcData.error) return res.status(400).json({ error: rpcData.error.data?.message || rpcData.error.message });

    return res.status(200).json({ result: rpcData.result });

  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
};
