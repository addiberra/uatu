/** Expanded cards spend actual remaining layout space, leaving conversation
 * context rather than reserving a percentage of the entire viewport. */
export function expandedWorkBudget(remaining: number, minimumWork: number): { reading: number; capacity: number } {
  const available = Math.max(0, remaining);
  const preferred = Math.min(96, Math.max(32, available * 0.2));
  const emergency = Math.min(16, available * 0.1);
  const reading = Math.min(preferred, Math.max(emergency, available - minimumWork), available);
  return { reading, capacity: Math.max(0, available - reading) };
}
