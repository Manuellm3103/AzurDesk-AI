#!/usr/bin/env node
// scripts/audit-ui-backend.mjs
// Verifies that every frontend /api/... call has a matching backend route pattern
// and every HTML view has a renderer in public/static/app.js.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = resolve(process.cwd());
const serverFile = process.argv[2] || resolve(BASE, 'server.mjs');
const appFile = process.argv[3] || resolve(BASE, 'public/static/app.js');
const htmlFile = process.argv[4] || resolve(BASE, 'public/index.html');

function extractBackendRoutes(source) {
  const exact = [];
  const dynamic = [];
  const re = /(?:if\s*\(|&&\s*|\|\|\s*|\?\s*)pathname\s*===?\s*['"](\/api\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source))) exact.push(m[1]);
  const re2 = /pathname\.startsWith\(['"](\/api\/[^'"]+)['"]\)/g;
  while ((m = re2.exec(source))) dynamic.push(m[1]);
  return { exact, dynamic };
}

function extractFrontendCalls(source) {
  const calls = [];
  const re = /api\(['"](GET|POST|PUT|PATCH|DELETE)['"],\s*['"](\/api\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source))) calls.push([m[1], m[2]]);
  return calls;
}

function extractHtmlViews(source) {
  const views = [];
  const re = /show\(['"]([a-z0-9-]+)['"]\)/g;
  let m;
  while ((m = re.exec(source))) views.push(m[1]);
  return [...new Set(views)];
}

function extractRenderers(source) {
  const keys = [];
  const re = /['"]?([a-z0-9-]+)['"]?\s*:\s*\(\)\s*=>\s*(render[A-Za-z0-9]+)/g;
  let m;
  while ((m = re.exec(source))) keys.push(m[1]);
  return keys;
}

function matchCall(call, { exact, dynamic }) {
  const [method, path] = call;
  // Strip query string for matching
  const bare = path.split('?')[0];
  if (exact.includes(bare)) return true;
  if (dynamic.some(d => bare.startsWith(d))) return true;
  const base = bare.replace(/\/[^/]+$/, '/');
  if (dynamic.some(d => d.startsWith(base))) return true;
  if (dynamic.some(d => {
    const prefix = d.endsWith('/') ? d : d.replace(/\/[^/]*$/, '/');
    return bare.startsWith(prefix);
  })) return true;
  return false;
}

const server = readFileSync(serverFile, 'utf8');
const app = readFileSync(appFile, 'utf8');
const html = readFileSync(htmlFile, 'utf8');
const allJs = app;

const backend = extractBackendRoutes(server);
const frontendCalls = extractFrontendCalls(allJs);
const views = extractHtmlViews(html);
const renderers = extractRenderers(allJs);

const missingBackend = frontendCalls.filter(c => !matchCall(c, backend));
const missingRenderer = views.filter(v => !renderers.includes(v));
const orphanRenderer = renderers.filter(r => !views.includes(r));

let failed = false;

console.log('=== UI/backend audit ===');
console.log(`Backend exact routes: ${backend.exact.length}`);
console.log(`Backend dynamic routes: ${backend.dynamic.length}`);
console.log(`Frontend API calls: ${frontendCalls.length}`);
console.log(`HTML views: ${views.length}`);
console.log(`Renderers mapped: ${renderers.length}`);

if (missingBackend.length) {
  failed = true;
  console.error('\nFrontend calls without backend route:');
  missingBackend.forEach(([m, p]) => console.error(`  ${m} ${p}`));
}
if (missingRenderer.length) {
  failed = true;
  console.error('\nHTML views without renderer:');
  missingRenderer.forEach(v => console.error(`  #${v}`));
}
if (orphanRenderer.length) {
  console.warn('\nRenderers not present in HTML (may be programmatic):');
  orphanRenderer.forEach(r => console.warn(`  ${r}`));
}

if (failed) {
  console.error('\nAUDIT FAILED');
  process.exit(1);
} else {
  console.log('\nAUDIT PASSED');
  process.exit(0);
}
