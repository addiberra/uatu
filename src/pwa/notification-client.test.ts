import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";

const source = (await Bun.file(new URL("./notification-client.js", import.meta.url)).text()).replace("export function mountNotifications", "function mountNotifications");
const settle = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function fixture(options: { permission?: string; unsupported?: boolean; device?: boolean; configured?: boolean; failure?: number } = {}) {
  const { document } = parseHTML('<html><head></head><body><nav class="hub-nav"></nav><main></main></body></html>');
  const requests: Array<{ path: string; method: string; body?: any }> = [];
  const storage = new Map(options.device ? [["uatu:push-device", "fixture-device"]] : []);
  let prompts = 0, registrations = 0, subscriptions = 0, unsubscribes = 0, unauthorized = 0;
  let permission: () => Promise<string> = async () => "granted";
  const subscription = { toJSON: () => ({ endpoint: "https://push.invalid/fixture", keys: { p256dh: "fixture", auth: "fixture" } }), unsubscribe: async () => { unsubscribes++; } };
  const registration = { active: {}, pushManager: { getSubscription: async () => options.device ? subscription : null, subscribe: async () => { subscriptions++; return subscription; } } };
  const remote = { id: "fixture-device", active: true, allWorkspaces: true, workspaceIds: [], needsAnswer: true, completed: false };
  const notification = { permission: options.permission ?? "default", requestPermission: () => { prompts++; return permission(); } };
  const context = { document, window: { isSecureContext: true, ...(!options.unsupported ? { PushManager: {}, Notification: notification } : {}) }, navigator: { serviceWorker: { getRegistrations: async () => [], register: async () => { registrations++; return registration; }, getRegistration: async () => registration } }, Notification: notification, location: { href: "https://hub.invalid/settings?detail=notifications" }, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, URL, Uint8Array, atob, AbortController, setTimeout, clearTimeout,
    fetch: async (path: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      requests.push({ path, method, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) });
      expect(init.credentials).toBe("same-origin"); expect(init.redirect).toBe("error"); expect(init.cache).toBe("no-store");
      if (options.failure) return Response.json({ error: "DO NOT ECHO PRIVATE SERVER DETAIL" }, { status: options.failure });
      if (path === "/state") return Response.json({ workspaces: [{ id: "a", displayName: "Workspace A" }, { id: "b", displayName: "Workspace B" }] });
      return Response.json({ configured: options.configured ?? true, publicKey: "AAAA", device: method === "PUT" || options.device ? remote : null });
    },
  };
  const mount = runInNewContext(source + "; mountNotifications", context);
  const root = document.querySelector("main")!;
  const controller = mount({ apiUrl: "/notifications", stateUrl: "/state", workerUrl: "/push-worker.js", hosts: ".hub-nav", root, onUnauthorized: () => { unauthorized++; } });
  return { root, controller, requests, storage, setPermission: (fn: () => Promise<string>) => { permission = fn; }, counts: () => ({ prompts, registrations, subscriptions, unsubscribes, unauthorized }), click: (selector: string) => root.querySelector<HTMLButtonElement>(selector)!.click(), input: (name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`)!, document };
}

test("focused page uses existing enrollment and filters without a dialog, third tab or automatic prompt", async () => {
  const f = fixture(); await f.controller.ready;
  expect(f.document.querySelector("dialog")).toBeNull(); expect(f.document.querySelector(".hub-nav")!.children.length).toBe(0);
  expect(f.counts()).toMatchObject({ prompts: 0, subscriptions: 0, registrations: 1 });
  expect(f.root.textContent).toContain("Signing out or expiration");
  f.input("allWorkspaces").checked = true;
  f.input("needsAnswer").checked = false; f.input("completed").checked = true;
  f.click("[data-enable]"); await settle();
  expect(f.counts()).toMatchObject({ prompts: 1, subscriptions: 1 });
  expect(f.requests.find(item => item.method === "PUT")!.body).toMatchObject({ allWorkspaces: true, needsAnswer: false, completed: true });
  expect(f.root.textContent).toContain("Notification preferences saved");
  f.click("[data-disable]"); await settle();
  expect(f.requests.filter(item => item.method === "DELETE")).toHaveLength(1);
  expect(f.storage.has("uatu:push-device")).toBe(false);
  expect(f.root.textContent).toContain("Notifications are disabled"); f.controller.destroy();
});

test("granted, denied, unsupported and operator-unconfigured states are truthful", async () => {
  for (const options of [{ permission: "granted", device: true }, { permission: "denied" }, { unsupported: true }, { configured: false }]) {
    const f = fixture(options); await f.controller.ready;
    expect(f.counts().prompts).toBe(0);
    if (options.permission === "granted") {
      expect(f.root.querySelector("[data-enable]")!.textContent).toBe("Save preferences");
      expect(f.input("allWorkspaces").checked).toBe(true);
      f.click("[data-enable]"); await settle(); expect(f.counts().prompts).toBe(0);
    } else {
      expect((f.root.querySelector("[data-enable]") as HTMLButtonElement).disabled).toBe(true);
      expect(f.counts().subscriptions).toBe(0);
      expect(f.root.textContent).toContain(options.unsupported ? "Home Screen" : options.configured === false ? "notifications.contact" : "blocked");
    }
    f.controller.destroy();
  }
});

test("leaving during a permission prompt fences enrollment and late status", async () => {
  const f = fixture(); await f.controller.ready;
  let resolve!: (value: string) => void;
  f.setPermission(() => new Promise(done => { resolve = done; }));
  f.click("[data-enable]"); f.controller.destroy(); resolve("granted"); await settle();
  expect(f.requests.every(item => item.method === "GET")).toBe(true);
  expect(f.counts().subscriptions).toBe(0); expect(f.root.children.length).toBe(0);
});

test("unauthorized/error states never display server error bodies or success", async () => {
  for (const failure of [401, 500]) {
    const f = fixture({ failure }); await f.controller.ready;
    expect(f.root.textContent).toContain("Notification request failed");
    expect(f.root.textContent).not.toContain("PRIVATE");
    expect(f.root.textContent).not.toContain("preferences saved");
    expect(f.counts().unauthorized).toBe(failure === 401 ? 2 : 0);
    f.controller.destroy();
  }
});
