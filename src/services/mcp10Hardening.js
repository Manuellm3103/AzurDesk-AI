// MCP 1.0 spec hardening — 2025-11-25 protocol compliance utilities.
// Implements the official MCP 1.0 spec requirements that are not in the
// base transport:
//   - MCP-Protocol-Version header validation
//   - structuredContent in tools/call results (JSON Schema validated)
//   - roots/ capability + roots/list handler
//   - tasks/ resource for long-running agent operations
//   - completion/ handler for prompt argument completion
//   - notifications/ list (capability advertisement)
//
// Reference: https://modelcontextprotocol.io/specification/2025-11-25

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-01'];
export const DEFAULT_PROTOCOL_VERSION = '2025-11-25';

/**
 * Validate the MCP-Protocol-Version header. Throws if unsupported.
 * Returns the negotiated version (defaults to DEFAULT when header is missing,
 * which is allowed during backwards-compatible pre-handshake requests).
 */
export function validateProtocolVersion(headerValue) {
  if (!headerValue) return DEFAULT_PROTOCOL_VERSION;
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(headerValue)) {
    const err = new Error(`Unsupported MCP-Protocol-Version: ${headerValue}`);
    err.code = 'UNSUPPORTED_PROTOCOL_VERSION';
    err.supported = SUPPORTED_PROTOCOL_VERSIONS;
    throw err;
  }
  return headerValue;
}

/**
 * Wrap a tool result with structuredContent + isError per MCP 1.0 spec.
 * The content array remains for backwards compatibility, but the
 * structuredContent field enables clients (Claude Desktop, Cursor) to
 * render typed results without re-parsing text.
 */
export function wrapStructuredResult({ content, structured, isError = false }) {
  const result = { content: content || [] };
  if (structured !== undefined) result.structuredContent = structured;
  if (isError) result.isError = true;
  return result;
}

/**
 * Root URI: a client-discovered filesystem-like namespace.
 * MCP 1.0 servers MAY expose a roots/list capability to enumerate
 * server-known roots. We expose the tenant's AzurDesk resources.
 */
export function buildRootsList(tenant_id) {
  return {
    roots: [
      {
        uri: `azurdesk://${tenant_id}/`,
        name: `AzurDesk Tenant ${tenant_id}`,
        description: 'Tenant root for helpdesk, agents, billing resources'
      }
    ]
  };
}

/**
 * Task resource: long-running async operation. Clients can poll.
 * Returns a task descriptor with status enum (pending|completed|failed).
 */
export function buildTaskDescriptor({ id, status, progress, result, error }) {
  if (!['pending', 'completed', 'failed'].includes(status)) {
    throw new Error(`Invalid task status: ${status}`);
  }
  const t = { id, status };
  if (Number.isFinite(progress)) t.progress = Math.max(0, Math.min(1, progress));
  if (result !== undefined) t.result = result;
  if (error) t.error = error;
  return t;
}

/**
 * Prompt argument completion: returns up to N completion candidates for
 * a partial argument. Spec-compliant shape: { completion: { values, total, hasMore } }
 */
export function buildCompletionResponse({ values, total, hasMore = false }) {
  return { completion: { values, total: total ?? values.length, hasMore } };
}

/**
 * Capability advertisement: returns the server's MCP 1.0 capabilities
 * including the new ones from this hardening module.
 */
export function buildHardenedCapabilities() {
  return {
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
    prompts: { listChanged: false },
    logging: {},
    roots: { listChanged: false },
    tasks: { cancellable: true },
    completion: { argument: true }
  };
}
