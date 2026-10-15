import { hubUrl } from "../../shared/app-url";
import { fetchWithinBudget, type Fetcher } from "../../shell/bounded-fetch";
import type { BackendProblem, Invalidation, OperationResult, ReadResult } from "./backend";

/** One browser session generation, shared by all live adapters. Never retries a
 * write, follows a redirect, exposes server error text, or handles bearer tokens. */
export function createLiveTransport(options: { fetch?: Fetcher; timeoutMs?: number } = {}) {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const timeout = options.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647) throw new RangeError("Invalid Hub timeout");
  let generation = 0;
  const listeners = new Set<(event: Invalidation) => void>();
  const fence = () => ++generation;
  function invalidate(reason: Extract<Invalidation, { scope: "authentication" }>["reason"]) {
    const event: Invalidation = { scope: "authentication", generation: fence(), reason };
    for (const listener of listeners) listener(event);
  }
  const unavailable = (): BackendProblem => ({ kind: "unavailable", message: "The Hub could not confirm this operation. Refresh its state before trying again." });
  async function request<T>(path: string, decode: (value: unknown) => T, body?: unknown, authenticate = true): Promise<OperationResult<T>> {
    const started = generation;
    let url: string;
    try { url = hubUrl(path); }
    catch { return { status: "rejected", problem: unavailable() }; }
    const uncertain = (): OperationResult<T> => ({ status: "indeterminate", message: unavailable().message });
    let signal: AbortSignal | undefined;
    try {
      return await fetchWithinBudget<OperationResult<T>>((input, init) => {
        signal = init?.signal ?? undefined;
        return fetcher(input, {
        ...init, method: body === undefined ? "GET" : "POST", credentials: "same-origin", mode: "same-origin",
        redirect: "error", cache: "no-store", headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      }, url, timeout, async response => {
        if (signal?.aborted || started !== generation) { void response.body?.cancel().catch(() => {}); return uncertain(); }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          if (response.status === 401 && authenticate) invalidate("unauthorized");
          // A server failure may follow an effect. It is not permission to retry.
          if (response.status >= 500) return uncertain();
          const retry = Number(response.headers.get("retry-after"));
          const problem: BackendProblem = response.status === 429
            ? { kind: "rate-limited", message: "Too many attempts. Wait before trying again.", retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : 60 }
            : { kind: response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 404 ? "not-found" : response.status === 409 ? "conflict" : "invalid-input",
                message: response.status === 401 ? "Authentication was not accepted." : "The Hub refused this operation." };
          return { status: "rejected", problem };
        }
        if (response.redirected || response.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") {
          void response.body?.cancel().catch(() => {}); return uncertain();
        }
        const payload: unknown = await response.json();
        if (signal?.aborted || started !== generation) return uncertain();
        return { status: "completed", value: decode(payload) };
      });
    } catch { return uncertain(); }
  }
  return {
    generation: () => generation, fence, invalidate,
    subscribeInvalidation(listener: (event: Invalidation) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    request,
    async read<T>(path: string, decode: (value: unknown) => T): Promise<ReadResult<T>> {
      const result = await request(path, decode);
      return result.status === "completed" ? { status: "available", value: result.value }
        : { status: "unavailable", problem: result.status === "rejected" ? result.problem : unavailable() };
    },
  };
}
export type LiveTransport = ReturnType<typeof createLiveTransport>;
