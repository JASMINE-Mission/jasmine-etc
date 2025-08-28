#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = process.env.PORT || 8080;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-cache' }, headers));
  res.end(body);
}

function handler(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/etc/index.html';
  // Normalize and resolve the file path
  const fp = path.resolve(root, '.' + urlPath);

  // Prevent path traversal
  if (!fp.startsWith(root + path.sep)) {
    return send(res, 400, 'Bad Request');
  }

  fs.stat(fp, (err, stat) => {
    if (err) return send(res, 404, 'Not Found');
    let filePath = fp;
    if (stat.isDirectory()) filePath = path.join(fp, 'index.html');
    const ext = path.extname(filePath).toLowerCase();
    const type = mime[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => send(res, 500, 'Internal Server Error'));
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    stream.pipe(res);
  });
}

http.createServer(handler).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}/ (default to /etc/index.html)`);
});

