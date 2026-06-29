import { execFile } from 'child_process';
import { promisify } from 'util';
import { now } from './_utils.js';

const execFileAsync = promisify(execFile);
const CUA_DRIVER = process.env.CUA_DRIVER_PATH || 'cua-driver';

function parseJson(stdout) {
  const text = (stdout || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return { raw: text };
  return JSON.parse(text.slice(start, end + 1));
}

async function cua(tool, args = {}) {
  const { stdout, stderr } = await execFileAsync(
    CUA_DRIVER,
    ['call', tool, '--json', JSON.stringify(args)],
    { timeout: 30000, maxBuffer: 8 * 1024 * 1024 }
  );
  if (stderr && stderr.trim()) console.error('CUA stderr:', stderr.trim());
  return parseJson(stdout);
}

class CUAService {
  async findApp(nameOrPid) {
    if (Number.isFinite(Number(nameOrPid))) {
      return { pid: Number(nameOrPid) };
    }
    try {
      const { apps } = await cua('list_apps', {});
      if (!apps || !Array.isArray(apps)) return null;
      const target = (nameOrPid || '').toLowerCase();
      const app = apps.find((a) => a.name.toLowerCase().includes(target) || (a.bundle_id || '').toLowerCase().includes(target) || String(a.pid) === target);
      if (app) return app;
      const active = apps.find((a) => a.active && a.pid);
      if (active) return active;
      return null;
    } catch (err) {
      console.error('CUA list_apps error:', err.message);
      return null;
    }
  }

  async findWindow(pid) {
    if (!pid) return null;
    try {
      const { _legacy_windows: windows = [] } = await cua('list_windows', {});
      return windows.find((w) => w.pid === pid) || null;
    } catch (err) {
      console.error('CUA list_windows error:', err.message);
      return null;
    }
  }

  async capture({ app, mode = 'vision', max_elements } = {}) {
    const target = await this.findApp(app);
    if (!target || !target.pid) return { success: false, error: 'No se encontró una aplicación activa' };
    const win = await this.findWindow(target.pid);
    if (!win) return { success: false, error: 'La aplicación no tiene ventanas visibles' };
    const args = { pid: target.pid, window_id: win.window_id };
    if (max_elements) args.max_elements = max_elements;
    const state = await cua('get_window_state', args);
    return {
      success: true,
      app: target.name,
      pid: target.pid,
      window_id: win.window_id,
      width: state.screenshot_width || 0,
      height: state.screenshot_height || 0,
      image_b64: state.screenshot_png_b64 || '',
      elements: state.elements || null,
      mode
    };
  }

  async click({ app, element, coordinate, button = 'left' } = {}) {
    const target = await this.findApp(app);
    if (!target) return { success: false, error: 'App no encontrada' };
    const args = { pid: target.pid, button };
    if (element) args.element_index = Number(element);
    else if (coordinate) { args.x = coordinate[0]; args.y = coordinate[1]; }
    const r = await cua('click', args);
    return { success: true, ...r };
  }

  async type({ app, element, coordinate, text } = {}) {
    const target = await this.findApp(app);
    if (!target) return { success: false, error: 'App no encontrada' };
    const args = { pid: target.pid, text: text || '' };
    if (element) args.element_index = Number(element);
    else if (coordinate) { args.x = coordinate[0]; args.y = coordinate[1]; }
    const r = await cua('type_text', args);
    return { success: true, ...r };
  }

  async key({ app, keys } = {}) {
    const target = await this.findApp(app);
    if (!target) return { success: false, error: 'App no encontrada' };
    const parts = (keys || '').split(/\s*\+\s*/);
    if (parts.length > 1) {
      const r = await cua('hotkey', { pid: target.pid, keys: parts });
      return { success: true, ...r };
    }
    const r = await cua('press_key', { pid: target.pid, key: parts[0] || '' });
    return { success: true, ...r };
  }

  async scroll({ app, direction = 'down', amount = 3 } = {}) {
    const target = await this.findApp(app);
    if (!target) return { success: false, error: 'App no encontrada' };
    const r = await cua('scroll', { pid: target.pid, direction, amount: Number(amount) });
    return { success: true, ...r };
  }
}

export default new CUAService();
