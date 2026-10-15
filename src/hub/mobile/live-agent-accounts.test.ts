import { describe, expect, test } from "bun:test";
import { decodeAgentAccounts, safeAccountLoginUrl } from "./live-agent-accounts";
import type { AccountAgentStatus } from "../agent-account-types";

const agent: AccountAgentStatus = { agent: "opencode", name: "OpenCode", state: "ready", generation: 2, capabilities: { login: true, logout: true, activate: true }, loginCommand: "opencode auth login", methods: [], targets: [{ id: "fixture", name: "Fixture", connected: true, methods: [{ id: "key", label: "API key", kind: "key", fields: [{ key: "region", label: "Region", kind: "select", valueType: "string", required: true, options: [{ value: "private", label: "Private", hint: "Local" }] }, { key: "secret", label: "Secret", kind: "text", valueType: "string", required: false, secret: true, when: [{ key: "region", op: "eq", value: "private" }] }] }], credentials: [{ id: "saved", label: "Saved account", kind: "key", active: true, removable: true }] }] };
const attempt = { id: "attempt", agent: "opencode", target: "fixture", methodId: "browser", url: "https://example.invalid/login", instructions: "Enter code: ABCD-1234", completion: "device", state: "pending", startedAt: 1, expiresAt: 2 };
describe("live account decoder", () => {
  test("preserves generations, capabilities, field conditions and attempt outcomes without extra secrets", () => {
    for (const generation of [1, 2] as const) for (const state of ["pending", "complete", "failed", "expired", "cancelled"] as const) {
      const result = decodeAgentAccounts({ agents: [{ ...agent, generation, privateKey: "never returned" }], attempts: [{ ...attempt, state, token: "never returned" }] });
      expect(result.agents[0]!.generation).toBe(generation);
      expect(result.agents[0]!.targets[0]!.methods).toEqual(agent.targets[0]!.methods);
      expect(result.attempts[0]!.state).toBe(state);
      expect(JSON.stringify(result)).not.toContain("never returned");
    }
  });
  test("Claude's unknown state stays unknown rather than logged in", () => {
    expect(decodeAgentAccounts({ agents: [{ ...agent, agent: "claude", generation: undefined, claude: { source: "unknown" } }], attempts: [] }).agents[0]!.claude).toEqual({ source: "unknown" });
  });
  test("rejects malformed, duplicate and unsupported facts", () => {
    for (const input of [null, {}, { agents: [agent, agent], attempts: [] }, { agents: [agent], attempts: [attempt, attempt] }, { agents: [{ ...agent, generation: 3 }], attempts: [] }, { agents: [{ ...agent, capabilities: { login: "yes" } }], attempts: [] }, { agents: [], attempts: [{ ...attempt, expiresAt: -1 }] }, { agents: [], attempts: [{ ...attempt, url: "javascript:alert(1)" }] }]) expect(() => decodeAgentAccounts(input)).toThrow();
  });
  test("login links never accept executable schemes or embedded credentials", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,unsafe", "https://user:secret@example.invalid", "/relative", "file:///private"]) expect(safeAccountLoginUrl(url)).toBeNull();
    expect(safeAccountLoginUrl("https://example.invalid/login")).toBe("https://example.invalid/login");
  });
});
