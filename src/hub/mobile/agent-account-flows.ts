import type { AccountAgentId, AccountAgentStatus, AccountMethod, AccountTarget, AgentAccountsSnapshot } from "../agent-account-types";
import { collectAnswers, fieldVisible } from "../agent-account-fields";
import { escapeHtml as esc } from "../../shared/html";
import { agentAccountScopeWarning } from "./agent-accounts";
import { safeAccountLoginUrl } from "./live-agent-accounts";
import { action, clearSecrets, field, group, infoRows, listRow, select, showContextualError, text, value, type FlowActions, type FlowEnvironment } from "./flow-ui";

export function accountSummary(agent: AccountAgentStatus): string {
  if (agent.state !== "ready") return agent.state === "not-installed" ? "Not installed" : agent.state === "starting" || agent.state === "idle" ? "Starting…" : "Unavailable";
  if (agent.agent === "opencode") { const count = agent.targets.filter(target => target.connected).length; return count ? `${count} provider${count === 1 ? "" : "s"} logged in` : "Not logged in"; }
  const state = agent.claude;
  if (!state || state.source === "unknown") return "Login state unknown";
  if (state.source === "none") return "Not logged in";
  if (state.email) return `Logged in as ${state.email}${state.plan ? ` · ${state.plan}` : ""}`;
  return `Logged in · ${state.source.replaceAll("-", " ")}${state.plan ? ` · ${state.plan}` : ""}`;
}

/** Full-page presentation over the published account capability model. The
 * service still owns login attempts, redirect validation and workspace refresh. */
