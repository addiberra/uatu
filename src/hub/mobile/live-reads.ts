import { hubUrl } from "../../shared/app-url";
import { fetchWithinBudget } from "../../shell/bounded-fetch";
import type { BoundedFetchTimers, Fetcher } from "../../shell/bounded-fetch";
import type { BackendProblem } from "./backend";
import { decodeCredentialCatalog, decodeCredentialTools, decodeDefaultFolder, decodeHubState } from "./live-read-model";

/** ReadResult-compatible failures with local transport diagnostics, never raw
 * response bodies, bearer credentials, exception messages or guessed identity. */
export type LiveReadResult<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; problem: BackendProblem;
      reason: "outside-hub" | "http" | "malformed" | "network" | "timeout"; httpStatus?: number };

function unavailable<T>(reason: Extract<LiveReadResult<T>, { status: "unavailable" }>["reason"], message: string): LiveReadResult<T> {
  return { status: "unavailable", reason, problem: { kind: "unavailable", message } };
}

/** Explicit GETs only. No mount, polling, cache, auth mutation, retries or
 * incomplete MobileHubBackend stubs. Each call returns its own snapshot; the
 * eventual frontend owner must fence stale auth/workspace generations. */
export function createLiveHubReads(options: {
  fetch?: Fetcher;
  timeoutMs?: number;
  timers?: BoundedFetchTimers;
} = {}) {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError("Hub read timeout must be a positive timer duration");
  }

  async function read<T>(path: string, decode: (value: unknown) => T): Promise<LiveReadResult<T>> {
    let url: string;
    try { url = hubUrl(path); }
    catch { return unavailable("outside-hub", "Hub reads require a Hub-served page."); }
    let signal: AbortSignal | undefined;
    try {
      return await fetchWithinBudget<LiveReadResult<T>>(async (input, init) => {
        signal = init?.signal ?? undefined;
        return fetcher(input, {
          ...init, method: "GET", credentials: "same-origin", mode: "same-origin",
          redirect: "error", cache: "no-store", headers: { accept: "application/json" },
        });
      }, url, timeoutMs, async response => {
        if (response.status !== 200) {
          // These APIs answer 401 directly. Never follow an HTML login redirect
          // or reinterpret it as an authenticated snapshot. Do not echo errors.
          void response.body?.cancel().catch(() => {});
          const problem: BackendProblem = response.status === 401
            ? { kind: "unauthorized", message: "Hub authentication is required." }
            : response.status === 403
              ? { kind: "forbidden", message: "The Hub refused this read." }
              : response.status === 404
                ? { kind: "not-found", message: "The Hub read endpoint was not found." }
                : { kind: "unavailable", message: "The Hub could not provide this information." };
          return { status: "unavailable", reason: "http", httpStatus: response.status, problem };
        }
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (response.redirected || contentType !== "application/json") {
          void response.body?.cancel().catch(() => {});
          return unavailable("malformed", "The Hub returned an unexpected response.");
        }
        let payload: unknown;
        try { payload = await response.json(); }
        catch (error) {
          if (signal?.aborted) return unavailable("timeout", "The Hub read timed out.");
          if (error instanceof SyntaxError) return unavailable("malformed", "The Hub returned invalid JSON.");
          throw new Error("Hub response body could not be read");
        }
        try { return { status: "available", value: decode(payload) }; }
        catch { return unavailable("malformed", "The Hub returned an invalid read payload."); }
      }, options.timers);
    } catch {
      return signal?.aborted
        ? unavailable("timeout", "The Hub read timed out.")
        : unavailable("network", "The Hub could not be reached.");
    }
  }

  return {
    readHubState: () => read("/api/hub/state", decodeHubState),
    readCredentials: () => read("/api/hub/credentials", decodeCredentialCatalog),
    readCredentialTools: () => read("/api/hub/credential-tools", decodeCredentialTools),
    readDefaultFolder: () => read("/api/hub/settings/workspace-defaults", decodeDefaultFolder),
  };
}
