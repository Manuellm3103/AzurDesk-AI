# Deep Research — Reddit / Open Web AI Agents & Autonomous Business 2026-06-27

## Methodology
- Reddit direct JSON API: **HTTP 403 blocked** (SearXNG también 403).
- Fallback: GitHub API repository search for trending agent workforce / autonomous business / multi-agent repos.

## GitHub Findings

### 1. AI Agent + Autonomous Business (created > 2025)
| Repo | Stars | URL |
|---|---|---|
| LizeRaes/j1-ai-demo | 24 | https://github.com/LizeRaes/j1-ai-demo |
| iPythoning/b2b-sdr-hermes-skill | 22 | https://github.com/iPythoning/b2b-sdr-hermes-skill |
| panaversity/agentfactory-business-plugins | 19 | https://github.com/panaversity/agentfactory-business-plugins |

### 2. Agent Workforce Orchestration
| Repo | Stars | URL |
|---|---|---|
| simstudioai/sim | 28,876 | https://github.com/simstudioai/sim |
| a5c-ai/babysitter | 1,432 | https://github.com/a5c-ai/babysitter |
| xorbitsai/xagent | 263 | https://github.com/xorbitsai/xagent |

### 3. Multi-Agent Systems 2025
| Repo | Stars | URL |
|---|---|---|
| ag2ai/Agents_Failure_Attribution | 373 | https://github.com/ag2ai/Agents_Failure_Attribution |
| global-agent-hackathon/global-agent-hackathon-may-2025 | 248 | https://github.com/global-agent-hackathon/global-agent-hackathon-may-2025 |
| Xtra-Computing/MegaAgent | 244 | https://github.com/Xtra-Computing/MegaAgent |

## Key Trends 2026
1. **Agent Workforces as Products** — Sim Studio y Babysitter demuestran que los agentes se venden como equipos virtuales (marketing, SDR, ops).
2. **Failure Attribution in Multi-Agent** — AG2 paper/repositorio enfatiza diagnóstico de culpa entre agentes, necesario para self-healing.
3. **Business Plugins** — AgentFactory muestra extensión por dominio vertical (finanzas, legal, ventas).
4. **SRE for Agents** — Orquestación + health checks + retries + reasignación es el nuevo estándar.

## Implications for AzurDesk AI
- Workforce scheduler ya cubre reasignación por skills.
- ABAC y Agent Eval faltan de integrarse en UI y gateway con privilegios.
- Failure attribution puede reforzar `selfHealingService` con causalidad.
- Business plugins sugieren marketplace de skills por departamento (13 dept skills existentes).

## Blockers
- Reddit research bloqueado (403). GitHub API funciona como fallback con rate limit.
