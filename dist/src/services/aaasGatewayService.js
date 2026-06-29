import agentRuntime from './agentRuntimeService.js';
import helpdeskService from '../helpdesk/helpdeskService.js';
import * as workflowService from './workflowService.js';
import * as hybridRAG from './hybridRAGService.js';
import engramService from './engramService.js';
import agentWorkforceService from './agentWorkforceService.js';
import agenticRAGService from './agenticRAGService.js';
import abacService from './abacService.js';
import agentEvalService from './agentEvalService.js';
import agentMeshSyncService from './agentMeshSyncService.js';
import a2aStandardService from './a2aStandardService.js';
import agentDAGService from './agentDAGService.js';
import browserAgentService from './browserAgentService.js';
import mcpRegistryService from './mcpRegistryService.js';
import billingService from './billingService.js';
import * as ticketML from '../ml/ticketML.js';
import * as cuaAgentService from './cuaAgentService.js';
import a2aService from './a2aService.js';
import localLLMRouter from './localLLMRouterService.js';
import selfHealingService from './selfHealingService.js';
import guardrailsService from './guardrailsService.js';
import durableWorkflowService from './durableWorkflowService.js';
import agentHarnessService from './agentHarnessService.js';

// AaaS Gateway: maps every system capability to Agent Runtime intents and executes them.
// This is the single integration point that turns AzurDesk into an Agents-as-a-Service platform.
class AaaSGatewayService {
  constructor() {
    this.registry = agentRuntime;
    this.handlers = {};
    this._registerCoreHandlers();
  }

  bootstrapTenant(tenant_id) {
    // Always ensure core agents exist; do not skip if a generic test agent is present
    const existing = this.registry.list(tenant_id);
    const coreNames = new Set(['Helpdesk Agent','Workflow Agent','Knowledge Agent','ML Agent','CUA Agent','A2A Agent','Local LLM Agent','Guardrails Agent','Durable Workflow Agent','Harness Agent','Self-Healing Agent','Orchestrator Agent']);
    const missing = [...coreNames].filter(n => !existing.some(a => a.name === n));
    if (!missing.length) return existing;
    const agents = [
      { name: 'Helpdesk Agent', description: 'Creates, lists, and manages tickets', capabilities: ['ticket.create','ticket.list','ticket.get','ticket.escalate'] },
      { name: 'Workflow Agent', description: 'Executes AzurDesk workflows', capabilities: ['workflow.run','workflow.create'] },
      { name: 'Knowledge Agent', description: 'Hybrid RAG search across KB and memory', capabilities: ['rag.search','memory.remember','memory.recall'] },
      { name: 'ML Agent', description: 'Classifies tickets and predicts capacity', capabilities: ['ml.classify','ml.predict'] },
      { name: 'CUA Agent', description: 'Performs Computer Use actions', capabilities: ['cua.act','cua.navigate'] },
      { name: 'A2A Agent', description: 'Sends and receives cross-tenant task cards', capabilities: ['a2a.send','a2a.receive'] },
      { name: 'Local LLM Agent', description: 'Routes prompts to local models', capabilities: ['llm.local.route','llm.local.generate'] },
      { name: 'Guardrails Agent', description: 'Evaluates safety and compliance rules', capabilities: ['guardrails.check','guardrails.rule'] },
      { name: 'Durable Workflow Agent', description: 'Manages durable workflows with compensation', capabilities: ['durable.create','durable.step','durable.compensate'] },
      { name: 'Harness Agent', description: 'Runs sandboxed skills and schedules', capabilities: ['harness.skill','harness.schedule','harness.execute'] },
      { name: 'Self-Healing Agent', description: 'Detects failures and proposes healing', capabilities: ['selfheal.detect','otel.trace'] },
      { name: 'Orchestrator Agent', description: 'Runs Simplicio-Loop discovery/plan/act/verify cycles', capabilities: ['simplicio.run'] }
    ];
    return agents.filter(a => missing.includes(a.name)).map(a => this.registry.register(tenant_id, a));
  }

