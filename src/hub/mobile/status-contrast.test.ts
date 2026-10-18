import { expect, test } from "bun:test";

const tokens = await Bun.file(new URL("./tokens.css", import.meta.url)).text();
const recipes = await Bun.file(new URL("./styles.css", import.meta.url)).text();

// Resolve the actual declarations in cascade order, including combined media
// preferences, rather than copying the theme's colors into the assertions.
function theme(dark: boolean, more: boolean) {
  const roles: Record<string, string> = {};
  const [base, ...media] = tokens.split("@media");
  const apply = (css: string) => {
    for (const [, role, value] of css.matchAll(/(--mh-[\w-]+):\s*([^;]+);/g)) roles[role!] = value!.trim();
  };
  apply(base!);
  for (const block of media) {
    if ((dark && block.startsWith(" (prefers-color-scheme: dark)")) || (more && block.startsWith(" (prefers-contrast: more)"))) apply(block);
  }
  return roles;
}

function luminance(hex: string) {
  expect(hex).toMatch(/^#(?:[\da-f]{3}|[\da-f]{6})$/i);
  const full = hex.length === 4 ? hex.slice(1).replace(/./g, c => c + c) : hex.slice(1);
  const rgb = full.match(/../g)!.map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
}

for (const dark of [false, true]) for (const more of [false, true]) {
  test(`positive status text contrast: ${dark ? "dark" : "light"}, contrast ${more ? "more" : "normal"}`, () => {
    const roles = theme(dark, more);
    const foreground = luminance(roles["--mh-positive"]!);
    for (const surface of ["--mh-surface", "--mh-canvas"]) {
      const background = luminance(roles[surface]!);
      const ratio = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
      expect(ratio).toBeGreaterThanOrEqual(4.9); // AA's 4.5:1 plus a deliberate margin.
    }
    expect(roles["--mh-switch-on"]).toBe(more ? "#248a3d" : "#34c759");
    expect(roles["--mh-switch-on"]).not.toBe(roles["--mh-positive"]);
    if (dark) expect(roles["--mh-positive"]).toBe("#65d881");
  });
}

test("Running and Connected share the positive text role, not switch fill", () => {
  expect(recipes).toMatch(/\.mh-root \.mh-running, \.mh-root \.mh-identity \.mh-running \{ color: var\(--mh-positive\); \}/);
  expect(recipes).toMatch(/\.mh-root \.mh-identity \{[^}]*background: var\(--mh-surface\)/);
  expect(recipes).toMatch(/\.mh-root \.mh-group \{[^}]*background: var\(--mh-surface\)/);
  expect(recipes).toMatch(/\.mh-root \.mh-switch input:checked \{ background: var\(--mh-switch-on\)/);
});
