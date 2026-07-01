async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 204) return {};
  return r.json().catch(() => ({}));
}

window.AzurViews = window.AzurViews || {};
window.AzurViews.skills = `
    <h2>Simplicio-Loop Orchestrator</h2>
    <div class="card">
      <input id="orch-goal" type="text" placeholder="Meta: integrar pagos Stripe" style="width:60%" />
      <button onclick="startOrch()">Iniciar Loop</button>
      <button class="secondary" onclick="loadRuns()">Recargar</button>
    </div>
    <div id="orch-runs" class="card"></div>
    <hr>
    <h2>Simplicio-Review</h2>
    <textarea id="review-code" rows="8" placeholder="Pega código JS aquí...">const password='secret';\neval(x);\nconsole.log(x);</textarea>
    <button onclick="runReview()">Revisar (quality, security, efficiency)</button>
    <pre id="review-result"></pre>
    <hr>
    <h2>Obsidian Vault</h2>
    <input id="obs-title" type="text" placeholder="Título nota" />
    <textarea id="obs-content" rows="4" placeholder="Contenido markdown..."># soporte\ncontactar a TI #urgente</textarea>
    <button onclick="writeObsidian()">Guardar nota</button>
    <button class="secondary" onclick="syncObsidian()">Sync → KB</button>
    <ul id="obs-notes"></ul>`;

async function startOrch() {
  const goal = document.getElementById('orch-goal').value;
  if (!goal) return alert('Escribe una meta');
  const r = await api('POST', '/api/orchestrator/runs', { goal });
  await loadRuns();
  // avanzar por todos los estados con gates
  const id = r.run.id;
  await api('POST', `/api/orchestrator/runs/${id}/advance`, { evidence: { discover: 'done' } });
  await api('POST', `/api/orchestrator/runs/${id}/advance`, { evidence: { implement: 'done' } });
  await api('POST', `/api/orchestrator/runs/${id}/advance`, { evidence: { verify: 'pass' }, gates: { quality: true, safety: true, token: true } });
  await api('POST', `/api/orchestrator/runs/${id}/advance`, { evidence: { merge: 'merged' } });
  await loadRuns();
}

async function loadRuns() {
  const r = await api('GET', '/api/orchestrator/runs');
  const el = document.getElementById('orch-runs');
  el.innerHTML = (r.runs || []).map((run) => `
    <div class="orch-run">
      <strong>${run.goal}</strong> — estado: <span class="orch-state">${run.state}</span>
      <br/>Gates: quality=${run.quality_gate} safety=${run.safety_gate} token=${run.token_gate}
    </div>`).join('') || 'Sin runs';
}

async function runReview() {
  const code = document.getElementById('review-code').value;
  const r = await api('POST', '/api/review', { code });
  const result = document.getElementById('review-result');
  result.innerHTML = `<strong>Overall: <span class="${r.review.overall ? 'review-pass' : 'review-fail'}">${r.review.overall ? 'PASS' : 'FAIL'}</span></strong>\n` +
    (r.review.summary || []).map((s) => `• ${s.rubric}: <span class="${s.pass ? 'review-pass' : 'review-fail'}">${s.pass ? 'PASS' : 'FAIL'}</span> ${s.findings.join(', ') || ''}`).join('\n');
}

async function writeObsidian() {
  const title = document.getElementById('obs-title').value;
  const content = document.getElementById('obs-content').value;
  if (!title || !content) return alert('Título y contenido requeridos');
  await api('POST', '/api/obsidian/notes', { title, content });
  await loadObsidian();
}

async function syncObsidian() {
  const r = await api('POST', '/api/obsidian/sync', {});
  alert('Sync completado: ' + (r.synced || []).length + ' notas');
  await loadObsidian();
}

async function loadObsidian() {
  const r = await api('GET', '/api/obsidian/notes?folder=AzurDesk');
  document.getElementById('obs-notes').innerHTML = (r.notes || []).map((n) => `<li>${n.path} (${n.size} bytes)</li>`).join('') || '<li>No hay notas</li>';
}
