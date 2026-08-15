'use strict';
// Local web UI: http://localhost:4480 — enter a folder path, get the report.
const http = require('http');
const { scan } = require('./scan');
const { render } = require('./report/html');

const PORT = process.env.PORT || 4480;

const FORM = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>CodeHawk</title>
<style>
  body{margin:0;background:#0f1115;color:#e6e8ee;font:16px/1.6 system-ui,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px}
  .card{background:#171a21;border:1px solid #262b36;border-radius:12px;padding:36px;max-width:560px;width:100%}
  h1{margin:0 0 6px;font-size:26px}p{color:#9aa3b2;font-size:14px;margin:0 0 22px}
  input{width:100%;padding:12px 14px;border-radius:8px;border:1px solid #262b36;background:#0f1115;color:#e6e8ee;font:inherit;box-sizing:border-box}
  button{margin-top:14px;width:100%;padding:12px;border:none;border-radius:8px;background:#4ea1ff;color:#08101c;font:600 15px system-ui;cursor:pointer}
  button:hover{filter:brightness(1.1)}
</style></head><body><div class="card">
<h1>🦅 CodeHawk</h1>
<p>AI code provenance auditor. Everything runs locally — the code never leaves your machine. Paste the absolute path of the folder to audit (works with or without a .git history).</p>
<form action="/report" method="get">
  <input name="path" placeholder="C:\\path\\to\\purchased-code" required autofocus>
  <button type="submit">Audit this folder</button>
</form></div></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(FORM);
    } else if (url.pathname === '/report') {
      const target = url.searchParams.get('path');
      const result = scan(target);
      if (url.searchParams.get('format') === 'json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result, null, 2));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(render(result).replace('</h1>', '</h1><p style="margin:0 0 16px"><a href="/" style="color:#4ea1ff;font-size:13px">← audit another folder</a></p>'));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<body style="background:#0f1115;color:#e6e8ee;font-family:system-ui;padding:40px"><h2>Error</h2><p>${String(e.message).replace(/</g, '&lt;')}</p><a href="/" style="color:#4ea1ff">← back</a></body>`);
  }
});

server.listen(PORT, () => {
  console.log(`CodeHawk UI → http://localhost:${PORT}`);
});
