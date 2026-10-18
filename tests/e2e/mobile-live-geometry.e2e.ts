import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, loginHub, hubPost } from "./hub-mobile-fixtures";
import { captureScreenshot, saveEvidence } from "./evidence";
import { sharedUidWarning } from "../../src/hub/mobile/flow-ui";

// Real CLI Hub, production documents, bundled CSS and retained workspace shell.
// Geometry assertions deliberately do not bless a screenshot/golden on update.
test("isolated, production direct and retained overviews share the refined geometry", async ({ page, hub }, testInfo) => {
  test.setTimeout(90_000);
  execFileSync("git", ["-C", hub.workspaces.a, "symbolic-ref", "HEAD", "refs/heads/main"], { env: hub.env });
  await loginHub(page, hub);
  const { workspace } = await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "Atlas", start: false });
  await hubPost(page.request, hub, `/api/hub/sessions/${workspace.id}/start`);
  // Same real API fixtures, with ONLY the frontend's own stylesheet. This
  // control catches both production-host leaks and accidental host dependence.
  const assets = testInfo.outputPath("isolated-assets");
  execFileSync("bun", ["build", "tests/e2e/mobile-live-test-entry.ts", "--target=browser", "--outdir", assets]);
  await page.route(`${hub.origin}/__geometry-standalone`, route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="uatu-hub" content="true"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__geometry-assets/mobile-live-test-entry.css"><style>html,body,#live-mobile-test{height:100%;margin:0}</style></head><body><div id="live-mobile-test"></div><script type="module" src="/__geometry-assets/mobile-live-test-entry.js"></script></body></html>' }));
  await page.route(`${hub.origin}/__geometry-assets/*`, async route => { const file = path.basename(new URL(route.request().url()).pathname); await route.fulfill({ body: await readFile(path.join(assets, file)), contentType: file.endsWith(".css") ? "text/css" : "text/javascript" }); });
  const measurements: unknown[] = [];
  const direct = new Map<string, unknown>();
  for (const entry of ["isolated", "direct", "retained"] as const) {
    if (entry === "isolated") await page.goto(`${hub.origin}/__geometry-standalone`);
    else if (entry === "direct") await page.goto(hub.origin);
    else {
      await page.goto(`${hub.origin}/s/${workspace.id}/README.md`);
      await expect(page.locator("#preview-path")).toHaveText("README.md");
      await expect.poll(() => page.locator("#mobile-workspace-root").evaluate(el => el.getBoundingClientRect().x)).toBe(0);
      if (await page.locator("#navigation-handle").isVisible()) await page.locator("#navigation-handle").click();
      await page.locator("#navigation-hub").click();
    }
    await expect(page.locator(".mh-dock")).toBeVisible();
    for (const route of ["hub", "settings"] as const) {
      await page.locator(`[data-action="${route}"]`).click();
      await expect(page.locator(".mh-page main > h1")).toHaveText(route === "hub" ? "Workspaces" : "Settings");
      await expect(page.locator(".mh-workspace")).toHaveCount(route === "hub" ? 1 : 0);
      await expect(page.locator(".mh-subtitle")).toHaveCount(route === "hub" ? 1 : 0);
      await page.evaluate(() => document.fonts.ready);
      await captureScreenshot(page, testInfo, `${entry}-${route}`);
      const cascade = await page.locator(".mh-page").evaluate(el => {
        const selectors = ["main", "h1", ".mh-subtitle", ".mh-section", ".mh-section > h2", ".mh-workspace", ".mh-status", ".mh-primary", ".mh-identity", ".mh-safety-details", ".mh-safety-details h2"];
        return selectors.map(selector => {
          const node = el.querySelector(selector); if (!node) return { selector };
          const css = getComputedStyle(node);
          const rules: string[] = [];
          function visit(list: CSSRuleList) { for (const rule of list) {
            if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
            if (rule instanceof CSSStyleRule && node!.matches(rule.selectorText)) rules.push(rule.cssText);
            else if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
          } }
          for (const sheet of document.styleSheets) { try { visit(sheet.cssRules); } catch {} }
          return { selector, padding: css.padding, margin: css.margin, font: css.font, letterSpacing: css.letterSpacing, rules };
        });
      });
      await saveEvidence(testInfo, `${entry}-${route}-cascade.json`, JSON.stringify(cascade, null, 2));
      const geometry = await page.locator(".mh-page").evaluate(el => {
        const measure = (selector: string) => {
          const node = el.querySelector(selector)!;
          const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, padding: css.padding, margin: css.margin, fontSize: css.fontSize, lineHeight: css.lineHeight, maxWidth: css.maxWidth, position: css.position };
        };
        return { main: measure("main"), heading: measure("main > h1"), brand: measure(".mh-brand"), card: measure(".mh-group"), safety: el.querySelector(".mh-safety-disclosure, .mh-safety-details")?.getBoundingClientRect().height ?? 0 };
      });
      measurements.push({ entry, route, ...geometry });
      await saveEvidence(testInfo, "geometry.json", JSON.stringify(measurements, null, 2));
      expect.soft(geometry.heading.x).toBe(20);
      // h1 line box at 65; its visible glyphs begin around y=72.
      expect.soft(geometry.heading.y).toBe(65);
      expect.soft(geometry.heading.fontSize).toBe("34px");
      expect.soft(geometry.card.x).toBe(20);
      expect.soft(geometry.card.width).toBe(350);
      expect.soft(geometry.main.padding).toBe("0px");
      if (entry === "isolated") direct.set(route, geometry);
      else expect.soft(geometry).toEqual(direct.get(route));
      if (route === "settings") {
        expect.soft(geometry.safety).toBeLessThan(60);
        expect.soft(await page.getByRole("heading", { name: "Credential safety details", exact: true }).isVisible()).toBe(false);
      }
    }
  }
});

