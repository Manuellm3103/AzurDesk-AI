function renderOllamaCloud(el) {
  el.innerHTML = `
    <h2>☁️ Ollama Cloud</h2>
    <div class="card" id="cloud-account-card">
      <p>Cargando cuenta...</p>
    </div>
    <div class="card">
      <h3>Conectar cuenta</h3>
      <input id="cloud-api-key" type="password" placeholder="Ollama Cloud API key" />
      <input id="cloud-email" placeholder="Email (opcional)" />
      <input id="cloud-nickname" placeholder="Apodo de la cuenta" />
      <input id="cloud-endpoint" placeholder="Endpoint (default: https://api.ollama.ai)" />
      <div class="btn-row">
        <button onclick="signInCloud()">🔐 Sign In</button>
        <button class="secondary" onclick="disconnectCloud()">Desconectar</button>
      </div>
      <pre id="cloud-signin-result"></pre>
    </div>
    <div class="card">
      <h3>Modelos disponibles</h3>
      <div class="btn-row">
        <button onclick="checkCloudConnection()">🔄 Refrescar modelos</button>
      </div>
      <ul id="cloud-models-list" class="ticket-list"></ul>
    </div>
    <div class="card">
      <h3>Probar generación</h3>
      <input id="cloud-gen-prompt" placeholder="Escribe un prompt..." value="Responde en español: ¿qué es Ollama?" />
      <div class="btn-row">
        <button onclick="generateCloud()">⚡ Generar</button>
      </div>
      <pre id="cloud-gen-result"></pre>
    </div>`;
  loadCloudAccount();
  loadCloudModels();
}

async function loadCloudAccount() {
  const r = await api('GET', '/api/ollama-cloud/account');
  const card = document.getElementById('cloud-account-card');
  if (!r.account) {
    card.innerHTML = '<p>No hay cuenta conectada.</p>';
    return;
  }
  card.innerHTML = `
    <strong>${r.account.nickname || 'Cuenta Cloud'}</strong> — <span class="badge" style="color:${r.account.status === 'connected' ? '#22c55e' : '#ef4444'}">${r.account.status}</span><br/>
    Email: ${r.account.email || '-'} <br/>
    Endpoint: ${r.account.endpoint} <br/>
    Modelo default: ${r.account.default_model || 'sin seleccionar'} <br/>
    Último check: ${r.account.last_check_at || 'nunca'}`;
}

async function signInCloud() {
  const body = {
    api_key: document.getElementById('cloud-api-key').value,
    email: document.getElementById('cloud-email').value,
    nickname: document.getElementById('cloud-nickname').value,
    endpoint: document.getElementById('cloud-endpoint').value
  };
  const r = await api('POST', '/api/ollama-cloud/signin', body);
  document.getElementById('cloud-signin-result').textContent = JSON.stringify(r, null, 2);
  loadCloudAccount();
  if (r.success) loadCloudModels();
}

async function disconnectCloud() {
  const r = await api('POST', '/api/ollama-cloud/disconnect', {});
  document.getElementById('cloud-signin-result').textContent = JSON.stringify(r, null, 2);
  loadCloudAccount();
  document.getElementById('cloud-models-list').innerHTML = '';
}

async function checkCloudConnection() {
  const r = await api('POST', '/api/ollama-cloud/check', {});
  document.getElementById('cloud-signin-result').textContent = JSON.stringify(r, null, 2);
  loadCloudAccount();
  loadCloudModels();
}

async function loadCloudModels() {
  const r = await api('GET', '/api/ollama-cloud/models');
  const ul = document.getElementById('cloud-models-list');
  if (!r.models?.length) {
    ul.innerHTML = '<li>Sin modelos. Conecta una cuenta primero.</li>';
    return;
  }
  ul.innerHTML = r.models.map((m) => `
    <li>
      <div>
        <strong>${m.name}</strong> <span class="badge">${m.size || '?'}</span><br/>
        <small>${m.description || ''}</small>
      </div>
      <button class="secondary" onclick="setDefaultCloudModel('${m.model_id}')">Default</button>
    </li>`).join('');
}

async function setDefaultCloudModel(model_id) {
  const r = await api('POST', '/api/ollama-cloud/default-model', { model_id });
  document.getElementById('cloud-signin-result').textContent = JSON.stringify(r, null, 2);
  loadCloudAccount();
}

async function generateCloud() {
  const prompt = document.getElementById('cloud-gen-prompt').value;
  const r = await api('POST', '/api/ollama-cloud/generate', { prompt });
  document.getElementById('cloud-gen-result').textContent = JSON.stringify(r, null, 2);
}
