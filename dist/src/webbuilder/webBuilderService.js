import db from '../services/db.js';
import { randomUUID } from 'crypto';
import { now, safeJson } from '../services/_utils.js';

const DEFAULT_COMPONENTS = {
  hero: { type: 'hero', props: { title: 'Bienvenido', subtitle: 'Soporte inteligente', cta: 'Contactar', bg: '#0f172a', color: '#ffffff' } },
  features: { type: 'features', props: { items: [{ title: 'Soporte 24/7', text: 'AI + humanos' }, { title: 'Web Builder', text: 'Arrastra y suelta' }] } },
  faq: { type: 'faq', props: { questions: [{ q: '¿Cómo abro un ticket?', a: 'Usa el chat o el portal de soporte.' }] } },
  contact: { type: 'contact', props: { email: 'soporte@azurdesk.ai', phone: '+52 55 0000 0000' } }
};

class WebBuilderService {
  createSite({ tenant_id, name, domain, config = {} }) {
    const id = randomUUID();
    const t = now();
    db.prepare('INSERT INTO sites (id, tenant_id, name, domain, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, tenant_id, name, domain || `${id}.azurdesk.page`, JSON.stringify(config), t, t
    );
    // create default home page
    this.createPage({ site_id: id, slug: 'index', title: 'Inicio', components: Object.values(DEFAULT_COMPONENTS) });
    return { success: true, site: this.getSite(id) };
  }

  getSite(id) {
    const s = db.prepare('SELECT * FROM sites WHERE id=?').get(id);
    if (!s) return { error: 'Sitio no encontrado' };
    return { ...s, config: safeJson(s.config, {}), pages: this.listPages(id) };
  }

  listSites({ tenant_id, limit = 50 } = {}) {
    let sql = 'SELECT id, tenant_id, name, domain, published, created_at FROM sites';
    const params = [];
    if (tenant_id) { sql += ' WHERE tenant_id=?'; params.push(tenant_id); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    return { success: true, sites: db.prepare(sql).all(...params, Number(limit)) };
  }

  updateSite(id, { name, domain, config, published }) {
    const s = db.prepare('SELECT * FROM sites WHERE id=?').get(id);
    if (!s) return { success: false, error: 'Sitio no encontrado' };
    db.prepare('UPDATE sites SET name=?, domain=?, config=?, published=?, updated_at=? WHERE id=?').run(
      name ?? s.name, domain ?? s.domain, JSON.stringify(config ?? safeJson(s.config, {})),
      published != null ? Number(published) : s.published, now(), id
    );
    return { success: true, site: this.getSite(id) };
  }

  createPage({ site_id, slug, title, components = [], meta = {} }) {
    const id = randomUUID();
    const t = now();
    db.prepare('INSERT INTO pages (id, site_id, slug, title, components, meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, site_id, slug, title, JSON.stringify(components), JSON.stringify(meta), t, t
    );
    return { success: true, page: this.getPage(id) };
  }

  getPage(id) {
    const p = db.prepare('SELECT * FROM pages WHERE id=?').get(id);
    if (!p) return { error: 'Página no encontrada' };
    return { ...p, components: safeJson(p.components, []), meta: safeJson(p.meta, {}) };
  }

  listPages(site_id) {
    return db.prepare('SELECT * FROM pages WHERE site_id=? ORDER BY slug').all(site_id).map((p) => this.hydratePage(p));
  }

  updatePage(id, { title, components, meta }) {
    const p = db.prepare('SELECT * FROM pages WHERE id=?').get(id);
    if (!p) return { success: false, error: 'Página no encontrada' };
    db.prepare('UPDATE pages SET title=?, components=?, meta=?, updated_at=? WHERE id=?').run(
      title ?? p.title, JSON.stringify(components ?? safeJson(p.components, [])),
      JSON.stringify(meta ?? safeJson(p.meta, {})), now(), id
    );
    return { success: true, page: this.getPage(id) };
  }

  deletePage(id) {
    db.prepare('DELETE FROM pages WHERE id=?').run(id);
    return { success: true };
  }

  exportSite(id) {
    const site = this.getSite(id);
    if (site.error) return site;
    const html = site.pages.map((p) => this.renderPage(p, site)).join('\n');
    return { success: true, html };
  }

  renderPage(page, site) {
    const body = page.components.map((c) => this.renderComponent(c)).join('\n');
    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${page.title} | ${site.name}</title><style>body{font-family:Inter,system-ui,sans-serif;margin:0;padding:0;color:#1f2937;}.hero{padding:80px 20px;text-align:center;}.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;padding:40px 20px;}.faq{padding:40px 20px;max-width:700px;margin:0 auto;}.contact{padding:40px 20px;text-align:center;}</style></head><body>${body}</body></html>`;
  }

  renderComponent(c) {
    const { type, props = {} } = c;
    if (type === 'hero') return `\n<section class="hero" style="background:${props.bg};color:${props.color}"><h1>${props.title}</h1><p>${props.subtitle}</p><a href="#contact" style="background:#f59e0b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">${props.cta}</a></section>`;
    if (type === 'features') return `\n<section class="features">${(props.items || []).map((i) => `<div><h3>${i.title}</h3><p>${i.text}</p></div>`).join('')}</section>`;
    if (type === 'faq') return `\n<section class="faq"><h2>Preguntas frecuentes</h2>${(props.questions || []).map((q) => `<details><summary>${q.q}</summary><p>${q.a}</p></details>`).join('')}</section>`;
    if (type === 'contact') return `\n<section id="contact" class="contact"><h2>Contacto</h2><p>Email: ${props.email}</p><p>Tel: ${props.phone}</p></section>`;
    return '';
  }

  hydratePage(p) {
    return { ...p, components: safeJson(p.components, []), meta: safeJson(p.meta, {}) };
  }
}

export default new WebBuilderService();
