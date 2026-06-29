import { randomUUID } from 'crypto';
import db from './db.js';
import { now, safeJson, parseJsonRobust } from './_utils.js';
import aaasRouter from './aaasRouterService.js';

const KINDS = ['content', 'webpage', 'design', 'trending', 'lead'];

const PROMPTS = {
  content: (ctx) => `Eres un content marketer senior. Crea ${ctx.count || 1} pieza(s) de contenido para ${ctx.brand || 'la marca'} dirigida a ${ctx.audience || 'público general'} sobre el tema "${ctx.topic || 'producto'}". Para cada pieza devuelve: título, canal (${ctx.channels?.join(', ') || 'blog'}), tono, hook, borrador de 200 palabras y 3 hashtags. Responde SOLO en JSON array.`,
  webpage: (ctx) => `Eres un growth hacker y copywriter. Diseña una landing page para ${ctx.goal || 'captar leads'} dirigida a ${ctx.audience || 'público general'}. Devuelve JSON con: headline, subheadline, cta_primary, cta_secondary, secciones (array de {name, copy, cta}), testimonial_placeholder, form_fields.`,
  design: (ctx) => `Eres un brand designer. Crea un brief creativo para ${ctx.brand || 'la marca'} con estilo ${ctx.style || 'moderno, minimalista, tech'}. Devuelve JSON con: palette (array de 5 hex), typography (primary, secondary), imagery_style, iconography, voice_and_tone, do_and_dont (array de 3 cada uno).`,
  trending: (ctx) => `Eres un analista de mercado. Investiga tendencias actuales en "${ctx.topic || 'tecnología'}" para ${ctx.audience || 'B2B'}. Devuelve JSON con: keywords (10), topics (5 con volumen estimado alto/medio/bajo), angles (3 hooks de contenido), competitor_gaps (3 oportunidades).`,
  lead: (ctx) => `Eres un demand gen specialist. Diseña una campaña de lead generation para ${ctx.goal || 'captar leads'} dirigida a ${ctx.audience || 'público general'}. Devuelve JSON con: offer, channels (array), ad_copy_variants (3), landing_hook, nurture_sequence (3 emails con subject y body de 80 palabras), scoring_criteria (5 puntos).`
};

async function runAgent(tenant_id, kind, ctx = {}, { preferred, strategy } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`Tipo de agente no soportado: ${kind}`);
  const prompt = PROMPTS[kind](ctx);
  const result = await aaasRouter.generate(tenant_id, {
    prompt,
    system: 'Eres un asistente de marketing enterprise. Responde ÚNICAMENTE en JSON válido, sin comentarios ni markdown.',
    complexity: 'medium',
    preferred,
    strategy,
    max_tokens: 4096
  });
  if (!result.success) return { success: false, error: result.error };
  const content = parseJsonRobust(result.text);
  const asset = createAsset(tenant_id, kind, ctx.topic || ctx.goal || kind, prompt, result.text, {
    parsed: content,
    provider: result.provider,
    model: result.model,
    latency_ms: result.latency_ms,
    cost_usd: result.cost_usd
  });
  return { success: true, kind, content, raw: result.text, asset_id: asset.id, provider: result.provider, model: result.model };
}

function createAsset(tenant_id, kind, title, prompt, content, metadata = {}) {
  const id = randomUUID();
  db.prepare(`INSERT INTO marketing_assets (id, tenant_id, kind, title, prompt, content, metadata, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, kind, title, prompt, content, JSON.stringify(metadata), 'draft', now(), now());
  return getAsset(id, tenant_id);
}

function getAsset(id, tenant_id) {
  const row = db.prepare('SELECT * FROM marketing_assets WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
  if (!row) return null;
  return rowToAsset(row);
}

function listAssets(tenant_id, { kind, status, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM marketing_assets WHERE tenant_id = ?';
  const params = [tenant_id];
  if (kind) { sql += ' AND kind = ?'; params.push(kind); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  return db.prepare(sql).all(...params, limit, offset).map(rowToAsset);
}

function updateAssetStatus(id, tenant_id, status) {
  const result = db.prepare('UPDATE marketing_assets SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .run(status, now(), id, tenant_id);
  return result.changes > 0 ? getAsset(id, tenant_id) : null;
}

function createCampaign(tenant_id, { name, goal, target_audience, channels, schedule }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO marketing_campaigns (id, tenant_id, name, goal, target_audience, channels, schedule, assets, leads, metrics, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, tenant_id, name, goal, target_audience || null, JSON.stringify(channels || []), schedule || null, '[]', '[]', '{}', now(), now());
  return getCampaign(id, tenant_id);
}

function getCampaign(id, tenant_id) {
  const row = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND tenant_id = ?').get(id, tenant_id);
  if (!row) return null;
  return rowToCampaign(row);
}

function listCampaigns(tenant_id) {
  return db.prepare('SELECT * FROM marketing_campaigns WHERE tenant_id = ? ORDER BY created_at DESC').all(tenant_id).map(rowToCampaign);
}

function attachAsset(campaignId, tenant_id, assetId) {
  const campaign = getCampaign(campaignId, tenant_id);
  if (!campaign) return null;
  const assets = campaign.assets || [];
  if (!assets.includes(assetId)) assets.push(assetId);
  db.prepare('UPDATE marketing_campaigns SET assets = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .run(JSON.stringify(assets), now(), campaignId, tenant_id);
  return getCampaign(campaignId, tenant_id);
}

function addLead(campaignId, tenant_id, lead) {
  const campaign = getCampaign(campaignId, tenant_id);
  if (!campaign) return null;
  const leads = campaign.leads || [];
  leads.push({ ...lead, id: randomUUID(), created_at: now() });
  db.prepare('UPDATE marketing_campaigns SET leads = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .run(JSON.stringify(leads), now(), campaignId, tenant_id);
  return getCampaign(campaignId, tenant_id);
}

function rowToAsset(row) {
  const parsed = safeJson(row.content, null);
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    kind: row.kind,
    title: row.title,
    prompt: row.prompt,
    content: row.content,
    parsed,
    metadata: safeJson(row.metadata, {}),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function rowToCampaign(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    goal: row.goal,
    target_audience: row.target_audience,
    channels: safeJson(row.channels, []),
    schedule: row.schedule,
    status: row.status,
    assets: safeJson(row.assets, []),
    leads: safeJson(row.leads, []),
    metrics: safeJson(row.metrics, {}),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export {
  runAgent, KINDS, createAsset, getAsset, listAssets, updateAssetStatus,
  createCampaign, getCampaign, listCampaigns, attachAsset, addLead
};
export default { runAgent, KINDS, createAsset, getAsset, listAssets, updateAssetStatus, createCampaign, getCampaign, listCampaigns, attachAsset, addLead };
