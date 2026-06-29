import db from './db.js';
import { randomUUID } from 'crypto';
import { now } from './_utils.js';

// MCP Registry Client: discover and import MCP servers from public registry.
class MCPRegistryService {
  constructor() {
    this.cache = [];
  }

  seed() {
    const existing = db.prepare('SELECT COUNT(*) as c FROM mcp_registry_servers').get().c;
    if (existing > 0) return;
    const servers = [
      { id: 'github', name: 'GitHub MCP', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github', capabilities: 'repo,issues,search' },
      { id: 'slack', name: 'Slack MCP', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack', capabilities: 'channels,messages' },
      { id: 'notion', name: 'Notion MCP', url: 'https://github.com/sue445/mcp-notion-server', capabilities: 'pages,databases' },
      { id: 'google-calendar', name: 'Google Calendar MCP', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gcalendar', capabilities: 'events,calendars' }
    ];
    const t = now();
    const stmt = db.prepare(`INSERT INTO mcp_registry_servers (id, name, url, capabilities, installed, created_at) VALUES (?, ?, ?, ?, 0, ?)`);
    for (const s of servers) stmt.run(s.id, s.name, s.url, s.capabilities, t);
  }

  search(query) {
    this.seed();
    const q = (query || '').toLowerCase();
    const rows = db.prepare('SELECT * FROM mcp_registry_servers').all();
    return rows.filter(r => !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.capabilities.toLowerCase().includes(q)).map(r => this._hydrate(r));
  }

  install(id) {
    const r = db.prepare('UPDATE mcp_registry_servers SET installed = 1 WHERE id = ?').run(id);
    if (r.changes === 0) return null;
    return this.get(id);
  }

  listInstalled() {
    return db.prepare('SELECT * FROM mcp_registry_servers WHERE installed = 1').all().map(r => this._hydrate(r));
  }

  get(id) {
    const r = db.prepare('SELECT * FROM mcp_registry_servers WHERE id = ?').get(id);
    return r ? this._hydrate(r) : null;
  }

  _hydrate(r) {
    return { id: r.id, name: r.name, url: r.url, capabilities: r.capabilities.split(','), installed: !!r.installed };
  }
}

export default new MCPRegistryService();
