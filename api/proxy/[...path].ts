export const config = { runtime: 'edge' };

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const API_KEY = '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';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export default async function handler(req: Request) {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  // strip /api/proxy prefix to get the actual NVIDIA path
  const path = url.pathname.replace(/^\/api\/proxy/, '');
  const targetUrl = `${NVIDIA_BASE}${path}${url.search}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    // @ts-ignore — needed for streaming body in Edge
    init.duplex = 'half';
  }

  const upstream = await fetch(targetUrl, init);

  // Forward upstream headers and add CORS headers
  const resHeaders = new Headers(upstream.headers);
  Object.entries(CORS).forEach(([k, v]) => resHeaders.set(k, v));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}
