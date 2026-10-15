/** Small browser-safe wire decoders. Project fields instead of retaining unknown
 * response properties; errors carry no raw payload or tool output. */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Hub object");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== "string" || value.includes("\0")) throw new Error("Invalid Hub text");
  return value;
}
export function nonempty(value: unknown): string {
  const result = text(value);
  if (!result.trim()) throw new Error("Missing Hub text");
  return result;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid Hub boolean");
  return value;
}
export function array<T>(value: unknown, decode: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("Invalid Hub array");
  return value.map(decode);
}
export function workspaceEntry(value: unknown) {
  const row = object(value);
  if (row.backend !== "local") throw new Error("Unsupported backend");
  return { id: nonempty(row.id), displayName: nonempty(row.displayName), path: nonempty(row.path), backend: "local" as const };
}
