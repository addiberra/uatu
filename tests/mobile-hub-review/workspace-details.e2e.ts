import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { assertDisposableReview } from "./navigation";

test.beforeEach(async ({ request, baseURL }) => {
  await assertDisposableReview(request, baseURL);
  await request.post("/review/reset", { data: { scenario: "mixed" } });
});

test("Details touch targets, full-page management, Back and Hub scroll survive all sizes/themes", async ({ page }, info) => {
  const geometry: unknown[] = [];
  for (const [width, height] of [[320, 568], [390, 664], [430, 932], [768, 1024], [1280, 800]]) {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      const details = page.getByRole("button", { name: "Details for Notes, /synthetic/notes", exact: true });
      await expect(details).toHaveText("Details");
      const target = (await details.boundingBox())!;
      expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator('[data-action="open:atlas"]')).toHaveText("Open");
      await expect(page.locator('[data-action="start:notes"]')).toHaveText("Start");
      if (process.env.UATU_DETAILS_EVIDENCE) await page.screenshot({ path: `${process.env.UATU_DETAILS_EVIDENCE}/${info.project.name}-${width}-${colorScheme}-hub-initial.png` });
      await page.locator(".mh-page").evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect.poll(() => page.locator(".mh-page").evaluate(el => {
        const dock = document.querySelector(".mh-dock")!.getBoundingClientRect();
        const add = el.querySelector(".mh-add")!.getBoundingClientRect();
        return el.getBoundingClientRect().bottom <= dock.top - 7 && add.bottom <= el.getBoundingClientRect().bottom && el.scrollWidth <= el.clientWidth;
      })).toBe(true);
      geometry.push(await page.locator(".mh-page").evaluate((el, appearance) => {
        const rect = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        return { ...appearance, page: rect(".mh-page"), dock: rect(".mh-dock"), add: rect(".mh-add"), support: rect(".mh-add small"), details: rect(".mh-workspace-details"), scrollTop: el.scrollTop };
      }, { width, height, colorScheme }));
      if (process.env.UATU_DETAILS_EVIDENCE) await page.screenshot({ path: `${process.env.UATU_DETAILS_EVIDENCE}/${info.project.name}-${width}-${colorScheme}-hub.png` });
      // Focus the trigger before capturing the scroll position, as on keyboard navigation.
      await details.focus();
      const top = await page.locator(".mh-page").evaluate(el => el.scrollTop);
      await details.click();
      await expect(page.locator(".mh-flow-page h1")).toHaveText("Notes");
      await expect(page.locator('.mh-task, [data-action^="manage:"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Rename display name/ })).toHaveCount(1);
      await expect(page.getByRole("button", { name: /^Edit workspace credentials/ })).toHaveCount(1);
      if (process.env.UATU_DETAILS_EVIDENCE) await page.screenshot({ path: `${process.env.UATU_DETAILS_EVIDENCE}/${info.project.name}-${width}-${colorScheme}-details-initial.png` });
      await page.locator(".mh-safety-disclosure > summary").click();
      await expect(page.locator(".mh-flow-page")).toContainText("/synthetic/notes");
      await expect(page.locator(".mh-flow-page")).toContainText("Git authentication");
      await expect(page.locator(".mh-flow-page")).toContainText("Commit signing");
      await page.locator(".mh-flow-content").evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect.poll(() => page.locator(".mh-flow-content").evaluate(el => {
        const last = el.lastElementChild!.getBoundingClientRect();
        return last.bottom <= el.getBoundingClientRect().bottom + 1 && el.getBoundingClientRect().bottom <= document.querySelector(".mh-dock")!.getBoundingClientRect().top;
      })).toBe(true);
      if (process.env.UATU_DETAILS_EVIDENCE) await page.screenshot({ path: `${process.env.UATU_DETAILS_EVIDENCE}/${info.project.name}-${width}-${colorScheme}-details.png` });
      await page.locator('[data-flow="flow-back"]').click();
      await expect(details).toBeFocused();
      expect(await page.locator(".mh-page").evaluate(el => el.scrollTop)).toBeCloseTo(top, 0);
    }
  }
  await info.attach("workspace-details-geometry", { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
  if (process.env.UATU_DETAILS_EVIDENCE) await writeFile(`${process.env.UATU_DETAILS_EVIDENCE}/${info.project.name}-geometry.json`, JSON.stringify(geometry, null, 2));
});

test("Details remains direct across runtime and branch states without starting a session", async ({ page, request }) => {
  for (const scenario of ["all-running", "all-stopped", "branches"] as const) {
    await request.post("/review/reset", { data: { scenario } }); await page.goto("/");
    const cards = page.locator(".mh-workspace");
    await expect(cards.first()).toBeVisible();
    for (const summary of await page.locator(".mh-workspace-family > summary").all()) {
      if (!await summary.evaluate(el => (el.parentElement as HTMLDetailsElement).open)) await summary.click();
    }
    expect(await cards.count()).toBeGreaterThan(0);
    for (let index = 0; index < await cards.count(); index++) {
      const card = cards.nth(index);
      await expect(card).toBeVisible();
      const details = card.getByRole("button", { name: /^Details for / });
      await expect(details).toBeEnabled(); await details.click();
      await expect(page.locator(".mh-flow-page h1")).toBeVisible();
      await page.locator('[data-flow="flow-back"]').click(); await expect(details).toBeFocused();
    }
    expect((await (await request.get("/review/state")).json()).log).toEqual([]);
  }
});

test("direct Open and Start still enter the intended workspace; Return survives Details", async ({ page, request }) => {
  await page.goto("/"); await page.locator('[data-action="open:atlas"]').click();
  await expect(page.locator("#preview")).toContainText("Synthetic review document");
  if (await page.locator("#navigation-handle").isVisible()) await page.locator("#navigation-handle").click();
  await page.locator("#navigation-hub").click();
  await page.getByRole("button", { name: "Details for Notes, /synthetic/notes", exact: true }).click();
  await page.locator('[data-flow="flow-back"]').click();
  await expect(page.locator(".mh-return")).toContainText("Atlas");
  await page.locator('[data-action="return"]').click(); await expect(page.locator("#preview")).toContainText("Synthetic review document");
  if (await page.locator("#navigation-handle").isVisible()) await page.locator("#navigation-handle").click();
  await page.locator("#navigation-hub").click();
  await page.locator('[data-action="start:notes"]').click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/s\/notes\//);
  await expect(page.locator("#preview")).toContainText("Synthetic review document");
  expect((await (await request.get("/review/state")).json()).log.filter((entry: { method: string }) => entry.method === "startWorkspace")).toHaveLength(1);
});

test("enlarged text and raised safe-area dock keep the bottom action reachable without changing preferences", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const preferences = { side: "right", position: 0.4, autoHide: false, previewSide: "right" };
  await page.addInitScript(value => localStorage.setItem("uatu:navigation:v1:hub", JSON.stringify(value)), preferences);
  await page.goto("/");
  // Browser stress of the occupied safe-area band, not physical iOS validation.
  await page.addStyleTag({ content: "html { font-size: 200%; } .mh-root .mh-dock { bottom: 34px; }" });
  await page.locator(".mh-page").evaluate(el => { el.scrollTop = el.scrollHeight; });
  const add = page.locator(".mh-add");
  await expect.poll(() => add.evaluate(el => {
    const dock = document.querySelector(".mh-dock")!.getBoundingClientRect(), r = el.getBoundingClientRect();
    const scroll = document.querySelector(".mh-page")!;
    return r.bottom <= dock.top - 8 && r.top >= scroll.getBoundingClientRect().top && scroll.scrollWidth <= scroll.clientWidth;
  })).toBe(true);
  await add.click(); await expect(page.locator(".mh-flow-page h1")).toHaveText("Add Workspace");
  await page.locator('[data-flow="flow-back"]').click(); await expect(add).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("uatu:navigation:v1:hub")!))).toEqual(preferences);
});