  _registerCoreHandlers() {
    this.handlers['ticket.create'] = ({ tenant_id, payload }) => helpdeskService.createTicket({ ...payload, tenant_id }).ticket;
    this.handlers['ticket.list'] = ({ tenant_id, payload }) => helpdeskService.listTickets({ ...payload, tenant_id });
    this.handlers['ticket.get'] = ({ payload }) => helpdeskService.getTicket(payload.ticket_id);
    this.handlers['workflow.run'] = async ({ tenant_id, payload }) => {
      if (!payload.workflow_id) return { error: 'workflow_id required' };
      return workflowService.runById ? await workflowService.runById(payload.workflow_id, payload.inputs || {}, tenant_id) : { note: 'workflow run not wired' };
    };
    this.handlers['rag.search'] = ({ tenant_id, payload }) => ({ results: hybridRAG.hybridSearch({ tenant_id, ...payload }) });
    this.handlers['memory.remember'] = ({ tenant_id, payload }) => engramService.remember({ tenant_id, ...payload });
    this.handlers['memory.recall'] = ({ tenant_id, payload }) => ({ memories: engramService.recall({ tenant_id, ...payload }) });
    this.handlers['ml.classify'] = ({ payload }) => ({ prediction: ticketML.predict(payload.text) });
    this.handlers['cua.act'] = async ({ payload }) => cuaAgentService.agentAct(payload.goal, payload.maxSteps || 5);
    this.handlers['a2a.send'] = ({ tenant_id, payload }) => a2aService.sendCard(tenant_id, { ...payload, secret: process.env.A2A_SECRET || 'a2a-local-secret' });
    this.handlers['a2a.submit'] = ({ tenant_id, payload }) => a2aStandardService.submitTask({ tenant_id, ...payload });
    this.handlers['a2a.get'] = ({ payload }) => a2aStandardService.getTask(payload.task_id);
    this.handlers['dag.run'] = async ({ tenant_id, payload }) => agentDAGService.run({ tenant_id, ...payload });
    this.handlers['browser.navigate'] = async ({ payload }) => browserAgentService.navigate(payload.url);
    this.handlers['browser.extract'] = async ({ payload }) => browserAgentService.extractText(payload.selector);
    this.handlers['mcp.registry.search'] = ({ payload }) => ({ servers: mcpRegistryService.search(payload?.query) });
    this.handlers['mcp.registry.install'] = ({ payload }) => mcpRegistryService.install(payload.id);
    this.handlers['billing.usage'] = ({ tenant_id, payload }) => billingService.getUsage(tenant_id, payload?.period);
    this.handlers['billing.invoice'] = ({ tenant_id, payload }) => billingService.getInvoice(tenant_id, payload?.period);
    this.handlers['workforce.schedule'] = ({ tenant_id, payload }) => agentWorkforceService.scheduleTask({ tenant_id, ...payload });
    this.handlers['workforce.complete'] = ({ payload }) => agentWorkforceService.completeAssignment(payload.assignment_id, payload.result);
    this.handlers['rag.agentic'] = async ({ tenant_id, payload }) => agenticRAGService.search({ tenant_id, ...payload });
    this.handlers['abac.evaluate'] = ({ tenant_id, payload }) => abacService.evaluate({ tenant_id, ...payload });
    this.handlers['agent.eval'] = async ({ tenant_id, payload }) => agentEvalService.runEval(tenant_id, payload.case_id);
    this.handlers['mesh.heartbeat'] = ({ tenant_id, payload }) => agentMeshSyncService.heartbeat({ tenant_id, ...payload });
    this.handlers['a2a.receive'] = ({ tenant_id, payload }) => ({ cards: a2aService.receiveCards(tenant_id, payload.agent_id || '', process.env.A2A_SECRET || 'a2a-local-secret') });
    this.handlers['llm.local.route'] = ({ tenant_id, payload }) => localLLMRouter.route(tenant_id, payload);
    this.handlers['llm.local.generate'] = async ({ tenant_id, payload }) => localLLMRouter.generate(tenant_id, payload);
    this.handlers['guardrails.check'] = ({ tenant_id, payload }) => guardrailsService.evaluate(tenant_id, payload.text, payload.scope || 'input');
    this.handlers['durable.create'] = ({ tenant_id, payload }) => durableWorkflowService.create(tenant_id, payload);
    this.handlers['durable.step'] = ({ tenant_id, payload }) => durableWorkflowService.step(payload.id, tenant_id);
    this.handlers['durable.compensate'] = ({ tenant_id, payload }) => durableWorkflowService.compensate(payload.id, tenant_id);
    this.handlers['harness.skill'] = ({ tenant_id, payload }) => agentHarnessService.registerSkill(tenant_id, payload);
    this.handlers['harness.schedule'] = ({ tenant_id, payload }) => agentHarnessService.scheduleSkill(tenant_id, payload.skill_id, payload.cron, payload.payload);
    this.handlers['harness.execute'] = async ({ tenant_id, payload }) => agentHarnessService.executeSkill(tenant_id, payload.skill_id, payload.payload);
    this.handlers['selfheal.detect'] = ({ tenant_id }) => ({ actions: selfHealingService.detectAndHeal(tenant_id) });
    this.handlers['otel.trace'] = ({ tenant_id, payload }) => selfHealingService.startSpan(tenant_id, payload);
  }

  // Execute an intent through the AaaS gateway
  async invoke(tenant_id, { intent, payload = {}, context = {} }) {
    const dispatched = this.registry.dispatch(tenant_id, { intent, payload, context });
    if (!dispatched.success) return dispatched;
    const { agent, run } = dispatched;
    const handler = this.handlers[intent];
    if (!handler) {
      this.registry.endRun(run.run_id, { status: 'failed', error: `No handler for intent ${intent}` });
      return { success: false, error: `No handler for intent ${intent}` };
    }
    try {
      const output = await handler({ tenant_id, payload, context, agent });
      this.registry.endRun(run.run_id, { output, status: 'completed' });
      billingService.recordUsage({ tenant_id, resource: 'agent.invoke', metric: intent, quantity: 1 });
      return { success: true, agent, run, output };
    } catch (e) {
      this.registry.endRun(run.run_id, { status: 'failed', error: e.message });
      return { success: false, error: e.message };
    }
  }

  listIntents() {
    return Object.keys(this.handlers);
  }
}

export default new AaaSGatewayService();
