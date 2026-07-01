window.AzurViews = window.AzurViews || {};
window.AzurViews.docs = `
    <h2>Documentos OCR</h2>
    <div class="card">
      <h3>Subir archivo</h3>
      <input type="file" id="doc-file" accept=".pdf,.docx,.doc,.txt" />
      <label><input type="checkbox" id="doc-ocr" /> Forzar OCR (marker-pdf si disponible)</label>
      <button onclick="uploadDoc()">Extraer texto</button>
      <pre id="doc-result"></pre>
    </div>
    <div class="card">
      <h3>Extraer desde URL</h3>
      <input id="doc-url" type="text" placeholder="https://example.com/report.pdf" style="width:80%" />
      <button onclick="extractUrl()">Extraer URL</button>
      <pre id="doc-url-result"></pre>
    </div>
    <div class="card">
      <h3>Documentos procesados</h3>
      <ul id="doc-list"></ul>
    </div>`;

async function uploadDoc() {
  const fileInput = document.getElementById('doc-file');
  const ocr = document.getElementById('doc-ocr').checked;
  const file = fileInput.files[0];
  if (!file) return alert('Selecciona un archivo');
  const form = new FormData();
  form.append('file', file);
  form.append('ocr', ocr ? 'true' : 'false');
  const r = await fetch('/api/documents', {
    method: 'POST',
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: form
  });
  const j = await r.json();
  document.getElementById('doc-result').textContent = JSON.stringify(j, null, 2);
  await loadDocs();
}

async function extractUrl() {
  const url = document.getElementById('doc-url').value;
  if (!url) return alert('URL requerida');
  const r = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ url })
  });
  const j = await r.json();
  document.getElementById('doc-url-result').textContent = JSON.stringify(j, null, 2);
}

async function loadDocs() {
  const r = await fetch('/api/documents', { headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  const j = await r.json();
  document.getElementById('doc-list').innerHTML = (j.documents || []).map((d) => `
    <li>${d.filename} (${d.ext}) — ${d.source || 'unknown'} — ${d.size} bytes</li>`).join('') || '<li>Sin documentos</li>';
}
