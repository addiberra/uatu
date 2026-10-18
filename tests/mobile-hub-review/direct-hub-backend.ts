import { createReviewTransport } from "./transport";
export function createLiveBackendRuntime() {
  return { backend: createReviewTransport(), transport: { generation: () => 0 } };
}
