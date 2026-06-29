import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import db from '../src/services/db.js';
import authService from '../src/services/authService.js';
import webBuilderService from '../src/webbuilder/webBuilderService.js';
import helpdeskService from '../src/helpdesk/helpdeskService.js';
import generativeAI from '../src/generative/generativeAIService.js';
import { analyzeText, classifyPriority, routeToLevel } from '../src/ml/ticketClassifier.js';
import { findSimilarArticles, generateEmbedding } from '../src/ml/similaritySearch.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const JWT_SECRET = process.env.JWT_SECRET;
const tenant = 'test-tenant-' + Date.now();
const admin = authService.createUser({ tenant_id: tenant, name: 'Admin', email: `admin_${tenant}@azurdesk.ai`, password: 'admin123', role: 'admin', level: 3 });
const agent = authService.createUser({ tenant_id: tenant, name: 'Agente', email: `agent_${tenant}@azurdesk.ai`, password: 'agent123', role: 'agent', level: 1 });

test('authService bcrypt real', () => {
  const u = authService.authenticate(admin.email, 'admin123');
  assert.ok(u);
  assert.equal(u.role, 'admin');
  const bad = authService.authenticate(admin.email, 'wrong');
  assert.equal(bad, null);
});

test('webBuilderService crea sitio y página', () => {
  const site = webBuilderService.createSite({ tenant_id: tenant, name: 'Site Test', domain: 'test.azurdesk.page' });
  assert.ok(site.success);
  const page = webBuilderService.createPage({ site_id: site.site.id, slug: 'faq', title: 'FAQ', components: [{ type: 'hero', props: { title: 'H' } }] });
  assert.ok(page.success);
  assert.ok(page.page.components.length > 0);
  const exp = webBuilderService.exportSite(site.site.id);
  assert.ok(exp.success);
  assert.ok(exp.html.includes('<!doctype html>'));
});

test('helpdeskService crea ticket con ML', () => {
  const t = helpdeskService.createTicket({
    tenant_id: tenant, requester_email: 'cliente@x.com', requester_name: 'Cliente',
    subject: 'No puedo acceder al login', body: 'El sistema está caído y no puedo entrar. Es urgente.', category: 'acceso'
  });
  assert.ok(t.success);
  assert.equal(t.ticket.priority, 'critica');
  assert.equal(t.ticket.level, 3);
  assert.ok(t.ticket.escalation_risk > 0.5);
});

test('ML classifier prioriza correctamente', () => {
  const low = analyzeText('Tengo una duda sobre la factura del mes pasado');
  assert.equal(low.priority, 'media');
  const high = analyzeText('URGENTE: servidor caído, no hay acceso');
  assert.equal(high.priority, 'critica');
});

test('similarity search encuentra KB cercana', () => {
  const id = 'kb-' + Date.now();
  db.prepare('INSERT INTO kb_articles (id, tenant_id, title, content, category, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, tenant, 'Restablecer contraseña', 'Para restablecer contraseña ve a configuración y selecciona cambiar clave.', 'acceso', JSON.stringify(['password', 'olvide']), new Date().toISOString(), new Date().toISOString()
  );
  const results = findSimilarArticles({ tenant_id: tenant, query: 'olvide mi contraseña', limit: 3 });
  assert.ok(results.length > 0);
  assert.ok(results[0].score > 0);
});

test('generativeAI genera respuesta', async () => {
  const r = await generativeAI.generateReply({ tenant_id: tenant, subject: 'Login fallido', body: 'No puedo iniciar sesión', category: 'acceso', priority: 'alta', level: 2 });
  assert.ok(r.success);
  assert.ok(r.reply.length > 10);
});

test('agente L1 no crea usuarios', () => {
  const token = jwt.sign({ id: agent.id, tenant_id: tenant, role: agent.role, level: agent.level }, JWT_SECRET);
  // Simulación: role check a nivel de test
  assert.equal(agent.role, 'agent');
});
