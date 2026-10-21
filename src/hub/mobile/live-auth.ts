import type { AuthenticationState, DeviceView, HubIdentity, MobileHubBackend, OperationResult, ReadResult } from "./backend";
import { decodeHubState } from "./live-read-model";
import type { LiveTransport } from "./live-transport";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid response");
  return value as Record<string, unknown>;
}
export function decodeDevices(value: unknown): DeviceView[] {
  const rows = object(value).sessions;
  if (!Array.isArray(rows)) throw new Error("Invalid devices");
  const devices = rows.map(value => {
    const row = object(value);
    if (typeof row.handle !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(row.handle)
      || typeof row.deviceLabel !== "string" || typeof row.issuedAt !== "number" || !Number.isSafeInteger(row.issuedAt) || row.issuedAt < 0 || row.issuedAt > 8_640_000_000_000
      || typeof row.current !== "boolean") throw new Error("Invalid device");
    return { handle: row.handle, deviceLabel: row.deviceLabel, issuedAt: row.issuedAt * 1000, current: row.current };
  });
  if (new Set(devices.map(device => device.handle)).size !== devices.length || devices.filter(device => device.current).length !== 1) throw new Error("Invalid device identity");
  return devices;
}

export function createLiveAuthentication(transport: LiveTransport): Pick<MobileHubBackend, "readAuthentication" | "signIn" | "signOut" | "readDevices" | "revokeDevice"> {
  let changing = false;
  async function readAuthentication(): Promise<ReadResult<AuthenticationState>> {
    const result = await transport.read("/api/hub/state", decodeHubState);
    if (result.status === "unavailable") return result.problem.kind === "unauthorized"
      ? { status: "available", value: { status: "signed-out" } } : result;
    if (!result.value.identity) return { status: "unavailable", problem: { kind: "unavailable", message: "This Hub does not provide authenticated identity." } };
    return { status: "available", value: { status: "authenticated", identity: { ...result.value.identity, version: result.value.version } } };
  }
  async function change<T>(operation: () => Promise<OperationResult<T>>): Promise<OperationResult<T>> {
    if (changing) return { status: "rejected", problem: { kind: "conflict", message: "A session change is already pending." } };
    changing = true;
    transport.fence();
    try { return await operation(); } finally { changing = false; }
  }
  return {
    readAuthentication,
    signIn: intent => change<HubIdentity>(async () => {
      const login = await transport.request("/login", value => {
        const row = object(value);
        if (typeof row.user !== "string" || !row.user || "sessionId" in row) throw new Error("Invalid cookie login");
        return row.user;
      }, { name: intent.user, password: intent.password, deviceLabel: intent.deviceLabel, sessionTransport: "cookie" }, false);
      if (login.status !== "completed") return login;
      const auth = await readAuthentication();
      if (auth.status === "available" && auth.value.status === "authenticated" && auth.value.identity.user === login.value) return { status: "completed", value: auth.value.identity };
      return { status: "indeterminate", message: "Login was accepted, but the session could not be verified. Refresh before trying again." };
    }),
    signOut: () => change(async () => {
      const result = await transport.request("/logout", value => {
        if (object(value).revoked !== true) throw new Error("Invalid logout");
        return { status: "signed-out" as const };
      }, {});
      if (result.status === "completed") {
        // Match the login page's stale-visit cleanup before signed-out UI.
        try { sessionStorage.removeItem("uatu.hub.return.v1"); } catch { /* Storage may be unavailable. */ }
        transport.invalidate("signed-out");
      }
      return result;
    }),
    readDevices: () => transport.read("/api/hub/sessions", decodeDevices),
    async revokeDevice(handle) {
      if (!/^[A-Za-z0-9_-]{16}$/.test(handle)) return { status: "rejected", problem: { kind: "invalid-input", message: "Invalid device handle." } };
      const result = await transport.request(`/api/hub/sessions/${encodeURIComponent(handle)}/revoke`, value => {
        const row = object(value);
        if (row.revoked !== true || typeof row.current !== "boolean") throw new Error("Invalid revocation");
        return { status: "revoked" as const, current: row.current };
      }, {});
      if (result.status === "completed" && result.value.current) transport.invalidate("current-session-revoked");
      return result;
    },
  };
}
