export function ticketToNote(ticket) {
  return [
    `# Ticket ${ticket.id || 'UNKNOWN'}`,
    '',
    `- **Subject:** ${ticket.subject || ''}`,
    `- **Status:** ${ticket.status || 'open'}`,
    `- **Priority:** ${ticket.priority || 'media'}`,
    `- **Category:** ${ticket.category || 'general'}`,
    `- **Created:** ${ticket.created_at || new Date().toISOString()}`,
    '',
    '## Body',
    ticket.body || '',
    '',
    '## Actionables',
    '- [ ] Verificar con usuario',
    '- [ ] Actualizar estado en AzurDesk',
    ''
  ].join('\n');
}

export function campaignToNote(campaign) {
  return [
    `# Campaign: ${campaign.title || campaign.id || 'Untitled'}`,
    '',
    `- **Status:** ${campaign.status || 'draft'}`,
    `- **Agents:** ${(campaign.agents || []).join(', ') || 'none'}`,
    `- **Created:** ${campaign.created_at || new Date().toISOString()}`,
    '',
    '## Outputs',
    '```json',
    JSON.stringify(campaign.results || {}, null, 2),
    '```',
    ''
  ].join('\n');
}

export function analyticsToNote(analytics) {
  return [
    '# Analytics Summary',
    '',
    `- **Period:** ${analytics.period || '7d'}`,
    `- **Total Calls:** ${analytics.total_calls || 0}`,
    `- **Total Cost:** $${(analytics.total_cost || 0).toFixed(4)}`,
    `- **Avg Latency:** ${(analytics.avg_latency_ms || 0).toFixed(0)} ms`,
    '',
    '## Top Models',
    (analytics.top_models || []).length
      ? analytics.top_models.map(m => `- ${m.model || m}: ${m.calls || 0} calls · $${(m.cost || 0).toFixed(4)}`).join('\n')
      : '- No data',
    ''
  ].join('\n');
}

export function meetingToNote(meeting) {
  return [
    `# Meeting: ${meeting.title || 'Untitled'}`,
    '',
    `- **Date:** ${meeting.date || new Date().toISOString()}`,
    `- **Action Items:** ${(meeting.action_items || []).length}`,
    `- **Tickets Created:** ${(meeting.tickets_created || []).length}`,
    '',
    '## Summary',
    meeting.summary || '',
    '',
    '## Action Items',
    (meeting.action_items || []).map(a => `- [ ] ${a.text}${a.owner ? ` (@${a.owner})` : ''}${a.ticket_id ? ` → ${a.ticket_id}` : ''}`).join('\n'),
    ''
  ].join('\n');
}

export function agentRunToNote(run) {
  return [
    `# Agent Run: ${run.goal || run.id}`,
    '',
    `- **State:** ${run.state || 'DONE'}`,
    `- **Quality Gate:** ${run.quality_gate ? 'PASS' : 'PENDING'}`,
    `- **Safety Gate:** ${run.safety_gate ? 'PASS' : 'PENDING'}`,
    `- **Token Gate:** ${run.token_gate ? 'PASS' : 'PENDING'}`,
    '',
    '## Evidence',
    '```json',
    JSON.stringify(run.evidence || {}, null, 2),
    '```',
    ''
  ].join('\n');
}
