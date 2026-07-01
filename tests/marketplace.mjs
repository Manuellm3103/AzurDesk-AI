import test from 'node:test';
import assert from 'node:assert/strict';
import marketplaceService from '../src/services/marketplaceService.js';
import db from '../src/services/db.js';

function clean() {
  db.exec(`
    DELETE FROM marketplace_reviews;
    DELETE FROM marketplace_installs;
    DELETE FROM marketplace_skills;
  `);
}

test('publish: creates a skill with valid signature', () => {
  clean();
  const r = marketplaceService.publish({
    slug: 'summarize-tickets',
    name: 'Summarize Tickets',
    description: 'Summarizes ticket threads in 3 bullets',
    author: 'AzurDesk Team',
    version: '1.0.0',
    category: 'productivity',
    kind: 'tool',
    entrypoint: 'summarize_tickets.js'
  });
  assert.equal(r.success, true);
  assert.ok(r.skill.id);
  assert.equal(r.skill.verified, true);
  assert.equal(r.skill.install_count, 0);
  assert.equal(r.skill.avg_rating, 0);
});

test('publish: rejects invalid kind', () => {
  clean();
  const r = marketplaceService.publish({ slug: 'x', name: 'x', author: 'a', version: '1.0.0', kind: 'invalid' });
  assert.equal(r.success, false);
  assert.match(r.error, /kind must be/);
});

test('publish: rejects duplicate slug', () => {
  clean();
  marketplaceService.publish({ slug: 'dup', name: 'a', author: 'a', version: '1.0.0', kind: 'tool' });
  const r = marketplaceService.publish({ slug: 'dup', name: 'b', author: 'b', version: '1.0.0', kind: 'tool' });
  assert.equal(r.success, false);
  assert.match(r.error, /already exists/);
});

test('getBySlug: returns verified skill', () => {
  clean();
  marketplaceService.publish({ slug: 'findme', name: 'Find Me', author: 'a', version: '1.0.0', kind: 'prompt' });
  const s = marketplaceService.getBySlug('findme');
  assert.ok(s);
  assert.equal(s.slug, 'findme');
  assert.equal(s.verified, true);
});

test('search: filters by category and kind', () => {
  clean();
  marketplaceService.publish({ slug: 'a1', name: 'A1', author: 'a', version: '1.0.0', kind: 'tool', category: 'ops' });
  marketplaceService.publish({ slug: 'p1', name: 'P1', author: 'a', version: '1.0.0', kind: 'prompt', category: 'productivity' });
  const tools = marketplaceService.search({ kind: 'tool' });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].slug, 'a1');
  const prod = marketplaceService.search({ category: 'productivity' });
  assert.equal(prod.length, 1);
  assert.equal(prod[0].slug, 'p1');
});

test('install: increments count and creates install record', () => {
  clean();
  const pub = marketplaceService.publish({ slug: 'i1', name: 'I1', author: 'a', version: '1.0.0', kind: 'tool' });
  const r = marketplaceService.install('tenant-1', pub.skill.id);
  assert.equal(r.success, true);
  assert.equal(r.install.version, '1.0.0');
  const s = marketplaceService.get(pub.skill.id);
  assert.equal(s.install_count, 1);
});

test('install: rejects duplicate install', () => {
  clean();
  const pub = marketplaceService.publish({ slug: 'i2', name: 'I2', author: 'a', version: '1.0.0', kind: 'tool' });
  marketplaceService.install('tenant-1', pub.skill.id);
  const r2 = marketplaceService.install('tenant-1', pub.skill.id);
  assert.equal(r2.success, false);
  assert.match(r2.error, /already/i);
});

test('uninstall: removes install and decrements count', () => {
  clean();
  const pub = marketplaceService.publish({ slug: 'i3', name: 'I3', author: 'a', version: '1.0.0', kind: 'tool' });
  marketplaceService.install('tenant-1', pub.skill.id);
  const r = marketplaceService.uninstall('tenant-1', pub.skill.id);
  assert.equal(r.success, true);
  const s = marketplaceService.get(pub.skill.id);
  assert.equal(s.install_count, 0);
});

test('listInstalled: returns tenant installs with full skill data', () => {
  clean();
  const pub = marketplaceService.publish({ slug: 'l1', name: 'L1', author: 'a', version: '1.0.0', kind: 'tool' });
  marketplaceService.install('tenant-1', pub.skill.id);
  const list = marketplaceService.listInstalled('tenant-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].slug, 'l1');
  assert.equal(list[0].verified, true);
});

test('review: stores rating and updates avg', () => {
  clean();
  const pub = marketplaceService.publish({ slug: 'r1', name: 'R1', author: 'a', version: '1.0.0', kind: 'tool' });
  marketplaceService.review('tenant-1', pub.skill.id, { rating: 5, comment: 'great' });
  marketplaceService.review('tenant-2', pub.skill.id, { rating: 3, comment: 'ok' });
  const s = marketplaceService.get(pub.skill.id);
  assert.equal(s.avg_rating, 4);
});

test('review: rejects invalid rating', () => {
  clean();
  const pub = marketplaceService.publish({ slug: 'r2', name: 'R2', author: 'a', version: '1.0.0', kind: 'tool' });
  const r = marketplaceService.review('tenant-1', pub.skill.id, { rating: 7 });
  assert.equal(r.success, false);
});

test('review: upsert updates existing rating', () => {
  clean();
  const pub = marketplaceService.publish({ slug: 'r3', name: 'R3', author: 'a', version: '1.0.0', kind: 'tool' });
  marketplaceService.review('tenant-1', pub.skill.id, { rating: 3 });
  marketplaceService.review('tenant-1', pub.skill.id, { rating: 5 });
  const s = marketplaceService.get(pub.skill.id);
  assert.equal(s.avg_rating, 5);
});

test('stats: aggregates totals', () => {
  clean();
  marketplaceService.publish({ slug: 's1', name: 'S1', author: 'a', version: '1.0.0', kind: 'tool' });
  marketplaceService.publish({ slug: 's2', name: 'S2', author: 'a', version: '1.0.0', kind: 'prompt' });
  const pub = marketplaceService.publish({ slug: 's3', name: 'S3', author: 'a', version: '1.0.0', kind: 'tool' });
  marketplaceService.install('t1', pub.skill.id);
  marketplaceService.review('t1', pub.skill.id, { rating: 4 });
  const stats = marketplaceService.stats();
  assert.equal(stats.total_skills, 3);
  assert.equal(stats.total_installs, 1);
  assert.equal(stats.total_reviews, 1);
});
