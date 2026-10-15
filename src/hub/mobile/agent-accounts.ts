import type { AccountAgentId, AgentAccountsSnapshot } from "../agent-account-types";
import type { OperationResult, ReadResult } from "./backend";

export type AccountLoginIntent = { agent: AccountAgentId; target: string; method: string; answers: Record<string, string> };
/** Machine-wide agent authentication, deliberately not repository Credentials. */
export interface MobileAgentAccounts {
  read(): Promise<ReadResult<AgentAccountsSnapshot>>;
  connectKey(intent: AccountLoginIntent & { key: string }): Promise<OperationResult<AgentAccountsSnapshot>>;
  startLogin(intent: AccountLoginIntent): Promise<OperationResult<AgentAccountsSnapshot>>;
  submitCode(intent: { attemptId: string; code: string }): Promise<OperationResult<AgentAccountsSnapshot>>;
  submitRedirect(intent: { attemptId: string; address: string }): Promise<OperationResult<AgentAccountsSnapshot>>;
  cancel(attemptId: string): Promise<OperationResult<AgentAccountsSnapshot>>;
  activate(intent: { agent: AccountAgentId; credential: string }): Promise<OperationResult<AgentAccountsSnapshot>>;
  logout(intent: { agent: AccountAgentId; target: string; credential: string }): Promise<OperationResult<AgentAccountsSnapshot>>;
}

export const agentAccountScopeWarning = "Agent accounts are machine-wide and shared by all Hub users and running workspaces. They are separate from repository credentials. Login, activation and logout change the agent's own account store, not a workspace assignment.";
