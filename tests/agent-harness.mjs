import test from 'node:test';
import assert from 'node:assert/strict';
import agentHarness from '../src/services/agentHarnessService.js';

test('agent harness registra skill y schedule', () => {
  const skill = agentHarness.registerSkill('t-harness', { agent_id: 'a1', name: 'diagnose', description: 'Diagnóstico de tickets', params: ['ticket_id'] });
  assert.ok(skill.id);
  const skills = agentHarness.listSkills('t-harness', 'a1');
  assert.ok(skills.length > 0);
  const schedule = agentHarness.schedule('t-harness', { agent_id: 'a1', name: 'morning-check', cron: '0 9 * * *', goal: 'revisar tickets críticos' });
  assert.ok(schedule.id);
  const schedules = agentHarness.listSchedules('t-harness');
  assert.ok(schedules.length > 0);
});

test('agent sandbox corre comando', async () => {
  const run = await agentHarness.runSandbox('t-harness', 'a1', 'echo harness');
  assert.equal(run.exit_code, 0);
  assert.ok(run.stdout.includes('harness'));
});