export function createAgentAccountFlows(env: FlowEnvironment) {
  const api = env.backend.agentAccounts;
  let snapshot: AgentAccountsSnapshot = { agents: [], attempts: [] };
  let epoch = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { epoch++; clearTimeout(timer); timer = undefined; };
  const scope = () => text(agentAccountScopeWarning);
  function page(title: string, body: string, actions: FlowActions = {}) { stop(); return env.page(title, body, actions); }
  function load(render: () => void, back: () => void = env.home) {
    page("Agent accounts", text("Loading agent accounts…"), { "flow-back": back });
    if (!api) { page("Agent accounts unavailable", scope() + text("This backend does not provide agent-account operations."), { "flow-back": back }); return; }
    const captured = epoch, current = env.current();
    void api.read().then(result => {
      if (captured !== epoch || !current()) return;
      if (result.status === "available") { snapshot = result.value; render(); }
      else if (result.problem.kind === "unauthorized") env.authLost();
      else page("Agent accounts unavailable", scope() + text(result.problem.message) + action("retry", "Retry"), { "flow-back": back, retry: () => load(render, back) });
    }).catch(() => { if (captured === epoch && current()) page("Agent accounts unavailable", scope() + text("The Hub could not load agent accounts.") + action("retry", "Retry"), { "flow-back": back, retry: () => load(render, back) }); });
  }
  function overview() {
    const actions: FlowActions = { refresh: () => load(overview) };
    const rows = snapshot.agents.map(agent => { actions[`agent-${agent.agent}`] = () => env.navigate({ kind: "agent", id: agent.agent }); return listRow(`agent-${agent.agent}`, agent.name, accountSummary(agent)); }).join("");
    page("Agent accounts", scope() + group("Agents", rows || text("No agents are available.")) + action("refresh", "Refresh accounts"), actions);
    if (snapshot.agents.some(agent => agent.state === "starting" || agent.state === "idle")) poll(overview);
  }
  function poll(render: () => void, attemptId?: string) {
    const captured = epoch, current = env.current(), previous = snapshot;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!api || captured !== epoch || !current()) return;
      if (env.root.getAttribute("aria-busy") === "true" || env.root.inert) { poll(render, attemptId); return; }
      const result = await api.read().catch(() => null);
      if (captured !== epoch || !current() || previous !== snapshot) return;
      if (!result || result.status === "unavailable") {
        if (result?.problem.kind === "unauthorized") env.authLost();
        else showContextualError(env.root, "Account status could not be refreshed. Use Refresh; no login was retried.");
        return;
      }
      snapshot = result.value;
      // Never replace the exact secret input while a pending attempt is waiting.
      const before = previous.attempts.find(item => item.id === attemptId), after = snapshot.attempts.find(item => item.id === attemptId);
      if (!attemptId || before?.state !== after?.state) render();
      else if (after?.state === "pending") poll(render, attemptId);
    }, 1_000);
  }
  function agentPage(id: AccountAgentId) {
    const agent = snapshot.agents.find(item => item.agent === id);
    if (!agent) { page("Agent unavailable", scope() + text("This agent is not reported by the Hub."), { "flow-back": overview }); return; }
    const actions: FlowActions = { "flow-back": overview, refresh: () => load(() => agentPage(id), overview) };
    const status = group("Status", infoRows([{ label: "Installation and login", value: accountSummary(agent) }, ...(agent.version ? [{ label: "Version", value: agent.version }] : []), ...(agent.generation ? [{ label: "OpenCode generation", value: String(agent.generation) }] : [])]));
    if (agent.state !== "ready") {
      page(agent.name, scope() + status + text(agent.message ?? "Agent is not ready.") + infoRows([{ label: "Login command", value: agent.loginCommand, mono: true }]) + action("refresh", "Refresh accounts"), actions);
      if (agent.state === "idle" || agent.state === "starting") poll(() => agentPage(id));
      return;
    }
    if (id === "claude") { providerPage(agent, { id: "claude", name: agent.name, connected: agent.claude?.source !== "none", credentials: [], methods: agent.methods }); return; }
    const root = page(agent.name, scope() + status + field("provider-search", "Search providers", "", "search") + '<div data-providers></div>' + action("refresh", "Refresh accounts"), actions);
    const region = root.querySelector<HTMLElement>("[data-providers]")!;
    const renderProviders = () => {
      const query = value(root, "provider-search").trim().toLocaleLowerCase();
      const targets = [...agent.targets].sort((a, b) => Number(b.connected) - Number(a.connected));
      region.innerHTML = group("Providers", targets.filter(target => `${target.id} ${target.name}`.toLocaleLowerCase().includes(query)).map((target, index) => {
        actions[`provider-${index}`] = () => providerPage(agent, target);
        return listRow(`provider-${index}`, target.name, target.connected ? "Logged in" : "Not logged in");
      }).join("") || text("No matching providers."));
    };
    // bind() captures its actions table; use a delegated handler for this dynamic list.
    region.onclick = event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-flow]");
      if (button && region.contains(button)) { event.stopPropagation(); void actions[button.dataset.flow!]?.(); }
    };
    root.querySelector('[name="provider-search"]')!.addEventListener("input", renderProviders);
    renderProviders();
  }
  function providerPage(agent: AccountAgentStatus, target: AccountTarget) {
    const back = () => agent.agent === "claude" ? overview() : agentPage(agent.agent);
    const actions: FlowActions = { "flow-back": back, refresh: () => load(() => currentProvider(agent.agent, target.id), back) };
    let body = scope() + group("Login", infoRows([{ label: "Agent", value: agent.name }, { label: "Account", value: agent.agent === "claude" ? accountSummary(agent) : target.connected ? "Logged in" : "Not logged in" }, ...(agent.claude?.organization ? [{ label: "Organization", value: agent.claude.organization }] : []), ...(agent.claude?.provider ? [{ label: "Provider", value: agent.claude.provider }] : [])]));
    body += group("Credentials", target.credentials.map((credential, index) => {
      let row = infoRows([{ label: credential.label, value: `${credential.kind}${credential.active ? " · Active" : ""}`, detail: credential.status }, ...(credential.variables ? [{ label: "Environment variables", value: credential.variables.join(", ") }] : [])]);
      if (agent.capabilities.activate && credential.removable && !credential.active) { actions[`activate-${index}`] = () => confirm("Activate agent credential?", () => api!.activate({ agent: agent.agent, credential: credential.id }), agent.agent, target.id); row += action(`activate-${index}`, `Activate ${credential.label}`); }
      if (agent.capabilities.logout && credential.removable) { actions[`logout-${index}`] = () => confirm("Log out agent credential?", () => api!.logout({ agent: agent.agent, target: target.id, credential: credential.id }), agent.agent, target.id); row += action(`logout-${index}`, `Log out ${credential.label}`, true); }
      return row;
    }).join("") || text(agent.agent === "claude" ? "Claude Code manages its own login." : "No saved provider credentials."));
    if (agent.agent === "claude" && agent.capabilities.logout && agent.claude?.source !== "none") {
      actions.logout = () => confirm("Log out Claude Code?", () => api!.logout({ agent: "claude", target: "claude", credential: "claude" }), "claude", "claude"); body += action("logout", "Log out Claude Code", true);
    }
    body += group("Login methods", target.methods.map((method, index) => {
      if (method.kind === "env") return infoRows([{ label: method.label, value: "Configured by the Hub operator's environment", detail: method.variables.join(", ") }]);
      if (method.kind === "command") return infoRows([{ label: method.label, value: method.command, mono: true }]);
      if (!agent.capabilities.login) return text(`${method.label}: unavailable through this Hub.`);
      actions[`method-${index}`] = () => login(agent, target, method);
      return action(`method-${index}`, method.label);
    }).join("") || infoRows([{ label: "Login command", value: agent.loginCommand, mono: true }]));
    const attempts = snapshot.attempts.filter(item => item.agent === agent.agent && item.target === target.id);
    body += group("Login attempts", attempts.map((item, index) => { actions[`attempt-${index}`] = () => attemptPage(item.id); return listRow(`attempt-${index}`, item.state === "pending" ? "Continue login" : `Login ${item.state}`, item.completion); }).join("") || text("No retained login attempts."));
    page(target.name, body + action("refresh", "Refresh accounts"), actions);
  }
  function currentProvider(id: AccountAgentId, targetId: string) {
    const agent = snapshot.agents.find(item => item.agent === id);
    const target = agent?.targets.find(item => item.id === targetId);
    if (agent?.agent === "claude") agentPage("claude");
    else if (agent && target && agent.state === "ready") providerPage(agent, target);
    else agentPage(id);
  }
  function confirm(title: string, call: Parameters<FlowEnvironment["mutate"]>[0], id: AccountAgentId, target: string) {
    env.confirm(title, scope(), { label: title.replace("?", ""), run: root => env.mutate(call, () => { env.sheet.close(); load(() => currentProvider(id, target)); }, root) });
  }
  function login(agent: AccountAgentStatus, target: AccountTarget, method: Extract<AccountMethod, { kind: "key" | "oauth" }>) {
    stop();
    const fields = method.fields.map((item, index) => `<div data-account-field="${index}">${item.kind === "select" && !item.secret ? select(`answer-${index}`, item.label, item.options ?? [], item.options?.[0]?.value ?? "") : field(`answer-${index}`, item.label, "", item.secret ? "password" : "text", 'autocomplete="off"')}${item.description ? text(item.description) : ""}</div>`).join("");
    const root = env.task(method.label, scope() + (method.kind === "key" ? field("account-key", "API key", "", "password", 'autocomplete="off"') : "") + fields, { label: method.kind === "key" ? "Connect" : "Start login", run: async task => {
      const answers = Object.fromEntries(method.fields.map((item, index) => [item.key, value(task, `answer-${index}`)]));
      try {
        collectAnswers(method.fields, answers); // Canonical visibility/type/required rules.
        const visible = Object.fromEntries(method.fields.filter(item => fieldVisible(item, answers)).map(item => [item.key, answers[item.key]!]));
        const intent = { agent: agent.agent, target: target.id, method: method.id, answers: visible };
        const key = value(task, "account-key");
        if (method.kind === "key" && !key.trim()) throw new Error("API key is required.");
        const previous = new Set(snapshot.attempts.map(item => item.id));
        await env.mutate(() => method.kind === "key" ? api!.connectKey({ ...intent, key }) : api!.startLogin(intent), next => {
          snapshot = next; env.sheet.close();
          const started = next.attempts.find(item => item.agent === agent.agent && item.target === target.id && !previous.has(item.id));
          if (started) attemptPage(started.id); else currentProvider(agent.agent, target.id);
        }, task);
      } finally { clearSecrets(task); }
    } }, {}, () => currentProvider(agent.agent, target.id));
    const conditions = () => {
      const answers = Object.fromEntries(method.fields.map((item, index) => [item.key, value(root, `answer-${index}`)]));
      method.fields.forEach((item, index) => {
        const container = root.querySelector<HTMLElement>(`[data-account-field="${index}"]`)!;
        const hidden = !fieldVisible(item, answers);
        container.hidden = hidden;
        container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select").forEach(input => { input.disabled = hidden; if (hidden && item.secret) input.value = ""; });
      });
    };
    root.addEventListener("input", conditions); root.addEventListener("change", conditions); conditions();
  }
  function attemptPage(id: string) {
    const attempt = snapshot.attempts.find(item => item.id === id);
    if (!attempt) { page("Login attempt unavailable", scope() + text("This attempt is no longer retained. Check account status before explicitly starting another login."), { "flow-back": overview }); return; }
    const back = () => currentProvider(attempt.agent, attempt.target);
    const actions: FlowActions = { "flow-back": back, refresh: () => load(() => attemptPage(id), back) };
    const url = safeAccountLoginUrl(attempt.url);
    let body = scope() + infoRows([{ label: "Status", value: attempt.state }, { label: "Expires", value: new Date(attempt.expiresAt).toLocaleString() }]);
    if (attempt.message) body += text(attempt.message);
    if (attempt.state === "pending") {
      if (url) body += `<p><a class="mh-account-login-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open login page in a new tab</a></p>`;
      body += text(attempt.instructions);
      if (attempt.completion === "device") {
        const code = /code[:\s]+([A-Z0-9]{4,}(?:-[A-Z0-9]{2,})*)/i.exec(attempt.instructions)?.[1];
        if (code) { body += `<output class="mh-device-code">${esc(code)}</output>` + action("copy", "Copy device code"); actions.copy = async () => { try { await navigator.clipboard.writeText(code); } catch { showContextualError(env.root, "Select the displayed code and copy it."); } }; }
      } else {
        body += field("account-response", attempt.completion === "code" ? "Authorization code" : "Whole localhost redirect address", "", "password", 'autocomplete="off"') + action("submit", "Submit login response");
        actions.submit = async () => {
          const control = env.root.querySelector<HTMLInputElement>('[name="account-response"]');
          const input = control?.value ?? "";
          if (!input.trim()) { showContextualError(env.root, "Paste the whole login response."); return; }
          try { await env.mutate(() => attempt.completion === "code" ? api!.submitCode({ attemptId: id, code: input }) : api!.submitRedirect({ attemptId: id, address: input }), next => { snapshot = next; attemptPage(id); }); }
          finally { if (control) control.value = ""; }
        };
      }
      body += action("cancel", "Cancel login", true);
      actions.cancel = () => env.mutate(() => api!.cancel(id), next => { snapshot = next; attemptPage(id); });
    } else if (attempt.state !== "complete") {
      body += action("retry", "Review login methods to try again"); actions.retry = back;
    }
    page("Agent login", body + action("refresh", "Refresh login status"), actions);
    if (attempt.state === "pending") poll(() => attemptPage(id), id);
  }
  return { show(id?: AccountAgentId) { load(() => id ? agentPage(id) : overview()); }, stop };
}
