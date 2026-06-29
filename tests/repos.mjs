import test from 'node:test';
import assert from 'node:assert/strict';
import agentRegistry from '../src/services/agentRegistryService.js';
import swarmProtocol from '../src/services/swarmProtocolService.js';
import { classifyComplexity, routeModel } from '../src/services/llmRouter.js';

const TENANT = 'test-tenant';

test('agentRegistry crea agentes por default y busca el mejor', () => {
  const list = agentRegistry.list(TENANT);
  assert.ok(list.length >= 4);
  const best = agentRegistry.findBestForLevel(TENANT, 2);
  assert.ok(best);
  assert.ok(best.level >= 2);
});

test('swarmProtocol claim/heartbeat/complete funciona', () => {
  const agents = agentRegistry.list(TENANT);
  const agent = agents[0];
  const claim = swarmProtocol.claimWork(TENANT, agent.id, 'task-1', 'ticket', ['src/router.js']);
  assert.equal(claim.task_id, 'task-1');
  swarmProtocol.heartbeat(TENANT, claim.id);
  const completed = swarmProtocol.completeClaim(TENANT, claim.id);
  assert.equal(completed.status, 'completed');
});

test('classifyComplexity detecta alta y baja complejidad', () => {
  assert.equal(classifyComplexity('Haz un resumen corto de estatus'), 'low');
  assert.equal(classifyComplexity('Realiza una auditoría de seguridad profunda con root cause'), 'high');
});

test('routeModel elige modelo por estrategia', () => {
  const cheap = routeModel({ complexity: 'low', strategy: 'cheap' });
  assert.equal(cheap.costPer1M, 0);
  const quality = routeModel({ complexity: 'high', strategy: 'quality' });
  assert.ok(quality.quality >= 0.9);
});
