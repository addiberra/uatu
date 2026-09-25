// Chat's reader-local date wording: when a rate limit resets and which day a
// run of the timeline happened. Everything is decided by the reader's local
// calendar day, in the browser's locale and zone — never by a millisecond
// distance, which misreads "06:00 tomorrow" as today and miscounts DST days.
// A leaf module (no chat imports) so the timeline renderer and the composer
// status can both use it without an import cycle.

const DAY_MS = 86_400_000;

/** Whole local calendar days from `from` to `to` (negative when earlier). */
export function localDaysBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  // Date.UTC over the local Y/M/D counts calendar days without the 23/25 h
  // of a DST change leaking in.
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
}

/** The local calendar day as `YYYY-MM-DD`. */
export function localDayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The next local midnight after `now`, as epoch ms. */
export function nextLocalMidnight(now: number): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

/**
 * "in 4d 11h" / "in 2h 05m" / "in 35m"; "now" once the reset has passed
 * and the next report has not yet said so. Minutes are dropped past a day
 * because a weekly window is not waited on to the minute.
 */
export function relativeReset(resetsAt: number, now = Date.now()): string {
  const remaining = resetsAt - now;
  if (remaining < 30_000) return "now";
  const minutes = Math.round(remaining / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

/**
 * The reset as a clock time — bare on the reader's current day ("14:00"),
 * with the weekday on another day ("Sat 21:00"), and with the date too a
 * week or more out ("Fri 2 Oct 21:00"), where the weekday alone would be
 * today's and read as today.
 */
export function resetClock(resetsAt: number, now = Date.now()): string {
  const date = new Date(resetsAt);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = Math.abs(localDaysBetween(now, resetsAt));
  if (days === 0) return time;
  if (days < 7) return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return `${date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

/** "Thu 23:00 · in 3d 4h": the clock that survives a glance away, and whether to wait. */
export function resetMoment(resetsAt: number, now = Date.now()): string {
  return `${resetClock(resetsAt, now)} · ${relativeReset(resetsAt, now)}`;
}

/** The day separator's visible label: "Today", "Yesterday", else the weekday and date (with the year when not this year). */
export function dayLabel(at: number, now = Date.now()): string {
  const days = localDaysBetween(at, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return fullDate(at, now);
}

/** The full day for assistive technology and the visible label beyond yesterday. */
export function fullDate(at: number, now = Date.now()): string {
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}
