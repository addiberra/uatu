// Behaviors that are specific to the @pierre/trees-backed document tree.
// Kept in its own file so a focused failure doesn't drag the broader e2e
// suite into the swap-related fallout. Targets the library's a11y attributes
// (role="treeitem", aria-expanded, aria-selected, data-item-path) which
// Playwright reaches through the shadow DOM via standard CSS selectors.

import { expect, test, type Page } from "./fixtures";
import { promises as fs } from "node:fs";

import { workspacePath } from "./config";
import { treeRow } from "./tree-helpers";

test.afterEach(async ({ request }) => {
  await request.post("/__e2e/reset");
});

async function bootSession(
  page: Page,
  request: { post: (path: string, init?: { data: unknown }) => Promise<unknown> },
  body: Record<string, unknown> = {},
): Promise<void> {
  await request.post("/__e2e/reset", { data: body });
  await page.goto("/");
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      // best-effort
    }
  });
  await page.reload();
  // Wait for the SPA to indicate the live channel is connected and the index
  // has been loaded (file count > 0). Both are reliable, library-independent
  // readiness signals.
  await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
  await expect(page.locator("#document-count")).not.toHaveText("0 files", { timeout: 5_000 });
  // At least one tree row must be present in the shadow DOM. We don't assert
  // .toBeVisible() because the library virtualizes rows — in git-backed
  // sessions the workspace has 25+ files and the row we care about might
  // be scrolled out of the initial viewport. .toBeAttached() works on the
  // model presence, which is what we actually need for the test setup.
  await expect(page.locator('[role="treeitem"]').first()).toBeAttached();
}

test("manually expanding a folder, then clicking a file in it, leaves the folder expanded", async ({
  page,
  request,
}) => {
  await bootSession(page, request);

  const guidesFolder = treeRow(page, "guides/");
  await expect(guidesFolder).toBeVisible();
  await expect(guidesFolder).toHaveAttribute("aria-expanded", "false");

  await guidesFolder.click();
  await expect(guidesFolder).toHaveAttribute("aria-expanded", "true");

  const setupFile = treeRow(page, "guides/setup.md");
  await expect(setupFile).toBeVisible();
  await setupFile.click();

  // Preview switches to the clicked file.
  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md");

  // And — the regression we're protecting against — the folder we expanded
  // by hand must NOT collapse just because the selection changed.
  await expect(guidesFolder).toHaveAttribute("aria-expanded", "true");
  await expect(setupFile).toHaveAttribute("aria-selected", "true");
});

test("starting with follow on and a nested file as default reveals its ancestors and selects it", async ({
  page,
  request,
}) => {
  // Make `guides/setup.md` the newest non-binary file so it becomes the
  // default selection. resetE2EWorkspace bumps README's mtime 10s into the
  // future, so we have to go even fresher.
  const fresh = new Date(Date.now() + 30_000);

  // Reset first (this also bumps README's mtime by 10s), then make setup.md
  // strictly newer. We open the SPA AFTER the utimes — and after a short
  // wait so the polling watcher (100ms interval) has time to detect the
  // mtime change — so the session's "default document" is setup.md by the
  // time the SPA asks for initial state.
  await request.post("/__e2e/reset", { data: { follow: true } });
  await fs.utimes(workspacePath("guides", "setup.md"), fresh, fresh);
  await new Promise(resolve => setTimeout(resolve, 800));

  await page.goto("/");
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      // best-effort
    }
  });
  await page.reload();

  await expect(page.locator("#connection-state .connection-label")).toHaveText("Connected");
  // Allow up to 15s for the watcher to observe the utimes change and the SSE
  // refresh to land on the SPA. The default expect timeout (10s) is enough
  // most of the time but can race under load.
  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md", { timeout: 15_000 });

  // The tree should have revealed `guides/` on first paint and marked
  // `guides/setup.md` as selected.
  const guidesFolder = treeRow(page, "guides/");
  await expect(guidesFolder).toHaveAttribute("aria-expanded", "true");

  const setupFile = treeRow(page, "guides/setup.md");
  await expect(setupFile).toBeVisible();
  await expect(setupFile).toHaveAttribute("aria-selected", "true");
});

