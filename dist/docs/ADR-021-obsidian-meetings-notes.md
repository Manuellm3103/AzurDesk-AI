# ADR-021: Obsidian Integration, AI Notes y Teams Meeting Pipeline

## Estado

Aceptado

## Contexto

AzurDesk AI v2.1.0 es una plataforma AAAS con MCP server, onboarding y notificaciones en vivo. Para cerrar el ciclo de conocimiento ejecutivo, integramos:
- Lectura del vault Obsidian local.
- Generación automática de notas Markdown desde tickets, campañas, analytics, meetings y agent runs.
- Pipeline de resúmenes de reuniones de Teams que extrae accionables y crea tickets de seguimiento.

## Decisiones

1. **Obsidian via filesystem**: Sin plugins ni API externa. El servicio detecta `~/Documents/Obsidian Vault` o usa fallback `data/obsidian-vault`.
2. **AI Notes Service**: Funciones puras de transformación a Markdown. No dependen de LLM, son rápidas y deterministas.
3. **Meeting Pipeline**: Regex de verbos de acción para identificar accionables. Crea tickets para acciones sin ticket vinculado.
4. **Reutilizar endpoints existentes**: Todo vive bajo `/api/obsidian/*`, `/api/notes/generate` y `/api/meetings/process` con auth JWT.

## Consecuencias

- AzurDesk AI se convierte en hub de conocimiento: datos del sistema → notas en Obsidian.
- Reuniones de Teams generan tickets rastreables automáticamente.
- No se requieren dependencias adicionales.

## Notas

- Versión: v2.2.0
- Tests: 126, 125 pass, 1 skip, 0 fail
- Smoke: 74/74
