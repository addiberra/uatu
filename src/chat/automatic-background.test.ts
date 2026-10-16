import { expect, test } from "bun:test";
import { automaticBackgroundNote } from "./automatic-background";

test("automatic feedback preserves accepted steer without claiming delivery, worker counts or completion", () => {
  expect(automaticBackgroundNote(undefined)).toBe("");
  expect(automaticBackgroundNote("accepted")).toBe("Steer accepted; background request acknowledged. Jobs may still be running.");
  expect(automaticBackgroundNote("not-needed")).toBe("Steer accepted; no confirmed blocking work was observed.");
  for (const outcome of ["failed", "unavailable", "unknown"] as const) {
    const note = automaticBackgroundNote(outcome);
    expect(note).toContain("Steer accepted");
    expect(note).not.toMatch(/delivered|finished|completed|resend/i);
  }
  expect(automaticBackgroundNote("unknown")).toContain("could not be confirmed");
});