test("follow-mode auto-switch expands the new file's folder, selects it, and deselects the previous file", async ({
  page,
  request,
}) => {
  await bootSession(page, request);

  // bootSession returns with the server-default Follow=true. Click a tree
  // row to establish a deterministic Follow=false starting state (Rule A),
  // then click the Follow chip to flip back to Follow=true (Rule B).
  await treeRow(page, "README.md").click();
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#follow-toggle").click();
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(treeRow(page, "guides/")).toHaveAttribute("aria-expanded", "false");

  // Touch a nested file — follow must auto-switch to it (Rule C).
  await fs.writeFile(
    workspacePath("guides", "setup.md"),
    "# Setup\n\nFollow me into the folder.\n",
    "utf8",
  );

  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md");

  // The destination folder must now be expanded so the user can see what
  // got selected.
  await expect(treeRow(page, "guides/")).toHaveAttribute("aria-expanded", "true");

  // The newly-active file is selected, the previously-active one is not.
  await expect(treeRow(page, "guides/setup.md")).toHaveAttribute("aria-selected", "true");
  await expect(treeRow(page, "README.md")).toHaveAttribute("aria-selected", "false");
});

test("clicking an image file renders an inline image preview", async ({ page, request }) => {
  // Use an SVG — its bytes are text, so they survive the e2e server's
  // JSON+utf8 file-write round-trip without any base64 dance. The
  // VIEWABLE_IMAGE_EXTENSIONS set in app.ts includes .svg.
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#1ca8a7"/></svg>`;
  await bootSession(page, request, { extras: { "hero.svg": svg } });

  const logoRow = treeRow(page, "hero.svg");
  await expect(logoRow).toBeVisible();
  await logoRow.click();

  await expect(page.locator("#preview-path")).toHaveText("hero.svg");
  // An <img> renders inside the preview, sourced from the static-file
  // fallback at /hero.svg (resolved via the per-document <base href>).
  const img = page.locator("#preview .image-preview img");
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("alt", "hero.svg");
  // The image actually loads (non-zero naturalWidth means the browser
  // received bytes the decoder accepts).
  await page.waitForFunction(() => {
    const el = document.querySelector("#preview .image-preview img") as HTMLImageElement | null;
    return el != null && el.complete && el.naturalWidth > 0;
  });
});

test("clicking a non-image binary shows a 'not viewable' notice, not a 'no longer exists' error", async ({
  page,
  request,
}) => {
  // A short blob with a NUL byte forces binary classification via the content sniff.
  const zipBytes = "PK\x03\x04\u0000ignored\u0000binary content";
  await bootSession(page, request, { extras: { "archive.zip": zipBytes } });

  const archiveRow = treeRow(page, "archive.zip");
  await expect(archiveRow).toBeVisible();
  await archiveRow.click();

  await expect(page.locator("#preview-path")).toHaveText("archive.zip");
  // Friendly message, not the legacy "no longer exists" wording.
  await expect(page.locator("#preview")).toContainText("isn't viewable");
  await expect(page.locator("#preview")).not.toContainText("no longer exists");
  // No image element is rendered for non-image binaries.
  await expect(page.locator("#preview .image-preview img")).toHaveCount(0);
});

test("a user-expanded folder is preserved across an unrelated filesystem refresh", async ({
  page,
  request,
}) => {
  await bootSession(page, request);

  // User expands `metadata/`.
  const metadataFolder = treeRow(page, "metadata/");
  await expect(metadataFolder).toBeVisible();
  await metadataFolder.click();
  await expect(metadataFolder).toHaveAttribute("aria-expanded", "true");

  // An unrelated file changes on disk (NOT inside metadata/). The watcher
  // refreshes the index and a resetPaths-driven re-render happens. The
  // expansion the user chose must survive.
  await fs.writeFile(workspacePath("README.md"), "# Refreshed\n\nNew content.\n", "utf8");

  // Wait for the actual refresh, not a delay that can pass before delivery.
  await expect(page.locator("#preview")).toContainText("New content.");

  await expect(metadataFolder).toHaveAttribute("aria-expanded", "true");
});

