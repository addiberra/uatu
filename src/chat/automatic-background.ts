import type { AutomaticBackgroundOutcome } from "./types";

export function automaticBackgroundNote(outcome?: AutomaticBackgroundOutcome): string {
  switch (outcome) {
    case "accepted":
    case "not-needed": return "";
    case "unavailable": return "Automatic backgrounding is unavailable. Refresh status; the steer was not repeated.";
    case "failed": return "Automatic backgrounding was refused. Refresh status; the steer was not repeated.";
    case "unknown": return "Automatic backgrounding could not be confirmed. Refreshing status. Do not repeat the steer.";
    default: return "";
  }
}

/** Page-local receipts, not execution state. Only the same operation can
 * resolve its uncertainty; unrelated mutations convey no such evidence. */
export class AutomaticBackgroundNotices {
  private readonly conversations = new Map<string, Map<string, { text: string; successful: boolean }>>();

  record(conversation: string, operation: string, outcome?: AutomaticBackgroundOutcome): void {
    if (outcome === undefined) return;
    if (outcome === "accepted" || outcome === "not-needed") {
      this.conversations.get(conversation)?.delete(operation);
      return;
    }
    this.put(conversation, operation, automaticBackgroundNote(outcome), false);
  }

  unconfirmed(conversation: string, operation: string, text: string): void {
    this.put(conversation, operation, text, false);
  }

  private put(conversation: string, operation: string, text: string, successful: boolean): void {
    let notices = this.conversations.get(conversation);
    if (!notices) this.conversations.set(conversation, notices = new Map());
    notices.set(operation, { text, successful });
  }

  clearSuccessful(conversation: string): void {
    const notices = this.conversations.get(conversation);
    if (!notices) return;
    for (const [operation, notice] of notices) if (notice.successful) notices.delete(operation);
    if (!notices.size) this.conversations.delete(conversation);
  }

  text(conversation: string): string {
    const notices = [...(this.conversations.get(conversation)?.values() ?? [])]
      .sort((a, b) => Number(a.successful) - Number(b.successful));
    return [...new Set(notices.map(notice => notice.text))].join(" ");
  }
}
