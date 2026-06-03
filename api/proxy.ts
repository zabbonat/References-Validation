import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurazione CORS (consente al frontend in dev/prod di comunicare con le API)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Risposta rapida per richieste preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query.url as string;

  if (!targetUrl) {
    return res.status(400).json({ error: "Missing 'url' parameter" });
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'User-Agent': 'ReferencesValidation-VercelProxy/1.0',
        'Accept': req.headers['accept'] || '*/*',
      }
    });

    // Se è JSON, rispondi con JSON, se è testo/XML rispondi in text
    const contentType = response.headers.get('content-type') || 'text/plain';
    res.setHeader('Content-Type', contentType);
    
    // Per stream di grandi dimensioni o per semplicità restituiamo il testo
    const data = await response.text();
    
    res.status(response.status).send(data);
  } catch (error: any) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: 'Proxy Request Failed', details: error.message });
  }
}