test("a user-expanded folder is preserved when a file is added", async ({ page, request }) => {
  await bootSession(page, request);
  await treeRow(page, "README.md").click();
  const metadataFolder = treeRow(page, "metadata/");
  await metadataFolder.click();
  await expect(metadataFolder).toHaveAttribute("aria-expanded", "true");

  await fs.writeFile(workspacePath("added.md"), "# Added\n", "utf8");
  await expect(treeRow(page, "added.md")).toBeAttached();
  await expect(metadataFolder).toHaveAttribute("aria-expanded", "true");
});

async function collapseSelectedAncestorAndExpandMetadata(page: Page): Promise<void> {
  const guidesFolder = treeRow(page, "guides/");
  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md");
  await expect(treeRow(page, "guides/setup.md")).toHaveAttribute("aria-selected", "true");
  await treeRow(page, "metadata/").click();
  await expect(treeRow(page, "metadata/")).toHaveAttribute("aria-expanded", "true");
  await guidesFolder.click();
  await expect(guidesFolder).toHaveAttribute("aria-expanded", "false");
}

async function expectPreservedFolderState(page: Page, follow = false): Promise<void> {
  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md");
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", String(follow));
  await expect(treeRow(page, "metadata/")).toHaveAttribute("aria-expanded", "true");
  const guidesFolder = treeRow(page, "guides/");
  await expect(guidesFolder).toHaveAttribute("aria-expanded", "false");

  // Selection must survive even while its row is hidden, including resetPaths.
  const selectedPaths = () => page.locator("#tree").evaluate(element =>
    (element as HTMLElement & { __pierreFileTree: { getSelectedPaths(): string[] } }).__pierreFileTree.getSelectedPaths());
  await expect.poll(selectedPaths).toEqual(["guides/setup.md"]);
  await guidesFolder.click();
  await expect(guidesFolder).toHaveAttribute("aria-expanded", "true");
  await expect(treeRow(page, "guides/setup.md")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md");
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", String(follow));
}

test("a user-collapsed active folder stays collapsed when its file is updated", async ({ page, request }) => {
  await bootSession(page, request);
  await treeRow(page, "guides/").click();
  await treeRow(page, "guides/setup.md").click();
  await collapseSelectedAncestorAndExpandMetadata(page);
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");

  await fs.writeFile(workspacePath("guides", "setup.md"), "# Setup\n\nCollapsed folder refresh.\n", "utf8");
  await expect(page.locator("#preview")).toContainText("Collapsed folder refresh.");
  await expectPreservedFolderState(page);
});

test("a user-collapsed active folder stays collapsed when an unrelated file is added", async ({ page, request }) => {
  await bootSession(page, request);
  await treeRow(page, "guides/").click();
  await treeRow(page, "guides/setup.md").click();
  await collapseSelectedAncestorAndExpandMetadata(page);
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");

  await fs.writeFile(workspacePath("added.md"), "# Added\n", "utf8");
  await expect(treeRow(page, "added.md")).toBeAttached();
  await expectPreservedFolderState(page);
});

for (const operation of ["removed", "renamed"] as const) {
  test(`a user-collapsed active folder stays collapsed when an unrelated file is ${operation}`, async ({ page, request }) => {
    await bootSession(page, request, { extras: { "unrelated.md": "# Unrelated\n" } });
    await treeRow(page, "guides/").click();
    await treeRow(page, "guides/setup.md").click();
    await collapseSelectedAncestorAndExpandMetadata(page);
    await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");
    // Establish presence before removal so absence cannot pass before delivery.
    await expect(treeRow(page, "unrelated.md")).toBeAttached();
    if (operation === "removed") {
      await fs.unlink(workspacePath("unrelated.md"));
    } else {
      await fs.rename(workspacePath("unrelated.md"), workspacePath("renamed.md"));
      await expect(treeRow(page, "renamed.md")).toBeAttached();
    }
    await expect(treeRow(page, "unrelated.md")).not.toBeAttached();
    await expectPreservedFolderState(page);
  });
}

test("a user-collapsed active folder stays collapsed with Follow on when the same document updates", async ({ page, request }) => {
  await bootSession(page, request);
  await treeRow(page, "README.md").click();
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#follow-toggle").click();
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "true");
  await fs.writeFile(workspacePath("guides", "setup.md"), "# Setup\n\nFollow setup.\n", "utf8");
  await expect(page.locator("#preview")).toContainText("Follow setup.");
  await collapseSelectedAncestorAndExpandMetadata(page);
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "true");

  await fs.writeFile(workspacePath("guides", "setup.md"), "# Setup\n\nSame document refreshed with Follow.\n", "utf8");
  await expect(page.locator("#preview")).toContainText("Same document refreshed with Follow.");
  await expectPreservedFolderState(page, true);
});

