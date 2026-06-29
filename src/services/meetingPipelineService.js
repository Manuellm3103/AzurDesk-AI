import helpdeskService from '../helpdesk/helpdeskService.js';
import * as aiNotesService from './aiNotesService.js';

export function processSummary({ title, summary, tenant_id, date = new Date().toISOString() }) {
  if (!tenant_id || !summary) throw new Error('tenant_id y summary son requeridos');

  const sentences = summary.split(/[.\n]/).map(s => s.trim()).filter(Boolean);
  const actionVerbs = /\b(revisar|actualizar|implementar|corregir|probar|desplegar|investigar|enviar|revisión|verificar|reparar|configurar|crear|preparar|presentar|publicar|monitorear|escalar)\b/i;
  const actionItems = [];

  for (const s of sentences) {
    if (actionVerbs.test(s)) {
      let ticketId = null;
      const match = s.match(/\b(ticket|issue|TK|INC)[-\s]?(\w+)/i);
      if (match) ticketId = `${match[1]}-${match[2]}`;
      actionItems.push({ text: s, owner: extractOwner(s), ticket_id: ticketId });
    }
  }

  const orphanActions = actionItems.filter(a => !a.ticket_id);
  const createdTickets = orphanActions.slice(0, 5).map(a =>
    helpdeskService.createTicket({
      tenant_id,
      requester_email: 'meeting@azurdesk.ai',
      requester_name: 'Teams Pipeline',
      subject: `Acción reunión: ${a.text.slice(0, 80)}`,
      body: `Generado desde resumen de Teams:\n${summary}\n\nAcción: ${a.text}\nOwner: ${a.owner || 'unassigned'}`,
      category: 'meeting',
      channel: 'teams'
    })
  );

  const note = aiNotesService.meetingToNote({
    title,
    date,
    summary,
    action_items: actionItems,
    tickets_created: createdTickets.map(t => ({ id: t.ticket.id, subject: t.ticket.subject }))
  });

  return {
    title,
    date,
    action_items: actionItems,
    tickets_created: createdTickets.map(t => ({ id: t.ticket.id, subject: t.ticket.subject })),
    note
  };
}

function extractOwner(text) {
  const m = text.match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/);
  return m ? m[1] : null;
}
