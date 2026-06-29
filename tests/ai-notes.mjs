import test from 'node:test';
import assert from 'node:assert/strict';
import * as aiNotesService from '../src/services/aiNotesService.js';

test('AI Notes genera nota desde ticket', () => {
  const note = aiNotesService.ticketToNote({
    id: 'TK-1', subject: 'Problema VPN', body: 'No conecta', priority: 'alta',
    status: 'open', created_at: '2026-06-27T10:00:00Z'
  });
  assert.ok(note.includes('# Ticket TK-1'));
  assert.ok(note.includes('Problema VPN'));
  assert.ok(note.includes('priority:: alta') || note.includes('Priority:** alta'));
});

test('AI Notes genera nota desde campaña', () => {
  const note = aiNotesService.campaignToNote({
    id: 'C1', title: 'Lanzamiento', agents: ['content', 'design'],
    results: { headline: 'Hola', image_prompt: 'abstract blue' }
  });
  assert.ok(note.includes('# Campaign: Lanzamiento'));
  assert.ok(note.includes('content'));
});

test('AI Notes genera nota desde analytics', () => {
  const note = aiNotesService.analyticsToNote({
    period: '24h', total_calls: 42, total_cost: 0.123, avg_latency_ms: 450,
    top_models: [{ model: 'llama3.1', calls: 40, cost: 0.1 }]
  });
  assert.ok(note.includes('Period:** 24h'));
  assert.ok(note.includes('llama3.1'));
});

test('AI Notes genera nota desde meeting', () => {
  const note = aiNotesService.meetingToNote({
    title: 'Daily', summary: 'Revisión de sprint',
    action_items: [{ text: 'Revisar VPN', owner: 'Juan', ticket_id: 'TK-42' }]
  });
  assert.ok(note.includes('# Meeting: Daily'));
  assert.ok(note.includes('Revisar VPN'));
});
