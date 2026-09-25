import { describe, expect, test } from "bun:test";

import { dayLabel, fullDate, localDayKey, localDaysBetween, nextLocalMidnight, relativeReset, resetClock, resetMoment } from "./dates";

// Local wall-clock instants, so every case holds in whatever zone runs it.
const at = (month: number, day: number, hour = 12, minute = 0, year = 2026) => new Date(year, month - 1, day, hour, minute).getTime();
const clock = (value: number) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const weekday = (value: number) => new Date(value).toLocaleDateString([], { weekday: "short" });

describe("local calendar days", () => {
  test("days are counted by the calendar, not by 24-hour spans", () => {
    expect(localDaysBetween(at(9, 25, 23, 30), at(9, 26, 6, 0))).toBe(1);
    expect(localDaysBetween(at(9, 25, 0, 5), at(9, 25, 23, 55))).toBe(0);
    expect(localDaysBetween(at(9, 25), at(9, 22))).toBe(-3);
    // Across a (European) DST change the day count stays whole.
    expect(localDaysBetween(at(3, 28, 12), at(3, 30, 12))).toBe(2);
    expect(localDaysBetween(at(10, 24, 12), at(10, 26, 12))).toBe(2);
  });

  test("a day key is the local date and the next midnight starts the next day", () => {
    expect(localDayKey(at(9, 5, 0, 1))).toBe("2026-09-05");
    expect(localDayKey(at(12, 31, 23, 59))).toBe("2026-12-31");
    expect(nextLocalMidnight(at(9, 25, 23, 30))).toBe(new Date(2026, 8, 26).getTime());
    expect(localDayKey(nextLocalMidnight(at(12, 31, 18)))).toBe("2027-01-01");
  });
});

describe("reset wording", () => {
  test("a reset later today is a bare clock time", () => {
    const now = at(9, 25, 14);
    expect(resetClock(at(9, 25, 23), now)).toBe(clock(at(9, 25, 23)));
  });

  test("a reset early tomorrow names the day although it is under 24 hours away", () => {
    const now = at(9, 25, 23, 30);
    const reset = at(9, 26, 6);
    expect(resetClock(reset, now)).toBe(`${weekday(reset)} ${clock(reset)}`);
  });

  test("a reset later this week names its weekday; a week out, its date too", () => {
    const now = at(9, 21, 9);
    const thursday = at(9, 24, 23);
    expect(resetClock(thursday, now)).toBe(`${weekday(thursday)} ${clock(thursday)}`);
    const nextMonday = at(9, 28, 9);
    const dated = new Date(nextMonday).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    expect(resetClock(nextMonday, now)).toBe(`${dated} ${clock(nextMonday)}`);
  });

  test("a reset already passed keeps its day and reads as now", () => {
    const now = at(9, 25, 9);
    const yesterday = at(9, 24, 23);
    expect(resetMoment(yesterday, now)).toBe(`${weekday(yesterday)} ${clock(yesterday)} · now`);
  });

  test("the moment pairs the clock with the time remaining", () => {
    const now = at(9, 21, 19);
    const reset = at(9, 24, 23);
    expect(resetMoment(reset, now)).toBe(`${weekday(reset)} ${clock(reset)} · ${relativeReset(reset, now)}`);
    expect(relativeReset(reset, now)).toBe("in 3d 4h");
  });
});

describe("day labels", () => {
  test("today and yesterday are named; older days read their weekday and date", () => {
    const now = at(9, 25, 10);
    expect(dayLabel(at(9, 25, 0, 1), now)).toBe("Today");
    expect(dayLabel(at(9, 24, 23, 59), now)).toBe("Yesterday");
    const older = at(9, 20);
    expect(dayLabel(older, now)).toBe(new Date(older).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }));
  });

  test("a day in another year carries the year", () => {
    const now = at(1, 3, 10, 0, 2027);
    const lastYear = at(12, 20, 10, 0, 2026);
    expect(dayLabel(lastYear, now)).toBe(new Date(lastYear).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    expect(fullDate(lastYear, now)).toContain("2026");
    expect(fullDate(at(1, 1, 10, 0, 2027), now)).not.toContain("2027");
  });

  test("23:50 and 00:10 fall on different days", () => {
    expect(localDayKey(at(9, 24, 23, 50))).not.toBe(localDayKey(at(9, 25, 0, 10)));
  });
});
