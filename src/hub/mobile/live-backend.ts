import type { MobileHubBackend } from "./backend";
import { createLiveTransport } from "./live-transport";
import { createLiveAuthentication } from "./live-auth";
import { createLiveWorkspaceReads } from "./live-workspaces";
import { createLiveCredentials } from "./live-credentials";
import { createLiveLifecycle } from "./live-lifecycle";
import { createLiveOnboarding } from "./live-onboarding";
import { createLiveClone } from "./live-clone";
import { createLiveAgentAccounts } from "./live-agent-accounts";

/** Browser-only assembly. The caller owns mounting, stream invalidation and
 * eligibility; no fixtures, personal configuration or independent polling. */
export function createLiveBackend(options: Parameters<typeof createLiveTransport>[0] = {}): MobileHubBackend {
  const transport = createLiveTransport(options);
  const workspaces = createLiveWorkspaceReads(transport);
  const credentials = createLiveCredentials(transport, workspaces);
  return {
    agentAccounts: createLiveAgentAccounts(transport),
    ...createLiveAuthentication(transport), ...workspaces, ...credentials,
    ...createLiveLifecycle(transport, { ...workspaces, ...credentials }),
    ...createLiveOnboarding(transport), ...createLiveClone(transport, credentials, options),
    subscribeInvalidation: transport.subscribeInvalidation,
  };
}
