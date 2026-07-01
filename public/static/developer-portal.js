// Developer Portal — in-app view for tenants to manage their AaaS account.
// Renders API keys, usage, billing, and plan upgrade UI inside the existing
// dashboard shell (uses auth.js for JWT + the admin session).

import { listPlans, getSubscription, getUsage, listInvoices, getProviderInfo } from './billingV2Service.js';
import { listApiKeys, createApiKey, revokeApiKey } from './apiKeyService.js';

const API_BASE = 'http://localhost:5200';

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'onclick') e.onclick = v;
    else if (k.startsWith('data-')) e.setAttribute(k, v);
    else e[k] = v;
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function showToast(msg, kind = 'info') {
  const t = el('div', { class: `toast toast-${kind}` }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

async function api(method, path, body) {
  const token = localStorage.getItem('azurdesk_token');
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function fmtUsd(n) {
  if (n == null) return '$0.00';
  return `$${Number(n).toFixed(2)}`;
}

function fmtNum(n) {
  if (n == null) return '0';
  if (n === Infinity) return '∞';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export async function renderDeveloperPortal(main) {
  main.innerHTML = '';
  const root = el('div', { class: 'dev-portal' });
  main.appendChild(root);

  // Header
  root.appendChild(el('h1', {}, 'Developer Portal'));
  root.appendChild(el('p', { class: 'subtitle' }, 'Manage API keys, view usage, and upgrade your plan.'));

  // Current plan section
  const planSection = el('div', { class: 'card' });
  planSection.appendChild(el('h2', {}, 'Current Plan'));
  const planContent = el('div', { class: 'plan-content', 'data-loading': 'true' }, 'Loading...');
  planSection.appendChild(planContent);
  root.appendChild(planSection);

  // Usage section
  const usageSection = el('div', { class: 'card' });
  usageSection.appendChild(el('h2', {}, 'Usage This Period'));
  const usageContent = el('div', { class: 'usage-content', 'data-loading': 'true' }, 'Loading...');
  usageSection.appendChild(usageContent);
  root.appendChild(usageSection);

  // API keys section
  const keysSection = el('div', { class: 'card' });
  keysSection.appendChild(el('h2', {}, 'API Keys'));
  const keysContent = el('div', { class: 'keys-content', 'data-loading': 'true' }, 'Loading...');
  const createKeyBtn = el('button', {
    class: 'btn-primary',
    onclick: () => showCreateKeyDialog(keysContent)
  }, '+ New API Key');
  keysSection.appendChild(createKeyBtn);
  keysSection.appendChild(keysContent);
  root.appendChild(keysSection);

  // Invoices section
  const invSection = el('div', { class: 'card' });
  invSection.appendChild(el('h2', {}, 'Invoices'));
  const invContent = el('div', { class: 'invoices-content', 'data-loading': 'true' }, 'Loading...');
  invSection.appendChild(invContent);
  root.appendChild(invSection);

  // Plans comparison
  const plansSection = el('div', { class: 'card' });
  plansSection.appendChild(el('h2', {}, 'Available Plans'));
  const plansContent = el('div', { class: 'plans-grid' });
  plansSection.appendChild(plansContent);
  root.appendChild(plansSection);

  // ── Load all data in parallel ──
  try {
    const [subscription, usage, keys, invoices, plans] = await Promise.all([
      api('GET', '/v1/billing/subscription'),
      api('GET', '/v1/billing/usage'),
      api('GET', '/v1/api-keys'),
      api('GET', '/v1/billing/invoices'),
      api('GET', '/v1/billing/plans')
    ]);
    renderPlan(planContent, subscription, plans.plans);
    renderUsage(usageContent, usage.usage);
    renderKeys(keysContent, keys.keys, createKeyBtn);
    renderInvoices(invContent, invoices.invoices);
    renderPlansGrid(plansContent, plans.plans, subscription.subscription);
  } catch (e) {
    root.appendChild(el('div', { class: 'error' }, `Failed to load portal: ${e.message}`));
  }
}

function renderPlan(container, { subscription }, { plans }) {
  container.innerHTML = '';
  const current = plans.find((p) => p.id === (subscription?.plan_id || 'free')) || plans[0];
  const isUpgrade = current.id !== 'free';
  container.appendChild(el('div', { class: 'plan-card' },
    el('div', { class: 'plan-name' }, current.name),
    el('div', { class: 'plan-price' }, current.price_usd == null ? 'Custom' : `$${current.price_usd}/mo`),
    el('div', { class: 'plan-quota' }, `${fmtNum(current.monthly_quota)} requests/mo · ${current.rate_per_minute} req/min`),
    subscription?.status === 'active' ? el('span', { class: 'badge badge-success' }, 'Active') : el('span', { class: 'badge' }, 'Free tier')
  ));
  if (current.cancel_at_period_end) {
    container.appendChild(el('div', { class: 'warning' }, 'Your subscription will cancel at the end of the current period.'));
  }
}

function renderUsage(container, usage) {
  container.innerHTML = '';
  const pct = usage.quota === Infinity ? 0 : Math.min(100, (usage.used / usage.quota) * 100);
  const bar = el('div', { class: 'usage-bar' },
    el('div', { class: 'usage-fill', style: `width:${pct}%` })
  );
  container.appendChild(el('div', { class: 'usage-stats' },
    el('div', { class: 'usage-numbers' },
      el('strong', {}, fmtNum(usage.used)),
      ' / ',
      el('span', { class: 'muted' }, fmtNum(usage.quota)),
      ' requests this month'
    ),
    el('div', { class: 'usage-pct' }, usage.quota === Infinity ? 'Unlimited' : `${pct.toFixed(1)}%`)
  ));
  container.appendChild(bar);
  if (usage.breakdown?.length > 0) {
    const table = el('table', { class: 'breakdown' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Endpoint'),
        el('th', {}, 'Calls'),
        el('th', {}, 'Tokens in'),
        el('th', {}, 'Tokens out')
      )),
      el('tbody', {}, ...usage.breakdown.map((b) => el('tr', {},
        el('td', { class: 'mono' }, b.endpoint),
        el('td', { class: 'mono' }, fmtNum(b.calls)),
        el('td', { class: 'mono' }, fmtNum(b.tokens_in)),
        el('td', { class: 'mono' }, fmtNum(b.tokens_out))
      )))
    );
    container.appendChild(table);
  }
  if (usage.totals?.cost_usd > 0) {
    container.appendChild(el('div', { class: 'cost-line' },
      'Inference cost: ', el('strong', {}, fmtUsd(usage.totals.cost_usd)),
      ' · Billed: ', el('strong', {}, fmtUsd(usage.totals.billed_usd))
    ));
  }
}

function renderKeys(container, keys, createBtn) {
  container.innerHTML = '';
  if (!keys.length) {
    container.appendChild(el('div', { class: 'empty' }, 'No API keys yet. Click "New API Key" to create one.'));
    return;
  }
  const table = el('table', { class: 'keys-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Name'),
      el('th', {}, 'Prefix'),
      el('th', {}, 'Scopes'),
      el('th', {}, 'Created'),
      el('th', {}, 'Last used'),
      el('th', {}, '')
    )),
    el('tbody', {}, ...keys.map((k) => el('tr', {},
      el('td', {}, k.name),
      el('td', { class: 'mono' }, k.key_prefix + '…'),
      el('td', { class: 'mono small' }, (k.scopes || []).join(', ')),
      el('td', { class: 'muted small' }, k.created_at?.slice(0, 10) || '—'),
      el('td', { class: 'muted small' }, k.last_used_at?.slice(0, 16).replace('T', ' ') || 'never'),
      el('td', {},
        el('button', {
          class: 'btn-danger-sm',
          onclick: async () => {
            if (!confirm(`Revoke key "${k.name}"? This cannot be undone.`)) return;
            try {
              await api('DELETE', `/v1/api-keys/${k.id}`);
              showToast('Key revoked', 'success');
              const refreshed = await api('GET', '/v1/api-keys');
              renderKeys(container, refreshed.keys, createBtn);
            } catch (e) { showToast(e.message, 'error'); }
          }
        }, 'Revoke')
      )
    )))
  );
  container.appendChild(table);
}

function renderInvoices(container, invoices) {
  container.innerHTML = '';
  if (!invoices.length) {
    container.appendChild(el('div', { class: 'empty' }, 'No invoices yet. Invoices are generated at the end of each billing period or when usage exceeds the monthly quota.'));
    return;
  }
  const table = el('table', { class: 'invoices-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Period'),
      el('th', {}, 'Plan'),
      el('th', {}, 'Amount'),
      el('th', {}, 'Status'),
      el('th', {}, 'Created')
    )),
    el('tbody', {}, ...invoices.map((inv) => el('tr', {},
      el('td', { class: 'mono' }, inv.period),
      el('td', {}, inv.plan_id),
      el('td', { class: 'mono' }, fmtUsd(inv.amount_usd)),
      el('td', {}, el('span', { class: `badge badge-${inv.status}` }, inv.status)),
      el('td', { class: 'muted small' }, inv.created_at?.slice(0, 10) || '—')
    )))
  );
  container.appendChild(table);
}

