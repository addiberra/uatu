import type { AutomaticBackgroundOutcome } from "./types";

export function automaticBackgroundNote(outcome?: AutomaticBackgroundOutcome): string {
  switch (outcome) {
    case "accepted":
    case "not-needed": return "";
    case "unavailable": return "Automatic backgrounding is unavailable. Refresh status; the steer was not repeated.";
    case "failed": return "Automatic backgrounding was refused. Refresh status; the steer was not repeated.";
    case "unknown": return "Automatic backgrounding could not be confirmed. Do not repeat the steer.";
    default: return "";
  }
}

/** Page-local receipts, not execution state. Only the same operation can
 * resolve its uncertainty; unrelated mutations convey no such evidence. */
export class AutomaticBackgroundNotices {
  private readonly conversations = new Map<string, Map<string, { text: string; successful: boolean; origin?: string; subject?: string }>>();

  record(conversation: string, operation: string, outcome?: AutomaticBackgroundOutcome): void {
    if (outcome === undefined) return;
    if (outcome === "accepted" || outcome === "not-needed") {
      this.conversations.get(conversation)?.delete(operation);
      return;
    }
    this.put(conversation, operation, automaticBackgroundNote(outcome), false);
  }

  unconfirmed(conversation: string, operation: string, action: string, text?: string, subject = "acceptance"): void {
    if (text === undefined) { this.put(conversation, operation, action, false); return; }
    const origin = actionOrigin(action, text || `attachment-only message · ${operation.replace(/[^a-zA-Z0-9-]/g, "").slice(-8) || "pending"}`);
    this.put(conversation, operation, `${origin}: ${subject} unconfirmed. Checking conversation status; do not repeat.`, false);
    this.conversations.get(conversation)!.get(operation)!.origin = origin;
    this.conversations.get(conversation)!.get(operation)!.subject = subject;
  }

  checked(conversation: string, operation: string, available: boolean): void {
    const notice = this.conversations.get(conversation)?.get(operation);
    if (!notice?.origin) return;
    notice.text = `${notice.origin}: ${available ? `Status checked; ${notice.subject} still unconfirmed` : `Status check unavailable; ${notice.subject} unconfirmed`}. Do not repeat.`;
  }

  private put(conversation: string, operation: string, text: string, successful: boolean): void {
    let notices = this.conversations.get(conversation);
    if (!notices) this.conversations.set(conversation, notices = new Map());
    notices.set(operation, { text, successful });
    // Page-local only, bounded across both conversations and operations.
    while (notices.size > 20) notices.delete(notices.keys().next().value!);
    while (this.conversations.size > 100) this.conversations.delete(this.conversations.keys().next().value!);
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

export function actionOrigin(action: string, text: string): string {
  const excerpt = text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\s]+/g, " ").trim();
  return `${action} “${excerpt ? [...excerpt].slice(0, 72).join("") + ([...excerpt].length > 72 ? "…" : "") : "attachment-only message"}”`;
}
