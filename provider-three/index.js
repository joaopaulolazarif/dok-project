const http = require('http');

let mode = 'normal';
let timeoutMs = 10000;

const KNOWN_PLATES = ['ABC1234'];

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function buildDebitsCSV(placa) {
  const rows = [
    'vehicle,type,amount,due_date',
    `${placa},IPVA,1500.00,2024-01-10`,
    `${placa},MULTA,300.50,2024-02-15`,
  ];
  return rows.join('\n');
}

function sendError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message, code: status }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ mode, timeoutMs }));
  }

  if (req.method === 'POST' && url.pathname === '/control') {
    try {
      const parsed = JSON.parse(await readBody(req));
      if (parsed.mode) mode = parsed.mode;
      if (parsed.timeoutMs) timeoutMs = Number(parsed.timeoutMs);
      console.log(`[provider-three] mode changed to: ${mode}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ mode, timeoutMs }));
    } catch {
      sendError(res, 400, 'Invalid JSON body');
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/debits') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendError(res, 400, 'Invalid JSON body');
    }

    if (!body.placa) {
      return sendError(res, 400, 'Missing required field: placa');
    }

    const respond = () => {
      if (mode === 'error_500') return sendError(res, 500, 'Internal Server Error');
      if (mode === 'error_400') return sendError(res, 400, 'Bad Request');
      if (!KNOWN_PLATES.includes(body.placa.toUpperCase())) {
        return sendError(res, 404, 'Plate not found');
      }
      res.writeHead(200, { 'Content-Type': 'text/csv' });
      res.end(buildDebitsCSV(body.placa.toUpperCase()));
    };

    return mode === 'timeout' ? setTimeout(respond, timeoutMs) : respond();
  }

  sendError(res, 404, 'Not Found');
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => console.log(`provider-three running on port ${PORT} [mode: ${mode}]`));