function renderPlansGrid(container, plans, currentSub) {
  container.innerHTML = '';
  for (const plan of plans) {
    const isCurrent = (currentSub?.plan_id || 'free') === plan.id;
    const card = el('div', { class: `plan-option ${isCurrent ? 'current' : ''}` },
      el('h3', {}, plan.name),
      el('div', { class: 'plan-price' }, plan.price_usd == null ? 'Custom' : `$${plan.price_usd}/mo`),
      el('ul', {}, ...plan.features.map((f) => el('li', {}, f))),
      isCurrent
        ? el('button', { class: 'btn-secondary', disabled: true }, 'Current Plan')
        : el('button', {
            class: 'btn-primary',
            onclick: () => upgradePlan(plan.id)
          }, plan.price_usd == null ? 'Contact sales' : (plan.id === 'free' ? 'Downgrade' : 'Upgrade'))
    );
    container.appendChild(card);
  }
}

async function upgradePlan(planId) {
  if (planId === 'enterprise') {
    window.location.href = 'mailto:api@azurdesk.ai?subject=Enterprise plan inquiry';
    return;
  }
  if (!confirm(`Switch to ${planId} plan? Your existing API keys will inherit the new rate limits immediately.`)) return;
  try {
    await api('POST', '/v1/billing/subscription', { plan_id: planId });
    showToast(`Subscribed to ${planId} plan`, 'success');
    setTimeout(() => location.reload(), 1000);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function showCreateKeyDialog(keysContainer) {
  const name = prompt('Name for the new API key:');
  if (!name) return;
  api('POST', '/v1/api-keys', { name, environment: 'live' })
    .then((res) => {
      const secret = res.key.key;
      const prefix = res.key.key_prefix;
      const dialog = el('div', { class: 'key-created-modal' },
        el('div', { class: 'modal-content' },
          el('h3', {}, 'API key created'),
          el('p', {}, 'Copy this key now — you will not be able to see it again.'),
          el('pre', { class: 'key-display' }, secret),
          el('div', { class: 'modal-actions' },
            el('button', { class: 'btn-primary', onclick: () => {
              navigator.clipboard.writeText(secret);
              showToast('Copied to clipboard', 'success');
            } }, 'Copy'),
            el('button', { class: 'btn-secondary', onclick: () => {
              document.querySelector('.key-created-modal')?.remove();
              api('GET', '/v1/api-keys').then((r) => renderKeys(keysContainer, r.keys, null));
            } }, 'Done')
          )
        )
      );
      document.body.appendChild(dialog);
    })
    .catch((e) => showToast(e.message, 'error'));
}

if (typeof window !== 'undefined') {
  window.AzurDeskDeveloperPortal = { renderDeveloperPortal };
}
