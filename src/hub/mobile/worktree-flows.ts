import type { WorktreeCheckout, WorktreeInventory, WorktreeOperationResult, WorktreeRefs } from "../../shared/worktree-contract";
import { initialWorktreeBase, validWorktreeBranch } from "../../shared/worktree-branches";
import { action, check, checked, field, group, infoRows, listRow, select, showContextualError, text, value, type FlowActions, type FlowEnvironment } from "./flow-ui";

/** Presentation only. Inventory identity, provenance, local-data fences and
 * all Git/registration/lifecycle effects stay with the upstream service. */
export function createWorktreeFlows(env: FlowEnvironment) {
  const api = env.backend.worktrees;
  function show(source: string, back: () => void) {
    env.page("Branches and worktrees", text("Loading authoritative checkouts…"), { "flow-back": back });
    if (!api) { env.page("Worktrees unavailable", text("This Hub does not provide worktree operations."), { "flow-back": back }); return; }
    void env.read(() => api.inventory(source), inventory => render(inventory, back), () => show(source, back));
  }
  function render(inventory: WorktreeInventory, back: () => void) {
    const source = inventory.sourceWorkspaceId;
    const actions: FlowActions = { "flow-back": back, refresh: () => show(source, back), create: () => create(inventory, back) };
    let body = text("Linked checkouts inherit their parent workspace's credentials and settings. Creating or registering a checkout does not copy conversations.");
    if (inventory.status !== "ready") body += text(inventory.error?.message ?? "Inventory is not ready. Refresh before performing an operation.");
    body += group("Checkouts", inventory.checkouts.map((checkout, index) => {
      actions[`checkout-${index}`] = () => detail(inventory, checkout, back);
      return listRow(`checkout-${index}`, checkout.branch ?? (checkout.detached ? "Detached checkout" : "Branch unavailable"), `${checkout.main ? "Main" : checkout.ownership} · ${checkout.availability} · ${checkout.running ? "Running" : "Stopped"} · ${checkout.path}`);
    }).join("") || text("No checkouts reported."));
    if (inventory.status === "ready") body += action("create", "Create branch or worktree");
    env.page("Branches and worktrees", body + action("refresh", "Refresh checkouts"), actions);
  }
  const facts = (checkout: WorktreeCheckout) => infoRows([
    { label: "Branch", value: checkout.branch ?? (checkout.detached ? "Detached HEAD" : "Unavailable") },
    { label: "Folder", value: checkout.path, mono: true },
    { label: "Ownership", value: checkout.ownership }, { label: "Availability", value: checkout.availability },
    { label: "Registration", value: checkout.registered ? "Registered" : "Not registered" },
    { label: "Activity", value: checkout.running ? "Running" : "Stopped" },
    { label: "Checkout identity", value: checkout.checkoutId, mono: true },
    ...(checkout.sourceRef ? [{ label: "Created from", value: checkout.sourceRef, mono: true }] : []),
    ...(checkout.upstream ? [{ label: "Upstream", value: checkout.upstream, mono: true }] : []),
    ...(checkout.head ? [{ label: "Revision", value: checkout.head, mono: true }] : []),
    ...(checkout.locked ? [{ label: "Git worktree lock", value: "Locked" }] : []),
  ]);
  function detail(inventory: WorktreeInventory, checkout: WorktreeCheckout, back: () => void) {
    const sourceWorkspaceId = inventory.sourceWorkspaceId, reference = checkout.workspaceId ?? checkout.checkoutId;
    const actions: FlowActions = { "flow-back": () => render(inventory, back), refresh: () => show(sourceWorkspaceId, back) };
    let body = facts(checkout);
    const run = (call: () => ReturnType<NonNullable<typeof api>["open"]>, context?: HTMLElement) => env.mutate(call, result => outcome(sourceWorkspaceId, result, back), context);
    if (checkout.availability === "present" && inventory.status === "ready") {
      if (checkout.registered && checkout.workspaceId) {
        // Start uses the shared credential/unlock owner, not a shortcut through
        // the worktree API. Open resolves the authoritative checkout first.
        actions.open = () => run(() => api!.open({ sourceWorkspaceId, reference, start: false }));
        body += action("open", checkout.running ? "Open checkout" : "Inspect registered workspace");
      } else {
        actions.register = () => env.task("Register worktree", facts(checkout) + text("Register this exact checkout at its existing path. Ownership and files do not change.") + check("start", "Start after registration"), { label: "Register workspace", run: root => run(() => api!.register({ sourceWorkspaceId, reference, start: checked(root, "start") }), root) }, {}, () => detail(inventory, checkout, back));
        body += action("register", "Register workspace");
      }
    }
    if (!checkout.main && inventory.status === "ready") {
      if (checkout.registered) {
        actions.forget = () => env.confirm("Remove worktree from Uatu?", facts(checkout) + text("Stop this workspace, terminating its shells, and remove its Hub registration, assignments and personal state. Checkout, branch, files and creation provenance remain."), { label: "Stop and remove registration", run: root => run(() => api!.forget({ sourceWorkspaceId, reference, stop: true }), root) }, {}, () => detail(inventory, checkout, back), { destructive: true });
        body += action("forget", "Remove from Uatu", true);
      }
      actions.delete = () => env.mutate(() => api!.preflightDelete({ sourceWorkspaceId, reference }), preflight => {
        if (!preflight.ok) {
          env.page("Worktree deletion refused", text(preflight.error.message) + infoRows([{ label: "Reason", value: preflight.error.code }]) + action("refresh", "Refresh checkouts"), { "flow-back": () => detail(inventory, checkout, back), refresh: () => show(sourceWorkspaceId, back) }); return;
        }
        const data = preflight.localData;
        let warning = facts(preflight.checkout) + text("Permanently remove this worktree's folder and Hub registration. The Git branch remains.");
        if (preflight.requiresStop) warning += text("This stops its Uatu activity and terminates its shells first. It cannot stop external applications.");
        if (data) {
          warning += group("Local files that will be discarded", (["tracked", "untracked", "ignored"] as const).map(category => data[category] ? infoRows([{ label: category, value: `${data[category]!.count} entries`, detail: data[category]!.sample.join(", ") }]) : "").join(""));
          warning += check("acknowledge", "Permanently delete these files with the worktree");
        }
        env.confirm("Delete worktree?", warning, { label: "Delete worktree", run: root => {
          if (data && !checked(root, "acknowledge")) throw new Error("Acknowledge the disclosed local files before deleting.");
          return env.mutate(() => api!.delete({ sourceWorkspaceId, reference, confirm: true, stop: preflight.requiresStop, ...(data ? { localDataFingerprint: data.fingerprint } : {}) }), result => outcome(sourceWorkspaceId, result, back), root);
        } }, {}, () => detail(inventory, checkout, back), { destructive: true });
      });
      body += action("delete", "Check deletion safety", true);
    }
    env.page("Checkout information", body + action("refresh", "Refresh checkouts"), actions);
  }
  function outcome(source: string, result: WorktreeOperationResult, back: () => void) {
    env.sheet.close(); env.changed();
    const checkout = result.ok ? result.checkout : result.retainedCheckout;
    const actions: FlowActions = { "flow-back": () => show(source, back), refresh: () => show(source, back) };
    let body = infoRows([{ label: "Operation", value: result.kind }, { label: "Operation identity", value: result.operationId, mono: true }, ...(result.phase ? [{ label: "Last completed boundary", value: result.phase }] : [])]);
    body += result.ok ? infoRows([{ label: "Registration", value: result.registered ? "Registered" : "Not registered" }, { label: "Session", value: result.started ? "Running" : "Not started" }]) + (result.startError ? text(result.startError.message) : "") : text(result.error.message) + infoRows([{ label: "Reason", value: result.error.code }, { label: "Recovery", value: result.error.retry }]);
    if (checkout) {
      body += group(result.ok ? "Checkout" : "Retained checkout — do not create a replacement", facts(checkout));
      actions.inspect = () => show(source, back); body += action("inspect", "Inspect current checkouts");
      if (checkout.workspaceId && checkout.availability === "present") {
        actions.workspace = () => env.navigate({ kind: "workspace", id: checkout.workspaceId! });
        body += action("workspace", "Workspace information and Start");
        if (checkout.running) { actions.open = () => env.openWorkspace(checkout.workspaceId!); body += action("open", "Open workspace"); }
      }
    }
    env.page(result.ok ? result.startError ? "Worktree configured; start failed" : "Worktree operation completed" : "Worktree operation refused", body + action("refresh", "Refresh checkouts"), actions);
  }
  function create(inventory: WorktreeInventory, back: () => void) {
    let refs = inventory.refs;
    const options = (refs: WorktreeRefs) => [{ value: "", label: "Choose an exact branch" }, ...refs.local.map(ref => ({ value: `local:${ref}`, label: `${ref} · local` })), ...refs.remote.map(ref => ({ value: `remote:${ref}`, label: `${ref} · remote` }))];
    const root = env.task("Create branch or worktree", text("Creates a separate checkout with inherited credentials. Existing branches are never reset. Paths are allocated by the Hub.") + select("mode", "Creation mode", [{ value: "new-branch", label: "New branch" }, { value: "existing-local", label: "Existing local branch" }, { value: "remote-tracking", label: "Track remote branch" }], "new-branch") + field("branch", "New branch name") + select("base", "Exact base or existing branch", options(refs), initialWorktreeBase(refs.local, refs.remote)) + text(refs.fetchedAt === null ? "Cached branches; no network fetch has been performed." : `Last fetched: ${new Date(refs.fetchedAt).toLocaleString()}`) + action("fetch", "Fetch remote branches") + check("start", "Start after creation"), { label: "Create worktree", run: task => {
      const selected = value(task, "base"), mode = value(task, "mode");
      const kind = selected.startsWith("local:") ? "local" : selected.startsWith("remote:") ? "remote" : undefined;
      const ref = selected.slice(selected.indexOf(":") + 1);
      if (!kind || !refs[kind].includes(ref)) throw new Error("Choose an exact available branch; no substitute will be used.");
      if (mode !== "new-branch" && mode !== "existing-local" && mode !== "remote-tracking") throw new Error("Choose a creation mode.");
      if (mode === "existing-local" && kind !== "local" || mode === "remote-tracking" && kind !== "remote") throw new Error("Choose a branch of the matching local or remote kind.");
      const branch = value(task, "branch").trim();
      if (mode === "new-branch" && !validWorktreeBranch(branch)) throw new Error("Enter a valid branch name of at most 64 characters.");
      return env.mutate(() => api!.create({ sourceWorkspaceId: inventory.sourceWorkspaceId, mode, base: { kind, ref }, ...(mode === "new-branch" ? { branch } : {}), start: checked(task, "start") }), result => outcome(inventory.sourceWorkspaceId, result, back), task);
    } }, { fetch: () => env.mutate(() => api!.fetch(inventory.sourceWorkspaceId), result => {
      const selected = value(root, "base");
      if (result.refs) {
        refs = result.refs;
        const holder = root.ownerDocument.createElement("div");
        holder.innerHTML = select("base", "Exact base or existing branch", options(refs), options(refs).some(option => option.value === selected) ? selected : "");
        root.querySelector('[name="base"]')!.closest("label")!.replaceWith(holder.firstElementChild!);
      }
      showContextualError(root, result.ok ? "Remote branches fetched. Review your selection before creating." : result.error.message);
    }, root) }, () => render(inventory, back));
    const update = () => { const input = root.querySelector<HTMLInputElement>('[name="branch"]')!; input.disabled = value(root, "mode") !== "new-branch"; input.closest("label")!.hidden = input.disabled; };
    root.addEventListener("change", update); update();
  }
  return { show };
}
