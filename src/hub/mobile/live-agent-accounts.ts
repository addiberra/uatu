import type { AccountAgentStatus, AccountAttempt, AccountField, AccountMethod, AgentAccountsSnapshot } from "../agent-account-types";
import type { MobileAgentAccounts } from "./agent-accounts";
import type { LiveTransport } from "./live-transport";
import { array, boolean, nonempty, object, text } from "./live-values";

function member<const T extends string | number>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) throw new Error("Unsupported account fact");
  return value as T;
}
function optionalText(row: Record<string, unknown>, key: string) { return row[key] === undefined ? {} : { [key]: text(row[key]) }; }
function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid account timestamp");
  return value;
}
export function safeAccountLoginUrl(value: string): string | null {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function field(value: unknown): AccountField {
  const row = object(value);
  return { key: nonempty(row.key), label: text(row.label), kind: member(row.kind, ["text", "select"]), valueType: member(row.valueType, ["string", "number", "boolean", "list"]), required: boolean(row.required),
    ...(row.secret === undefined ? {} : { secret: boolean(row.secret) }), ...optionalText(row, "placeholder"), ...optionalText(row, "description"),
    ...(row.options === undefined ? {} : { options: array(row.options, value => { const option = object(value); return { value: text(option.value), label: text(option.label), ...optionalText(option, "hint") }; }) }),
    ...(row.when === undefined ? {} : { when: array(row.when, value => { const condition = object(value); return { key: nonempty(condition.key), op: member(condition.op, ["eq", "neq"]), value: text(condition.value) }; }) }),
  };
}
function method(value: unknown): AccountMethod {
  const row = object(value), base = { id: nonempty(row.id), label: text(row.label) };
  if (row.kind === "key") return { ...base, kind: "key", fields: array(row.fields, field) };
  if (row.kind === "oauth") return { ...base, kind: "oauth", fields: array(row.fields, field), ...(row.completion !== undefined ? { completion: member(row.completion, ["device", "code", "redirect"]) } : {}) };
  if (row.kind === "env") return { ...base, kind: "env", variables: array(row.variables, nonempty) };
  if (row.kind === "command") return { ...base, kind: "command", command: text(row.command) };
  throw new Error("Unsupported account method");
}
function agent(value: unknown): AccountAgentStatus {
  const row = object(value), capabilities = object(row.capabilities), claude = row.claude === undefined ? undefined : object(row.claude);
  return { agent: member(row.agent, ["opencode", "claude"]), name: nonempty(row.name), state: member(row.state, ["idle", "starting", "ready", "not-installed", "unavailable"]), loginCommand: text(row.loginCommand),
    ...optionalText(row, "version"), ...optionalText(row, "message"), ...(row.generation === undefined ? {} : { generation: member(row.generation, [1, 2]) }),
    capabilities: { login: boolean(capabilities.login), logout: boolean(capabilities.logout), activate: boolean(capabilities.activate) },
    methods: array(row.methods, method), targets: array(row.targets, value => {
      const target = object(value);
      return { id: nonempty(target.id), name: text(target.name), connected: boolean(target.connected), methods: array(target.methods, method), credentials: array(target.credentials, value => {
        const credential = object(value);
        return { id: nonempty(credential.id), label: text(credential.label), kind: member(credential.kind, ["key", "oauth", "saved", "env", "config", "other"]), active: boolean(credential.active), removable: boolean(credential.removable),
          ...optionalText(credential, "status"), ...(credential.variables === undefined ? {} : { variables: array(credential.variables, nonempty) }) };
      }) };
    }),
    ...(claude ? { claude: { source: member(claude.source, ["subscription", "console", "env-api-key", "env-token", "api-key-helper", "third-party", "none", "unknown"]), ...optionalText(claude, "email"), ...optionalText(claude, "organization"), ...optionalText(claude, "plan"), ...optionalText(claude, "provider") } } : {}),
  };
}
function attempt(value: unknown): AccountAttempt {
  const row = object(value), url = text(row.url);
  if (url && !safeAccountLoginUrl(url)) throw new Error("Unsafe account login URL");
  return { id: nonempty(row.id), agent: member(row.agent, ["opencode", "claude"]), target: nonempty(row.target), methodId: nonempty(row.methodId), url, instructions: text(row.instructions), completion: member(row.completion, ["device", "code", "redirect"]), state: member(row.state, ["pending", "complete", "failed", "expired", "cancelled"]), startedAt: timestamp(row.startedAt), expiresAt: timestamp(row.expiresAt), ...optionalText(row, "message") };
}
export function decodeAgentAccounts(value: unknown): AgentAccountsSnapshot {
  const row = object(value), agents = array(row.agents, agent), attempts = array(row.attempts, attempt);
  if (new Set(agents.map(a => a.agent)).size !== agents.length || new Set(attempts.map(a => a.id)).size !== attempts.length) throw new Error("Duplicate account identity");
  return { agents, attempts };
}
export function createLiveAgentAccounts(transport: LiveTransport): MobileAgentAccounts {
  const api = "/api/hub/agent-accounts";
  const attemptPath = (id: string, action: string) => `${api}/attempts/${encodeURIComponent(id)}/${action}`;
  return {
    read: () => transport.read(api, decodeAgentAccounts),
    connectKey: intent => transport.request(`${api}/key`, decodeAgentAccounts, intent),
    startLogin: intent => transport.request(`${api}/login`, decodeAgentAccounts, intent),
    submitCode: intent => transport.request(attemptPath(intent.attemptId, "code"), decodeAgentAccounts, { code: intent.code }),
    submitRedirect: intent => transport.request(attemptPath(intent.attemptId, "redirect"), decodeAgentAccounts, { address: intent.address }),
    cancel: id => transport.request(attemptPath(id, "cancel"), decodeAgentAccounts, {}),
    activate: intent => transport.request(`${api}/activate`, decodeAgentAccounts, intent),
    logout: intent => transport.request(`${api}/logout`, decodeAgentAccounts, intent),
  };
}
