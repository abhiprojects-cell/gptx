export const config = { runtime: 'edge' };

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const API_KEY = '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';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

export default async function handler(req: Request) {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const url = new URL(req.url);
    // Strip /api/proxy prefix → get real NVIDIA path
    const path = url.pathname.replace(/^\/api\/proxy/, '') || '/';
    const targetUrl = `${NVIDIA_BASE}${path}`;

    // Read body as text to avoid ReadableStream piping issues
    const bodyText = (req.method !== 'GET' && req.method !== 'HEAD')
      ? await req.text()
      : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'text/event-stream',
      },
      body: bodyText,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error(`NVIDIA API error ${upstream.status}:`, errText);
      return new Response(
        JSON.stringify({ error: `NVIDIA API error ${upstream.status}: ${errText}` }),
        { status: upstream.status, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // Stream the SSE response back to the browser
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('Proxy error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
}
