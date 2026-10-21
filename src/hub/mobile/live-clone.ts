import { hubUrl } from "../../shared/app-url";
import type { Fetcher } from "../../shell/bounded-fetch";
import { SseFrameParser, type SseFrame } from "../live-sse";
import type { CloneJobEvent, CloneJobResult } from "../clone-jobs";
import type { CloneAttemptState, CloneSubmission, KeyTarget, MobileHubBackend, OperationResult } from "./backend";
import type { LiveTransport } from "./live-transport";
import { boolean, nonempty, object, text } from "./live-values";

export function decodeCloneAttempt(value: unknown): CloneAttemptState {
  const row = object(value);
  if (row.status === "accepted") return { status: "accepted", jobId: nonempty(row.jobId) };
  if (["pending", "not-accepted", "expired"].includes(row.status as string) && row.jobId === undefined) return { status: row.status as "pending" | "not-accepted" | "expired" };
  throw new Error("Invalid clone reconciliation");
}
export function decodeCloneEvent(frame: SseFrame): CloneJobEvent {
  const id = Number(frame.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid clone cursor");
  const row = object(JSON.parse(frame.data));
  if (frame.event === "output") return { id, type: "output", data: { output: text(row.output) } };
  if (frame.event === "phase" && ["cloning", "registering", "starting"].includes(row.phase as string)) return { id, type: "phase", data: { phase: row.phase as "cloning" | "registering" | "starting" } };
  if (frame.event !== "result") throw new Error("Invalid clone event");
  const target = nonempty(row.target);
  let result: CloneJobResult;
  if (row.status === "succeeded") result = { status: "succeeded", workspaceId: nonempty(row.workspaceId), target, running: boolean(row.running) };
  else if (row.status === "cancelled" || row.status === "timed-out") {
    if (row.reason !== undefined && row.reason !== "inactivity" && row.reason !== "lifetime") throw new Error("Invalid timeout reason");
    result = { status: row.status, target, ...(row.reason === undefined ? {} : { reason: row.reason }) };
  } else if (["clone-failed", "register-failed", "start-failed", "cleanup-failed"].includes(row.status as string)) {
    text(row.error); // Do not retain raw tool diagnostics in the operation error.
    result = { status: row.status as "clone-failed" | "register-failed" | "start-failed" | "cleanup-failed", target,
      error: "This clone phase could not complete. Inspect the reported checkout and workspace state before continuing.",
      ...(row.workspaceId === undefined ? {} : { workspaceId: nonempty(row.workspaceId) }) };
  } else throw new Error("Invalid clone result");
  return { id, type: "result", data: result };
}

/** Job execution stays with the server. This adapter never retries submission,
 * input or cancel; reconnect only replays the original accepted job. */
export function createLiveClone(transport: LiveTransport, credentials: Pick<MobileHubBackend, "readCredentials">, options: { fetch?: Fetcher } = {}): Pick<MobileHubBackend, "submitClone" | "reconcileCloneAttempt" | "subscribeClone" | "sendCloneInput" | "cancelClone"> {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const path = (id: string, action: string) => `/api/hub/clone-jobs/${encodeURIComponent(id)}/${action}`;
  async function reconcileCloneAttempt(intent: { attemptId: string }) {
    const result = await transport.request(`/api/hub/clone-attempts/${encodeURIComponent(intent.attemptId)}/reconcile`, decodeCloneAttempt, {});
    return result.status === "completed" ? { status: "available" as const, value: result.value } : { status: "unavailable" as const, problem: result.status === "rejected" ? result.problem : { kind: "unavailable" as const, message: "Clone acceptance remains unknown. Reconcile again before continuing." } };
  }
  return {
    reconcileCloneAttempt,
    async submitClone(intent): Promise<OperationResult<CloneSubmission>> {
      const generation = transport.generation();
      const retainedIds = intent.start ? [...new Set([...intent.retainedAuthentication.map(row => row.credentialId), ...(intent.signing ? [intent.signing] : [])])] : [];
      if (intent.credentialId || retainedIds.length) {
        const catalog = await credentials.readCredentials();
        if (generation !== transport.generation()) return { status: "indeterminate", message: "The authentication context changed. Reconcile before continuing." };
        if (catalog.status === "unavailable") return { status: "indeterminate", message: "The clone identity could not be checked. Reconcile this attempt before continuing." };
        const credential = catalog.value.find(row => row.id === intent.credentialId);
        let problem = intent.credentialId && (!credential || !credential.enabled) ? "The selected clone identity is missing or disabled." : "";
        let unlock: KeyTarget | undefined = credential?.enabled && credential.type === "ssh" && credential.facts?.lock !== "unlocked" ? { id: credential.id, type: "ssh" } : undefined;
        let purpose: "workspace-start" | undefined;
        for (const id of retainedIds) {
          const retained = catalog.value.find(row => row.id === id);
          if (!retained || !retained.enabled) { problem = "A credential assigned after clone is missing or disabled. Review workspace credentials."; continue; }
          if (!unlock && retained.type !== "token" && retained.facts?.lock !== "unlocked") {
            unlock = { id: retained.id, type: retained.type };
            purpose = "workspace-start";
          }
        }
        if (problem || unlock) {
          const fenced = await reconcileCloneAttempt(intent);
          if (generation !== transport.generation()) return { status: "indeterminate", message: "The authentication context changed. Reconcile before continuing." };
          if (fenced.status === "available" && fenced.value.status === "not-accepted") return problem
            ? { status: "rejected", problem: { kind: "conflict", message: problem } }
            : { status: "completed", value: { status: "requires-unlock", credential: unlock!, ...(purpose ? { purpose } : {}) } };
          if (fenced.status === "available" && fenced.value.status === "accepted") return { status: "completed", value: fenced.value };
          return { status: "indeterminate", message: "Reconcile this attempt before unlocking or submitting again." };
        }
      }
      if (generation !== transport.generation()) return { status: "indeterminate", message: "The authentication context changed. Reconcile before continuing." };
      const { credentialId, ...body } = intent;
      const submitted = await transport.request<CloneSubmission>("/api/hub/clone-jobs", value => ({ status: "accepted", jobId: nonempty(object(value).jobId) }), { ...body, ...(credentialId === null ? {} : { credentialId }) });
      if (submitted.status !== "rejected" || submitted.problem.kind === "unauthorized" || submitted.problem.kind === "forbidden") return submitted;
      // A 409 may mean an earlier unresolved admission, not rejection of work.
      // Resolve the durable record rather than trusting HTTP status alone.
      const reconciled = await reconcileCloneAttempt(intent);
      if (reconciled.status === "available" && reconciled.value.status === "accepted") return { status: "completed", value: reconciled.value };
      if (reconciled.status === "available" && reconciled.value.status === "not-accepted") return submitted;
      return { status: "indeterminate", message: "Clone acceptance remains unresolved. Do not submit a replacement." };
    },
    subscribeClone(intent, listener) {
      const abort = new AbortController();
      let disposed = false, terminal = false;
      const emit: typeof listener = event => { if (!disposed) listener(event); };
      const unsubscribe = transport.subscribeInvalidation(event => { if (event.scope === "authentication") { disposed = true; abort.abort(); } });
      const opening = setTimeout(() => abort.abort(), 15_000);
      void (async () => {
        try {
          const response = await fetcher(hubUrl(path(intent.jobId, "events")), { signal: abort.signal, credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store", headers: { accept: "text/event-stream", "last-event-id": String(intent.afterEventId) } });
          clearTimeout(opening);
          if (disposed || abort.signal.aborted) { await response.body?.cancel(); return; }
          if (response.status === 401 || response.status === 404) {
            await response.body?.cancel();
            emit({ type: "unavailable", reason: response.status === 401 ? "unauthorized" : "not-found-or-expired", message: "This clone stream is no longer available." });
            if (response.status === 401) transport.invalidate("unauthorized");
            return;
          }
          if (!response.ok || response.redirected || !response.body || response.headers.get("content-type")?.split(";", 1)[0] !== "text/event-stream") { await response.body?.cancel(); throw new Error("Invalid clone stream"); }
          const reader = response.body.getReader(), parser = new SseFrameParser(1_048_576);
          let cursor = intent.afterEventId;
          try {
            while (!disposed && !terminal) {
              const next = await reader.read();
              if (next.done) break;
              for (const frame of parser.push(next.value)) {
                if ("comment" in frame) continue;
                const event = decodeCloneEvent(frame);
                if (event.id <= cursor) continue;
                cursor = event.id;
                terminal = event.type === "result";
                emit({ type: "job-event", event });
                if (terminal || disposed) break;
              }
            }
          } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
          if (!terminal) emit({ type: "disconnected", message: "Clone progress disconnected. Reconnect to the same job." });
        } catch { emit({ type: "disconnected", message: "Clone progress disconnected. Reconnect to the same job." }); }
        finally { clearTimeout(opening); unsubscribe(); }
      })();
      return () => { disposed = true; clearTimeout(opening); unsubscribe(); abort.abort(); };
    },
    sendCloneInput: intent => transport.request(path(intent.jobId, "input"), value => {
      if (object(value).accepted !== true) throw new Error("Input was not accepted");
      return { status: "accepted" };
    }, { input: intent.input }),
    cancelClone: id => transport.request(path(id, "cancel"), value => {
      const status = object(value).status;
      if (status !== "cancelled" && status !== "terminal") throw new Error("Invalid cancellation");
      return { status };
    }, {}),
  };
}
