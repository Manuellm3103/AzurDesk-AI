import { randomUUID } from 'crypto';
import db from '../services/db.js';
import { safeJson, now } from '../services/_utils.js';
import { generate as llmGenerate } from '../services/llmRouter.js';

class Agent {
  constructor({ id, name, tier = 1, role, skills = [], systemPrompt, tools = [] }) {
    this.id = id || randomUUID();
    this.name = name;
    this.tier = tier;
    this.role = role;
    this.skills = skills;
    this.systemPrompt = systemPrompt || `Eres ${name}, agente de soporte TI.`;
    this.tools = tools;
  }

  async run({ task, context = {}, handoffTo } = {}) {
    const prompt = `${this.systemPrompt}\n\nTarea: ${task}\nContexto: ${JSON.stringify(context)}`;
    const r = await llmGenerate(prompt, { complexity: this.tier === 3 ? 'high' : this.tier === 2 ? 'medium' : 'low' });
    return { agent: this, output: r.text || r, handoffTo, done: true };
  }
}

class AgentTeam {
  constructor({ id, name, domain, agents = [] }) {
    this.id = id || randomUUID();
    this.name = name;
    this.domain = domain;
    this.agents = agents;
  }

  route(task, context = {}) {
    // route by skill match + tier
    const taskLower = task.toLowerCase();
    const scored = this.agents.map((a) => {
      let score = a.skills.filter((s) => taskLower.includes(s.toLowerCase())).length * 10;
      score += a.tier * 2;
      return { agent: a, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.agent || this.agents[0];
  }
}

class HandoffManager {
  constructor() {
    this.history = [];
  }

  async runSequential(agents, task, context) {
    let ctx = { ...context };
    for (const agent of agents) {
      const r = await agent.run({ task, context: ctx });
      this.history.push({ agent: r.agent.name, output: r.output });
      ctx.lastOutput = r.output;
    }
    return ctx.lastOutput;
  }
}

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(name, fn, description) {
    this.tools.set(name, { fn, description });
  }

  async call(name, args) {
    const t = this.tools.get(name);
    if (!t) throw new Error(`Tool ${name} no registrada`);
    return t.fn(args);
  }

  list() {
    return Array.from(this.tools.entries()).map(([name, { description }]) => ({ name, description }));
  }
}

const globalToolRegistry = new ToolRegistry();

function createDefaultAgents() {
  return [
    new Agent({ name: 'TriageBot', tier: 1, role: 'triage', skills: ['clasificar', 'sentimiento', 'urgencia'], systemPrompt: 'Clasifica tickets de soporte TI por urgencia, nivel y categoría. Sé breve.' }),
    new Agent({ name: 'L1Resolver', tier: 1, role: 'resolver', skills: ['password', 'reset', 'vpn', 'office'], systemPrompt: 'Resuelve tickets L1 comunes. Responde en español.' }),
    new Agent({ name: 'L2Engineer', tier: 2, role: 'engineer', skills: ['red', 'windows', 'servidor', 'dns', 'dhcp'], systemPrompt: 'Eres ingeniero L2. Investiga causas raíz y sugiere pasos.' }),
    new Agent({ name: 'L3Architect', tier: 3, role: 'architect', skills: ['arquitectura', 'seguridad', 'escalación', 'diseño'], systemPrompt: 'Eres arquitecto L3. Diseña soluciones y escalaciones estratégicas.' }),
    new Agent({ name: 'DocAgent', tier: 1, role: 'documentation', skills: ['kb', 'documentación', 'resumen'], systemPrompt: 'Genera o mejora artículos de base de conocimiento.' })
  ];
}

export { Agent, AgentTeam, HandoffManager, ToolRegistry, globalToolRegistry, createDefaultAgents };
