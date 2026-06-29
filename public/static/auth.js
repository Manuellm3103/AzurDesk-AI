const API_URL = '';
let token = localStorage.getItem('azurdesk_token');
let user = null;

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_URL + path, opts);
  if (res.status === 401) { localStorage.removeItem('azurdesk_token'); location.reload(); }
  return res.json();
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const r = await api('POST', '/api/auth/login', { email, password });
  if (r.success) {
    token = r.token; user = r.user;
    localStorage.setItem('azurdesk_token', token);
    document.getElementById('login').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    show('dashboard');
  } else {
    alert('Credenciales inválidas');
  }
}

function logout() {
  localStorage.removeItem('azurdesk_token');
  location.reload();
}

if (token) {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}
