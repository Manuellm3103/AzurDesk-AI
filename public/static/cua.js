async function cuaApi(action, body) {
  const r = await fetch('/api/cua/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Error CUA');
  return r.json();
}

function setCuaStatus(msg) {
  document.getElementById('cua-status').textContent = msg;
}

async function cuaCapture() {
  setCuaStatus('Capturando...');
  const app = document.getElementById('cua-app').value || undefined;
  const mode = document.getElementById('cua-mode').value;
  try {
    const data = await cuaApi('capture', { app, mode });
    const wrap = document.getElementById('cua-image-wrap');
    if (data.screenshot_path) {
      wrap.innerHTML = `<img src="data:image/png;base64,${await fetchImage(data.screenshot_path)}" alt="captura" />`;
    } else if (data.image) {
      wrap.innerHTML = `<img src="${data.image}" alt="captura" />`;
    } else {
      wrap.innerHTML = '<p>Captura sin imagen</p>';
    }
    document.getElementById('cua-result').textContent = JSON.stringify(data, null, 2);
    setCuaStatus('Captura lista');
  } catch (e) {
    setCuaStatus('Error: ' + e.message);
  }
}

async function fetchImage(pathOrUrl) {
  if (pathOrUrl.startsWith('http')) {
    const r = await fetch(pathOrUrl);
    const blob = await r.blob();
    return await blobToBase64(blob);
  }
  const r = await fetch('/api/cua/image?path=' + encodeURIComponent(pathOrUrl));
  const blob = await r.blob();
  return await blobToBase64(blob);
}

function blobToBase64(blob) {
  return new Promise((res) => {
    const reader = new FileReader();
    reader.onloadend = () => res(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

async function cuaClick() {
  const app = document.getElementById('cua-target-app').value || undefined;
  const element = document.getElementById('cua-element').value || undefined;
  const coordinate = parseCoordinate(document.getElementById('cua-coordinate').value);
  const body = { app };
  if (element) body.element = Number(element);
  if (coordinate) body.coordinate = coordinate;
  const data = await cuaApi('click', body);
  document.getElementById('cua-result').textContent = JSON.stringify(data, null, 2);
}

async function cuaType() {
  const app = document.getElementById('cua-target-app').value || undefined;
  const element = document.getElementById('cua-element').value || undefined;
  const coordinate = parseCoordinate(document.getElementById('cua-coordinate').value);
  const text = document.getElementById('cua-text').value;
  const body = { app, text };
  if (element) body.element = Number(element);
  if (coordinate) body.coordinate = coordinate;
  const data = await cuaApi('type', body);
  document.getElementById('cua-result').textContent = JSON.stringify(data, null, 2);
}

async function cuaKey() {
  const app = document.getElementById('cua-target-app').value || undefined;
  const keys = document.getElementById('cua-keys').value;
  const data = await cuaApi('key', { app, keys });
  document.getElementById('cua-result').textContent = JSON.stringify(data, null, 2);
}

async function cuaScroll(direction) {
  const app = document.getElementById('cua-target-app').value || undefined;
  const data = await cuaApi('scroll', { app, direction, amount: 3 });
  document.getElementById('cua-result').textContent = JSON.stringify(data, null, 2);
}

function parseCoordinate(s) {
  if (!s) return null;
  const [x, y] = s.split(',').map((v) => Number(v.trim()));
  if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  return null;
}

window.AzurViews = window.AzurViews || {};
window.AzurViews.cua = `<h1>Computer Use (CUA)</h1><p>Controla el escritorio remoto desde el navegador. Modo background — no roba el foco del usuario.</p>
    <div class="toolbar">
      <input type="text" id="cua-app" placeholder="App (opcional, ej: Chrome)" />
      <select id="cua-mode"><option value="vision">Screenshot</option><option value="som">SOM con overlays</option></select>
      <button onclick="cuaCapture()">📸 Capturar</button>
    </div>
    <div id="cua-status"></div>
    <div class="cua-workspace">
      <div id="cua-image-wrap"></div>
      <div class="cua-controls">
        <h3>Acciones</h3>
        <label>App objetivo</label><input type="text" id="cua-target-app" placeholder="Chrome" />
        <label>Elemento (índice SOM)</label><input type="number" id="cua-element" min="1" />
        <label>Coordenada X,Y</label><input type="text" id="cua-coordinate" placeholder="800,450" />
        <label>Texto</label><input type="text" id="cua-text" placeholder="Hola mundo" />
        <label>Key combo</label><input type="text" id="cua-keys" placeholder="ctrl+t" />
        <div class="btn-row"><button onclick="cuaClick()">🖱️ Click</button><button onclick="cuaType()">⌨️ Type</button><button onclick="cuaKey()">🔑 Key</button></div>
        <div class="btn-row"><button onclick="cuaScroll('up')">⬆️ Up</button><button onclick="cuaScroll('down')">⬇️ Down</button></div>
        <pre id="cua-result"></pre>
      </div>
    </div>`;

if (typeof window !== 'undefined') {
  window.cuaCapture = cuaCapture;
  window.cuaClick = cuaClick;
  window.cuaType = cuaType;
  window.cuaKey = cuaKey;
  window.cuaScroll = cuaScroll;
}
