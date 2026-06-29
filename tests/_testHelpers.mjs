import http from 'http';

const opts = { hostname: 'localhost', port: process.env.PORT || 5200 };

export function request(method, path, body, token, expectJson = true) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request({ hostname: opts.hostname, port: opts.port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: expectJson ? JSON.parse(data) : data }); } catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export function login(email = 'admin@azurdesk.ai', password = 'admin123') {
  return request('POST', '/api/auth/login', { email, password });
}

export function adminToken() {
  return login().then((r) => r.body.token);
}
