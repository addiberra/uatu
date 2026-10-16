import type { AutomaticBackgroundOutcome } from "./types";

export function automaticBackgroundNote(outcome?: AutomaticBackgroundOutcome): string {
  switch (outcome) {
    case "accepted": return "Steer accepted; background request acknowledged. Jobs may still be running.";
    case "not-needed": return "Steer accepted; no confirmed blocking work was observed.";
    case "unavailable": return "Steer accepted; automatic backgrounding is unavailable. Refresh status; explicit Continue remains available when supported.";
    case "failed": return "Steer accepted; automatic backgrounding was refused. Refresh status; explicit Continue remains available when supported.";
    case "unknown": return "Steer accepted; automatic backgrounding could not be confirmed. Refreshing status. Do not repeat the steer.";
    default: return "";
  }
}
