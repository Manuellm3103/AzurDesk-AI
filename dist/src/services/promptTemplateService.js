import { randomUUID } from 'crypto';
import db from './db.js';
import { now, safeJson } from './_utils.js';
import aaasRouter from './aaasRouterService.js';

export function createTemplate(tenant_id, { name, category = 'general', system_prompt = '', user_template = '', variables = [], model_hint, temperature = 0.7, max_tokens = 2048 }) {
  if (!tenant_id || !name) throw new Error('tenant_id y name requeridos');
  const id = randomUUID();
  db.prepare(`INSERT INTO prompt_templates (id, tenant_id, name, category, system_prompt, user_template, variables, model_hint, temperature, max_tokens, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, name, category, system_prompt, user_template, JSON.stringify(variables), model_hint || null, temperature, max_tokens, now(), now());
  return getTemplate(id, tenant_id);
}

export function getTemplate(id, tenant_id) {
  const row = db.prepare('SELECT * FROM prompt_templates WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
  return row ? rowToTemplate(row) : null;
}

export function listTemplates(tenant_id, { category, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM prompt_templates WHERE tenant_id = ?';
  const params = [tenant_id];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  return db.prepare(sql).all(...params, limit, offset).map(rowToTemplate);
}

export function updateTemplate(id, tenant_id, fields) {
  const sets = []; const vals = [];
  for (const k of ['name', 'category', 'system_prompt', 'user_template', 'model_hint', 'temperature', 'max_tokens']) {
    if (fields[k] !== undefined) { sets.push(`${k}=?`); vals.push(fields[k]); }
  }
  if (fields.variables !== undefined) { sets.push('variables=?'); vals.push(JSON.stringify(fields.variables)); }
  if (!sets.length) return getTemplate(id, tenant_id);
  sets.push('updated_at=?'); vals.push(now()); vals.push(id, tenant_id);
  db.prepare(`UPDATE prompt_templates SET ${sets.join(', ')} WHERE id=? AND tenant_id=?`).run(...vals);
  return getTemplate(id, tenant_id);
}

export function deleteTemplate(id, tenant_id) {
  return db.prepare('DELETE FROM prompt_templates WHERE id = ? AND tenant_id = ?').run(id, tenant_id).changes > 0;
}

export function renderTemplate(template, vars = {}) {
  let system = template.system_prompt || '';
  let user = template.user_template || '';
  for (const [k, v] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g');
    system = system.replace(placeholder, String(v));
    user = user.replace(placeholder, String(v));
  }
  return { system, user };
}

export async function executeTemplate(tenant_id, templateId, vars = {}, options = {}) {
  const template = getTemplate(templateId, tenant_id);
  if (!template) return { success: false, error: 'Template no encontrado' };
  const rendered = renderTemplate(template, vars);
  const result = await aaasRouter.generate(tenant_id, {
    prompt: rendered.user,
    system: rendered.system,
    complexity: 'medium',
    preferred: template.model_hint || options.preferred,
    strategy: options.strategy || 'balanced',
    max_tokens: template.max_tokens,
    temperature: template.temperature
  });
  return { success: result.success, template: template.name, rendered, ...result };
}

function rowToTemplate(row) {
  return {
    id: row.id, tenant_id: row.tenant_id, name: row.name, category: row.category,
    system_prompt: row.system_prompt, user_template: row.user_template,
    variables: safeJson(row.variables, []), model_hint: row.model_hint,
    temperature: row.temperature, max_tokens: row.max_tokens,
    created_at: row.created_at, updated_at: row.updated_at
  };
}

export default { createTemplate, getTemplate, listTemplates, updateTemplate, deleteTemplate, renderTemplate, executeTemplate };