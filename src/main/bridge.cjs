const http = require('node:http');
const { URL } = require('node:url');

const PORT = 43821;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(response, statusCode, body, origin) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(origin ? {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    } : {}),
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
      raw += chunk.toString('utf8');
    });
    request.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('Invalid JSON body.')); }
    });
    request.on('error', reject);
  });
}

function createBridge({ store, onCapture }) {
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${PORT}`);
    const origin = request.headers.origin || '';
    const allowedOrigin = /^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin) ? origin : '';

    if (request.method === 'OPTIONS') {
      if (!allowedOrigin) return sendJson(response, 403, { error: 'Extension origin required.' });
      response.writeHead(204, {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin',
      });
      return response.end();
    }

    const auth = request.headers.authorization || '';
    const expected = `Bearer ${store.getBridgeInfo().token}`;
    if (auth !== expected) return sendJson(response, 401, { error: 'Invalid pairing token.' }, allowedOrigin);

    try {
      if (request.method === 'GET' && requestUrl.pathname === '/v1/health') {
        return sendJson(response, 200, { ok: true, app: 'WillAI-C', version: 1 }, allowedOrigin);
      }

      if (request.method === 'GET' && requestUrl.pathname === '/v1/context') {
        const sourceUrl = requestUrl.searchParams.get('sourceUrl') || '';
        return sendJson(response, 200, store.getContextForSource(sourceUrl), allowedOrigin);
      }

      if (request.method === 'POST' && requestUrl.pathname === '/v1/captures') {
        const payload = await readJson(request);
        const result = store.capture(payload);
        if (result.created && onCapture) onCapture(result);
        return sendJson(response, 201, result, allowedOrigin);
      }

      return sendJson(response, 404, { error: 'Not found.' }, allowedOrigin);
    } catch (error) {
      const status = /valid source URL|supported AI websites|Unsupported AI provider/.test(error.message) ? 400 : 422;
      return sendJson(response, status, { error: error.message || 'Request failed.' }, allowedOrigin);
    }
  });

  return {
    port: PORT,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(PORT, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
    },
    stop() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { createBridge, PORT };