test("pointer and keyboard navigation retain folder focus after a collapsed active leaf refresh", async ({ page, request }) => {
  await bootSession(page, request);
  await treeRow(page, "README.md").click();
  await page.locator("#follow-toggle").click();
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "true");
  await fs.writeFile(workspacePath("guides", "setup.md"), "# Setup\n\nNavigation before refresh.\n", "utf8");
  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md");
  const folder = treeRow(page, "guides/");
  await folder.click();
  await expect(folder).toHaveAttribute("aria-expanded", "false");

  await fs.writeFile(workspacePath("guides", "setup.md"), "# Setup\n\nNavigation after refresh.\n", "utf8");
  await expect(page.locator("#preview")).toContainText("Navigation after refresh.");
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await folder.click();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(treeRow(page, "guides/setup.md")).toHaveAttribute("aria-selected", "true");
  const focusedPath = () => page.locator("#tree").evaluate(element =>
    (element as HTMLElement & { __pierreFileTree: { getFocusedPath(): string | null } }).__pierreFileTree.getFocusedPath());
  await expect.poll(focusedPath).toBe("guides/");
  await expect(folder).toBeFocused();
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "true");

  // The fixture has exactly notes.adoc then setup.md in guides/. Right from
  // the open folder focuses its first child; arrows move focus independently
  // of the active document until Enter activates the focused file.
  await page.keyboard.press("ArrowRight");
  await expect.poll(focusedPath).toBe("guides/notes.adoc");
  await page.keyboard.press("ArrowDown");
  await expect.poll(focusedPath).toBe("guides/setup.md");
  await page.keyboard.press("ArrowUp");
  await expect.poll(focusedPath).toBe("guides/notes.adoc");
  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md");
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator("#preview-path")).toHaveText("guides/notes.adoc");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/guides/notes.adoc");
  await expect(treeRow(page, "guides/notes.adoc")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");
  await treeRow(page, "guides/setup.md").click();
  await expect(page.locator("#preview-path")).toHaveText("guides/setup.md");
  await expect(treeRow(page, "guides/setup.md")).toHaveAttribute("aria-selected", "true");
});

// Spec coverage for the `document-tree` capability's "Render the document
// tree through `@pierre/trees`" requirement — verifies that uatu hands the
// Files-pane DOM ownership over to the library and no longer emits its
// hand-rolled `<details>`/`<summary>` tree markup.
test("the Files pane does not render uatu's legacy <details>/<summary> tree markup", async ({
  page,
  request,
}) => {
  await bootSession(page, request);

  // Legacy markup is fully retired from app.ts; the only summary/details
  // nodes in #tree would be from a manual render, which we no longer do.
  const filesPane = page.locator('[data-pane-id="files"]');
  await expect(filesPane.locator("details")).toHaveCount(0);
  await expect(filesPane.locator("summary")).toHaveCount(0);
});

