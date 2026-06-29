import { randomUUID } from 'crypto';
import db from './db.js';
import authService from './authService.js';
import quotaService from './quotaService.js';
import auditService from './auditService.js';
import { now, randomId } from './_utils.js';

const PLANS = {
  free: { max_llm_calls_per_day: 100, max_llm_cost_per_day: 1.0, max_api_keys: 3, max_agents: 10, max_storage_mb: 256 },
  starter: { max_llm_calls_per_day: 500, max_llm_cost_per_day: 5.0, max_api_keys: 10, max_agents: 25, max_storage_mb: 512 },
  pro: { max_llm_calls_per_day: 2000, max_llm_cost_per_day: 20.0, max_api_keys: 25, max_agents: 100, max_storage_mb: 2048 },
  enterprise: { max_llm_calls_per_day: 10000, max_llm_cost_per_day: 100.0, max_api_keys: 100, max_agents: 500, max_storage_mb: 10240 }
};

export function signup({ email, password, company_name, plan = 'free' }) {
  if (!email || !password || !company_name) throw new Error('email, password y company_name son requeridos');
  if (!PLANS[plan]) throw new Error(`Plan inválido: ${plan}. Disponibles: ${Object.keys(PLANS).join(', ')}`);

  const existing = db.prepare('SELECT id FROM tenant_signups WHERE email = ?').get(email);
  if (existing) throw new Error('Email ya registrado');

  const tenant_id = randomId('tenant');
  const signup_id = randomId('signup');
  const token = randomUUID();

  db.prepare('INSERT INTO tenant_signups (id, tenant_id, email, company_name, plan, verification_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(signup_id, tenant_id, email, company_name, plan, token, now());

  // Create admin user for this tenant
  try {
    authService.createUser({ tenant_id, email, password, name: company_name, role: 'admin', level: 5 });
  } catch (e) {
    // If createUser fails, try direct insert
    db.prepare('INSERT INTO users (id, tenant_id, email, password_hash, name, role, level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomId('user'), tenant_id, email, authService.hashPassword(password), company_name, 'admin', 5, now());
  }

  // Initialize quota with plan defaults
  const planConfig = PLANS[plan];
  quotaService.updateQuota(tenant_id, planConfig);

  auditService.log({ tenant_id, actor_id: 'system', actor_type: 'system', action: 'tenant.signup', resource_type: 'tenant', resource_id: tenant_id, details: { email, company_name, plan } });

  return { tenant_id, email, company_name, plan, verification_token: token };
}

export function getSignup(tenant_id) {
  const row = db.prepare('SELECT * FROM tenant_signups WHERE tenant_id = ?').get(tenant_id);
  return row || null;
}

export function listSignups() {
  return db.prepare('SELECT * FROM tenant_signups ORDER BY created_at DESC').all();
}

export function upgradePlan(tenant_id, newPlan) {
  if (!PLANS[newPlan]) throw new Error(`Plan inválido: ${newPlan}`);
  db.prepare('UPDATE tenant_signups SET plan = ? WHERE tenant_id = ?').run(newPlan, tenant_id);
  quotaService.updateQuota(tenant_id, PLANS[newPlan]);
  auditService.log({ tenant_id, actor_id: 'system', action: 'tenant.upgrade', resource_type: 'tenant', resource_id: tenant_id, details: { new_plan: newPlan } });
  return { tenant_id, plan: newPlan };
}

export function getPlans() {
  return PLANS;
}

export default { signup, getSignup, listSignups, upgradePlan, getPlans };