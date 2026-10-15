import manifest from "./review-artifacts.json";

// Publication owns this pointer, not individual tests. Archiving a change
// updates the manifest once; ordinary test output stays in test-results.
export const reviewEvidenceRoot = new URL(manifest.evidenceRoot, new URL("../../", import.meta.url));
