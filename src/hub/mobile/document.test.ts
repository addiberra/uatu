import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { mobileBundleUrl, mobileHubAssets, withMobileHubBootstrap } from "./document";
import { dashboardPage } from "../pages";

test("bundled mobile document exposes only trusted asset tags, not a second document or test controls", () => {
  expect(mobileHubAssets('<html><head><link rel="stylesheet" href="/chunk-12345678.css"></head><body><script type="module" src="/chunk-12345678.js"></script></body></html>')).toBe('<link rel="stylesheet" href="/chunk-12345678.css">\n<script type="module" src="/chunk-12345678.js"></script>');
  expect(() => mobileHubAssets("<html>missing entry</html>")).toThrow("unavailable");
  expect(() => mobileHubAssets('<script src="https://attacker.invalid/code.js"></script>')).toThrow("Invalid");
  expect(() => mobileHubAssets('<script src="/api/hub/state"></script>')).toThrow("Invalid");
  expect(mobileHubAssets('<script src="/chunk-12345678.js" onload="untrusted()"></script>')).toBe('<script type="module" src="/chunk-12345678.js"></script>');
});

test("mobile bundle self-fetch uses only the configured listener, including IPv6 and TLS", () => {
  expect(mobileBundleUrl("0.0.0.0", 4717, false)).toBe("http://127.0.0.1:4717/__uatu/mobile-hub");
  expect(mobileBundleUrl("::", 8445, true)).toBe("https://[::1]:8445/__uatu/mobile-hub");
  expect(mobileBundleUrl("127.0.0.2", 4717, false)).toBe("http://127.0.0.2:4717/__uatu/mobile-hub");
});

test.each([
  { coarse: true, mode: null, touch: true },
  { coarse: false, mode: null, touch: false },
  { coarse: true, mode: "desktop", touch: false },
  { coarse: false, mode: "touch", touch: true },
  { coarse: false, mode: "unexpected", touch: false },
])("Hub bootstrap respects scoped presentation mode: %j", ({ coarse, mode, touch }) => {
  const html = withMobileHubBootstrap(dashboardPage("fixture-user"), '<script src="/fixture-entry.js" type="module"></script>');
  const dataset: Record<string, string> = {};
  const stamp = html.match(/<script>\(\(\)=>\{let mode;[\s\S]*?<\/script>/)![0].replace(/^<script>|<\/script>$/g, "");
  runInNewContext(stamp, { document: { documentElement: { dataset } }, localStorage: { getItem(key: string) { expect(key).toBe("uatu:presentation:v1:%2F:uatu:ui-mode"); return mode; } }, matchMedia: () => ({ matches: coarse }) });
  expect(dataset.mobileHub === "true").toBe(touch);
  expect(html).toContain('if (document.documentElement.dataset.mobileHub !== "true")');
  expect(html.indexOf("let mode;")).toBeLessThan(html.indexOf('const pageMode ='));
});
