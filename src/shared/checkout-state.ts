/** Optional authoritative Hub fact. Legacy branch labels are not this fact. */
export type CheckoutState =
  | { kind: "named" | "unborn"; name: string }
  | { kind: "detached"; commit: string }
  | { kind: "non-git" }
  | { kind: "unavailable"; message: string };

export function parseCheckoutState(value: unknown): CheckoutState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid checkout state");
  const row = value as Record<string, unknown>;
  const field = row.kind === "named" || row.kind === "unborn" ? "name"
    : row.kind === "detached" ? "commit" : row.kind === "unavailable" ? "message" : undefined;
  if (!["named", "unborn", "detached", "non-git", "unavailable"].includes(String(row.kind))
    || Object.keys(row).some(key => key !== "kind" && key !== field)
    || (field && (typeof row[field] !== "string" || !(row[field] as string).trim() || (row[field] as string).includes("\0")))
    || (row.kind === "detached" && !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(String(row.commit)))) {
    throw new Error("Invalid checkout state");
  }
  return { ...row } as CheckoutState;
}