// Spec coverage for `document-tree` "Render the document tree" — selection
// scenario: clicking a non-binary row loads the preview and disables follow.
test("clicking a non-binary tree row loads its preview and disables follow mode", async ({
  page,
  request,
}) => {
  await bootSession(page, request);

  // Normalize follow to ON so we can observe it being disabled by a manual
  // click. Boot state is non-deterministic (the library may async-fire
  // onSelectionChange after the synchronous programmatic-update guard), so
  // we toggle the chip iff it's currently off.
  const pressed = await page.locator("#follow-toggle").getAttribute("aria-pressed");
  if (pressed !== "true") {
    await page.locator("#follow-toggle").click();
  }
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "true");

  await treeRow(page, "diagram.md").click();

  await expect(page.locator("#preview-path")).toHaveText("diagram.md");
  await expect(page.locator("#follow-toggle")).toHaveAttribute("aria-pressed", "false");
});

// Spec coverage for `document-tree` "Display file-type icons via the library's
// built-in 'standard' icon set" — verifies the library's icon decoration
// resolves for a Markdown row.
test("tree rows render an icon via the library's built-in icon set", async ({
  page,
  request,
}) => {
  await bootSession(page, request);

  // The library renders icons via `<svg>` (sprite) or `<use>` references
  // inside the row. We just assert one is present — exact sprite identity
  // is an internal contract we don't pin in spec.
  const readmeRow = treeRow(page, "README.md");
  await expect(readmeRow.locator("svg")).toHaveCount(await readmeRow.locator("svg").count());
  // Stronger assertion: at least one SVG-shaped child is present.
  expect(await readmeRow.locator("svg").count()).toBeGreaterThan(0);
});

// Spec coverage for `document-tree` "Surface git status as row annotations".
// A working-tree modification on a git-backed repo MUST surface as a row
// annotation (the library exposes git status via `data-item-git-status`).
test("modified files show a git-status annotation; clean rows do not", async ({
  page,
  request,
}) => {
  // Boot a git-backed session with README dirty so review-load reports it
  // as a changed file. The git-init helper also pre-commits the fixture and
  // adds branch + history commits, so the workspace has many tracked files
  // — useful for exercising the library's annotation API at scale.
  await bootSession(page, request, {
    git: true,
    dirty: { "README.md": "# Modified for review-load\n" },
  });

  // The library renders rows with `data-item-git-status="<status>"` for any
  // path the SPA fed into `setGitStatus(...)`. With README dirty, at least
  // one row in the (virtualized) tree must surface a status annotation.
  // We don't pin the exact status string (added vs modified vs untracked
  // depending on review-load behavior) — only that one is present.
  await expect(page.locator("[data-item-git-status]").first()).toBeAttached({ timeout: 5_000 });

  // The number of annotated rows should be strictly smaller than the total
  // file count — a tree where EVERY row was annotated would mean review-load
  // is over-reporting (or our adapter is feeding it the whole path list).
  const annotatedCount = await page.locator("[data-item-git-status]").count();
  const totalRows = await page.locator('[role="treeitem"][data-item-type="file"]').count();
  expect(annotatedCount).toBeLessThan(totalRows);
});

// Spec coverage for `document-watch-index` "Detect binary files and route
// them to the right preview" — the image branch.
// (We already have an SVG-based image-preview test above. This is the
// negative-case sibling: a non-image binary routes to the "not viewable"
// message rather than to the legacy "no longer exists" error.)
test("a binary tree row routes to the preview-unavailable view, not 'no longer exists'", async ({
  page,
  request,
}) => {
  await bootSession(page, request, {
    extras: { "data.bin": "PK ignored binary content with NUL \0 byte" },
  });

  const binRow = treeRow(page, "data.bin");
  await expect(binRow).toBeVisible();
  await binRow.click();

  await expect(page.locator("#preview-path")).toHaveText("data.bin");
  await expect(page.locator("#preview")).toContainText("isn't viewable");
  await expect(page.locator("#preview")).not.toContainText("no longer exists");
});
