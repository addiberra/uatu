import { describe, expect, test } from "bun:test";
import { expandedWorkBudget } from "./work-budget";

describe("expanded work capacity", () => {
  test("uses actual remaining layout pixels, not a viewport percentage cap", () => {
    expect(expandedWorkBudget(600, 150)).toEqual({ reading: 96, capacity: 504 });
    expect(expandedWorkBudget(300, 150)).toEqual({ reading: 60, capacity: 240 });
    expect(expandedWorkBudget(140, 90)).toEqual({ reading: 32, capacity: 108 });
  });
  test("yields its preferred strip to whole actions, retaining a truthful small strip", () => {
    expect(expandedWorkBudget(100, 90)).toEqual({ reading: 10, capacity: 90 });
    expect(expandedWorkBudget(100, 160)).toEqual({ reading: 10, capacity: 90 });
    expect(expandedWorkBudget(0, 160)).toEqual({ reading: 0, capacity: 0 });
    expect(expandedWorkBudget(-20, 160)).toEqual({ reading: 0, capacity: 0 });
  });
});
