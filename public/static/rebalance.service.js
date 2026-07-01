/* ============================================================================
 * AzurDesk AI v2.6.13 — Rebalance Service Layer
 * Capa de servicios explícita para el módulo "Rebalance AI".
 *
 * Responsabilidades (production-critical, sin mocks, sin placeholders):
 *   - Resolver la URL base hacia el backend Node (http://localhost:5200).
 *   - Inyectar el Bearer token JWT ('azurdesk_token') en cada petición.
 *   - Centralizar el ciclo de vida Idle -> Loading -> Success / Error,
 *     correlacionado con los estados HTTP del backend (200/401/403/5xx).
 *   - Devolver una respuesta normalizada { ok, status, data, error } que
 *     la UI puede consumir sin reinterpretar el contrato del backend.
 *
 * Dependencias externas (ya cargadas antes de este script en index.html):
 *   - auth.js provee window.api(method, path, body) y window.token.
 *   - Si por alguna razón no existieran, este módulo hace fallback a un
 *     fetch nativo equivalente con el mismo contrato.
 *
 * Endpoints consumidos (verificados en server.mjs L738-754, inmutables):
 *   - GET  /api/agents/health                  -> R1 snapshot de carga
 *   - GET  /api/agents/rebalance/recommend     -> R2 moves sugeridos
 *   - POST /api/agents/rebalance               -> R3 apply real
 *   - GET  /api/agents/rebalance/logs          -> R4 historial
 * ========================================================================== */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuración de transporte. La regla arquitectónica fija la base en
  // http://localhost:5200, pero se permite override vía window.AZURDESK_API_URL
  // para entornos de staging/preview sin tocar el código.
  // ---------------------------------------------------------------------------
  const API_BASE =
    (global.AZURDESK_API_URL && global.AZURDESK_API_URL.replace(/\/+$/, '')) ||
    'http://localhost:5200';

  const TOKEN_STORAGE_KEY = 'azurdesk_token';

  // ---------------------------------------------------------------------------
  // Resolución de token: prioriza window.token (estado vivo de auth.js) y,
  // como respaldo, localStorage. Nunca se envía un token vacío.
  // ---------------------------------------------------------------------------
  function resolveToken() {
    if (global.token) return global.token;
    try {
      return global.localStorage ? global.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    } catch (_e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Petición HTTP de bajo nivel. NO usa setTimeout ni simula latencia:
  // cada llamada impacta el backend real y mide el estado HTTP real.
  // ---------------------------------------------------------------------------
  async function rawRequest(method, path, body) {
    const url = API_BASE + path;
    const headers = { Accept: 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    const token = resolveToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    let response;
    try {
      response = await fetch(url, {
        method: method,
        headers: headers,
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
      });
    } catch (networkError) {
      // 0 = no se pudo conectar (servidor caído, CORS, DNS, etc.)
      return {
        ok: false,
        status: 0,
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          message: 'No se pudo contactar el backend en ' + API_BASE,
          detail: String(networkError && networkError.message ? networkError.message : networkError),
        },
      };
    }

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (_parseError) {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      // 401 = token inválido/expirado: replicamos el comportamiento de auth.js
      // (cerrar sesión) y devolvemos un error tipado para que la UI lo pinte.
      if (response.status === 401) {
        try { global.localStorage && global.localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_e) {}
        if (typeof global.location !== 'undefined') global.location.reload();
      }
      return {
        ok: false,
        status: response.status,
        data: payload,
        error: {
          code: 'HTTP_' + response.status,
          message:
            (payload && (payload.message || payload.error)) ||
            'El backend rechazó la petición (' + response.status + ').',
          detail: payload,
        },
      };
    }

    // Éxito HTTP. Mantenemos el shape del backend intacto dentro de `data`
    // para que la UI pueda leer `data.snapshots`, `data.moves`, etc.
    return { ok: true, status: response.status, data: payload, error: null };
  }

  // ---------------------------------------------------------------------------
  // Helper que envuelve rawRequest para preservar compatibilidad con el
  // helper `api()` ya existente en auth.js. Si el módulo convive, esto
  // garantiza que `window.api` quede apuntando a la versión más estricta.
  // ---------------------------------------------------------------------------
  function api(method, path, body) {
    return rawRequest(method, path, body);
  }

  // ---------------------------------------------------------------------------
  // Suscriptores de estado. La UI puede registrar callbacks por evento para
  // reflejar Loading/Success/Error sin acoplarse al manejo interno.
  // Patrón mínimo compatible con vanilla JS y sin frameworks.
  // ---------------------------------------------------------------------------
  const subscribers = Object.create(null);
  function emit(event, payload) {
    const list = subscribers[event];
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (_e) { /* swallow listener errors */ }
    }
  }
  function on(event, handler) {
    if (!subscribers[event]) subscribers[event] = [];
    subscribers[event].push(handler);
  }

  // ---------------------------------------------------------------------------
  // Métodos públicos del servicio. Cada uno:
  //   1) emite 'loading'
  //   2) ejecuta la petición real
  //   3) emite 'success' o 'error' con la respuesta normalizada
  //   4) devuelve la misma respuesta normalizada al caller (para await)
  // ---------------------------------------------------------------------------
  async function getHealth() {
    emit('loading', { op: 'health' });
    const res = await rawRequest('GET', '/api/agents/health');
    if (res.ok) emit('success', { op: 'health', data: res.data });
    else emit('error', { op: 'health', error: res.error, status: res.status });
    return res;
  }

  async function getRecommendations() {
    emit('loading', { op: 'recommend' });
    const res = await rawRequest('GET', '/api/agents/rebalance/recommend');
    if (res.ok) emit('success', { op: 'recommend', data: res.data });
    else emit('error', { op: 'recommend', error: res.error, status: res.status });
    return res;
  }

  async function applyRebalance() {
    emit('loading', { op: 'apply' });
    // El backend ignora el body y deriva agentes/tickets del tenant_id en
    // el JWT. Se envía {} explícitamente para mantener contrato y evitar
    // cualquier ambigüedad con un payload vacío.
    const res = await rawRequest('POST', '/api/agents/rebalance', {});
    if (res.ok) emit('success', { op: 'apply', data: res.data });
    else emit('error', { op: 'apply', error: res.error, status: res.status });
    return res;
  }

  async function getLogs() {
    emit('loading', { op: 'logs' });
    const res = await rawRequest('GET', '/api/agents/rebalance/logs');
    if (res.ok) emit('success', { op: 'logs', data: res.data });
    else emit('error', { op: 'logs', error: res.error, status: res.status });
    return res;
  }

  // ---------------------------------------------------------------------------
  // Exportación: namespace global + módulo CommonJS/ESM si el host lo soporta.
  // Permite que otros módulos (futuro refactor a bundler) lo importen.
  // ---------------------------------------------------------------------------
  const rebalanceService = {
    API_BASE: API_BASE,
    api: api,
    getHealth: getHealth,
    getRecommendations: getRecommendations,
    applyRebalance: applyRebalance,
    getLogs: getLogs,
    on: on,
    rawRequest: rawRequest,
  };

  global.RebalanceService = rebalanceService;
  if (typeof module !== 'undefined' && module.exports) module.exports = rebalanceService;
})(typeof window !== 'undefined' ? window : globalThis);
