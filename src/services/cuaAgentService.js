import cuaService from './cuaService.js';

export async function agentAct({ tenant_id, agent_id, task, max_steps = 5 }) {
  const steps = [];
  for (let i = 0; i < max_steps; i++) {
    try {
      const capture = await cuaService.capture({ app: 'screen', mode: 'vision', max_elements: 20 });
      const decision = { action: 'done', reason: 'stub decision — connect LLM vision loop', capture: capture.success };
      steps.push({ step: i, capture: capture.success ? { width: capture.width, height: capture.height, pid: capture.pid } : null, decision });
      if (decision.action === 'done') break;
    } catch (e) {
      steps.push({ step: i, error: e.message });
      break;
    }
  }
  return { tenant_id, agent_id, task, steps };
}