for (const variant of [
  { name: "dark", width: 390, height: 844, scale: 1 },
  { name: "narrow-short", width: 320, height: 568, scale: 1 },
  { name: "landscape", width: 844, height: 390, scale: 1 },
  { name: "scoped-text", width: 390, height: 844, scale: 1.4 },
]) test.describe(variant.name, () => {
  test.use({ viewport: { width: variant.width, height: variant.height }, colorScheme: "dark" });
  test("production overview containment, whole status labels and reachable safety, accounts and notifications", async ({ page, hub }, testInfo) => {
    test.setTimeout(120_000);
    execFileSync("git", ["-C", hub.workspaces.a, "symbolic-ref", "HEAD", "refs/heads/main"], { env: hub.env });
    await loginHub(page, hub);
    const { workspace } = await hubPost<{ workspace: { id: string } }>(page.request, hub, "/api/hub/workspaces/configure", { path: hub.workspaces.a, displayName: "Atlas", start: false });
    await hubPost(page.request, hub, `/api/hub/sessions/${workspace.id}/start`);
    const { credential } = await hubPost<{ credential: { id: string } }>(page.request, hub, "/api/hub/credentials/token", { name: "Repository access", host: "example.test", token: "disposable-geometry-non-provider-token", capabilities: ["https-git"] });
    const facts = async (selector: string) => {
      const region = page.locator(selector);
      await expect(region).toContainText(sharedUidWarning);
      for (const fact of ["Do not run untrusted projects under this shared OS user.", "Disabling or deleting a provider token may stop running workspaces that still use it", "removing a running workspace's assignment requires stopping its shells first."]) await expect(region).toContainText(fact);
    };
    const direct = new Map<string, unknown>();
    for (const entry of ["direct", "retained"] as const) {
      if (entry === "direct") await page.goto(hub.origin);
      else {
        await page.goto(`${hub.origin}/s/${workspace.id}/README.md`);
        await expect(page.locator("#preview-path")).toHaveText("README.md");
        await expect.poll(() => page.locator("#mobile-workspace-root").evaluate(el => el.getBoundingClientRect().x)).toBe(0);
        if (await page.locator("#navigation-handle").isVisible()) await page.locator("#navigation-handle").click();
        await page.locator("#navigation-hub").click();
      }
      // Deliberately scoped type-role stress; not a claim of OS Dynamic Type.
      if (variant.scale !== 1) await page.addStyleTag({ content: `.mh-root { ${Object.entries({ page: 34, detail: 26, editor: 26, body: 17, value: 17, control: 15, secondary: 13, label: 13, navigation: 11 }).map(([role, size]) => `--mh-type-${role}: ${size * variant.scale}px;`).join(" ")} }` });
      const workspaceNode = entry === "retained" ? await page.locator("#mobile-workspace-root").elementHandle() : null;
      for (const route of ["hub", "settings"] as const) {
        await page.locator(`[data-action="${route}"]`).click();
        await expect(page.locator(".mh-page main > h1")).toHaveText(route === "hub" ? "Workspaces" : "Settings");
        if (route === "hub") await expect(page.locator(".mh-workspace")).toHaveCount(1);
        else await expect(page.locator("[data-credential-id]")).toHaveCount(1);
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.locator(".mh-page main").evaluate(main => {
          const heading = main.querySelector("h1")!.getBoundingClientRect();
          return { x: heading.x, y: heading.y, width: heading.width, cards: [...main.querySelectorAll(".mh-group")].map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }), overflow: main.scrollWidth - main.clientWidth };
        });
        const margin = variant.width === 320 ? 12 : 20;
        expect(geometry.x).toBe(margin); expect(geometry.width).toBe(variant.width - 2 * margin);
        if (variant.scale === 1) expect(geometry.y).toBe(65);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        if (entry === "direct") direct.set(route, geometry);
        else expect(geometry).toEqual(direct.get(route));
        await saveEvidence(testInfo, `${entry}-${route}-geometry.json`, JSON.stringify(geometry, null, 2));
        await captureScreenshot(page, testInfo, `${entry}-${route}`);
        if (route === "hub") {
          const status = await page.locator(".mh-runtime").evaluate(el => { const r = el.getBoundingClientRect(), parent = el.closest(".mh-workspace")!.getBoundingClientRect(); return { height: r.height, line: parseFloat(getComputedStyle(el).lineHeight), left: r.left - parent.left, right: parent.right - r.right, text: el.textContent }; });
          expect(status.text).toBe("● Running"); expect(status.height).toBeLessThanOrEqual(status.line + 1);
          expect(status.left).toBeGreaterThanOrEqual(0); expect(status.right).toBeGreaterThanOrEqual(0);
          // Running cards carry only the runtime fact; the branch stays on Information.
          await expect(page.locator(".mh-branch")).toHaveCount(0);
          continue;
        }
        const disclosure = page.locator(".mh-safety-disclosure"), summary = disclosure.locator("summary");
        await expect(disclosure).not.toHaveAttribute("open");
        await summary.focus(); await summary.press("Enter"); await expect(disclosure).toHaveAttribute("open", "");
        await facts(".mh-safety-disclosure");
        await expect(disclosure).toContainText("Assignments choose defaults for tools. They do not prevent another workspace on this Hub from accessing a credential.");
        await captureScreenshot(page, testInfo, `${entry}-safety-expanded`);
        const finalFacts = disclosure.locator(".mh-note").last();
        await finalFacts.evaluate(el => el.scrollIntoView({ block: "center" }));
        const clearance = await finalFacts.evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, dockTop: document.querySelector(".mh-dock")!.getBoundingClientRect().top }));
        expect(clearance.bottom).toBeLessThanOrEqual(clearance.dockTop);
        await expect(finalFacts).toBeInViewport();
        await captureScreenshot(page, testInfo, `${entry}-safety-final-facts`);
        await summary.press("Enter"); await expect(disclosure).not.toHaveAttribute("open");
        // The notice dismisses per user, but the details remain keyboard reachable.
        const dismiss = page.getByRole("button", { name: "Dismiss credential sharing notice" });
        if (entry === "retained" && await dismiss.count()) { await dismiss.click(); await expect(summary).toBeFocused(); }
        await summary.press("Enter"); await expect(disclosure).toHaveAttribute("open", ""); await facts(".mh-safety-disclosure");
        await summary.press("Enter");
        for (const destination of ["agent-accounts", "notifications"] as const) {
          await page.locator(`[data-action="${destination}"]`).click();
          await expect(page.locator(".mh-flow-page h1")).toHaveText(destination === "agent-accounts" ? "Agent accounts" : "Notifications");
          if (destination === "agent-accounts") {
            await expect(page.locator('.mh-flow-page [data-flow="refresh"]')).toBeVisible();
            await expect(page.locator(".mh-flow-page")).toContainText("Agent accounts are machine-wide and shared by all Hub users and running workspaces.");
          }
          await captureScreenshot(page, testInfo, `${entry}-${destination}`);
          const lastControl = page.locator(destination === "agent-accounts" ? '.mh-flow-page [data-flow="refresh"]' : ".mh-notifications .notification-actions button").last();
          await lastControl.evaluate(el => el.scrollIntoView({ block: "center" }));
          await expect(lastControl).toBeInViewport();
          expect(await lastControl.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
          await captureScreenshot(page, testInfo, `${entry}-${destination}-controls`);
          await page.locator('.mh-flow-page [data-flow="flow-back"]').click();
        }
        await page.locator(`[data-credential-id="${credential.id}"]`).click();
        await expect(page.locator(".mh-flow-page h1")).toHaveText("Repository access"); await facts(".mh-flow-page .mh-safety-details");
        if (workspaceNode) expect(await workspaceNode.evaluate(el => el === document.querySelector("#mobile-workspace-root"))).toBe(true);
      }
    }
    // Later assignment and clone tasks keep the full contextual explanation,
    // including after the overview's per-user notice was dismissed.
    for (const url of ["/settings?detail=assignments", "/clone"]) {
      await page.goto(`${hub.origin}${url}`); await facts(".mh-flow-page .mh-safety-details");
      if (url === "/clone") {
        const disclosure = page.locator(".mh-flow-page .mh-safety-disclosure");
        await expect(disclosure).not.toHaveAttribute("open");
        await disclosure.locator("summary").focus(); await page.keyboard.press("Enter");
        await expect(disclosure).toHaveAttribute("open", ""); await facts(".mh-flow-page .mh-safety-details");
      } else await expect(page.locator(".mh-flow-page .mh-safety-disclosure")).toHaveCount(0);
    }
    await page.goto(`${hub.origin}/settings`);
    await expect(page.locator(".mh-page [data-shared-uid]")).toHaveCount(0);
    await expect(page.locator(".mh-safety-disclosure summary")).toBeVisible();
  });
});

test.describe("unchanged fine-pointer desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, colorScheme: "light" });
  test("legacy desktop geometry and native titlebar inset stay outside mobile scope", async ({ page, hub }, testInfo) => {
    await loginHub(page, hub);
    for (const route of ["/", "/settings", "/clone"]) {
      await page.goto(`${hub.origin}${route}`);
      await expect(page.locator("#mobile-hub-root")).toHaveCount(0);
      const geometry = () => page.locator("body > main").evaluate(el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { x: r.x, width: r.width, padding: s.padding, maxWidth: s.maxWidth, position: s.position }; });
      expect(await geometry()).toEqual({ x: 380, width: 680, padding: "40px 20px 64px", maxWidth: "680px", position: "relative" });
      await page.evaluate(() => document.documentElement.style.setProperty("--titlebar-inset", "72px"));
      expect((await geometry()).padding).toBe("112px 20px 64px");
      await captureScreenshot(page, testInfo, route === "/" ? "desktop-hub" : `desktop-${route.slice(1)}`);
    }
  });
});
