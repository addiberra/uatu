import { normalizeProviderHost, parseCredentialAssignment, parsePublicCredentialDto, parsePublicToolReadinessDto, parseReadinessResult, type PublicCredentialDto } from "../credential-types";
import type { CoordinatedResult, CredentialTarget, CredentialView, MobileHubBackend, OperationResult, PrivateKeySource, ReadResult, StopConsent } from "./backend";
import { credentialFactsFromSnapshot, decodeCredentialCatalog, decodeCredentialTools, toolConfigurationFromSnapshot } from "./live-read-model";
import type { LiveTransport } from "./live-transport";
import { array, boolean, nonempty, object } from "./live-values";

type CredentialMethods = Pick<MobileHubBackend, "readCredentials" | "readCredentialFacts" | "readTools" | "readToolConfiguration" | "readPublicKey" | "generateSsh" | "importSsh" | "generateOpenPgp" | "importOpenPgp" | "createToken" | "unlockCredential" | "lockSsh" | "enableCredential" | "disableCredential" | "deleteCredential" | "testCredential" | "setToolOverride" | "testTool" | "assignWorkspace" | "assignCredential" | "removeAssignment">;
const credentialsPath = "/api/hub/credentials";
const toolsPath = "/api/hub/credential-tools";
function rejected(message: string): OperationResult<never> { return { status: "rejected", problem: { kind: "invalid-input", message } }; }

/** The file is checked BEFORE reading it. Runtime checks also refuse a forged
 * mixed source even though the public TypeScript intent is a discriminated union. */
export async function privateKeyText(source: PrivateKeySource): Promise<string> {
  if (!source || (source.kind !== "file" && source.kind !== "paste")) throw new Error("Choose one private-key source.");
  if (source.kind === "file" && ("text" in source || !(source.file instanceof Blob) || source.file.size > 1_048_576)) throw new Error("Choose one private-key file of at most 1 MiB.");
  if (source.kind === "paste" && ("file" in source || typeof source.text !== "string")) throw new Error("Choose one private-key source.");
  const value = source.kind === "file" ? await source.file.text() : source.text;
  if (!value.trim() || new TextEncoder().encode(value).length > 1_048_576) throw new Error("Private key must be nonempty and at most 1 MiB.");
  return value;
}

export function createLiveCredentials(transport: LiveTransport, workspaces: Pick<MobileHubBackend, "readWorkspace">): CredentialMethods {
  const readCredentials = () => transport.read(credentialsPath, decodeCredentialCatalog);
  async function lookup(target: CredentialTarget): Promise<ReadResult<PublicCredentialDto>> {
    const result = await readCredentials();
    if (result.status === "unavailable") return result;
    const credential = result.value.find(row => row.id === target.id && row.type === target.type);
    return credential ? { status: "available", value: credential } : { status: "unavailable", problem: { kind: "not-found", message: "This credential is unavailable or has changed type." } };
  }
  function decodeCredential<T extends PublicCredentialDto["type"]>(type?: T, id?: string) {
    return (value: unknown): CredentialView<T> => {
      const credential = parsePublicCredentialDto(object(value).credential);
      if ((type && credential.type !== type) || (id && credential.id !== id)) throw new Error("Credential identity mismatch");
      return credential as CredentialView<T>;
    };
  }
  const path = (target: CredentialTarget, action: string) => `${credentialsPath}/${encodeURIComponent(target.id)}/${action}`;
  async function action<T extends PublicCredentialDto["type"]>(target: CredentialTarget<T>, name: string, body: unknown = {}) {
    return transport.request(path(target, name), decodeCredential(target.type, target.id), body);
  }
  async function revoke<T>(target: CredentialTarget, stop: StopConsent, operation: () => Promise<OperationResult<T>>): Promise<OperationResult<CoordinatedResult<T>>> {
    const generation = transport.generation();
    const found = await lookup(target);
    if (found.status === "unavailable") return { status: "rejected", problem: found.problem };
    if (generation !== transport.generation()) return rejected("Hub state changed. Review the credential again.");
    const credential = found.value;
    if (credential.type === "token" && credential.capabilities.some(capability => capability === "github-cli" || capability === "gitlab-cli") && stop !== "stop-dependent-workspaces") {
      // Only the server knows projected users. Never derive them from current assignments.
      return { status: "completed", value: { status: "needs-stop", workspaceIds: [], scope: "projected-provider-users" } };
    }
    const result = await operation();
    return result.status === "completed" ? { status: "completed", value: { status: "completed", value: result.value } } : result;
  }
  async function importKey<T extends "ssh" | "openpgp">(type: T, source: PrivateKeySource, body: Record<string, unknown>): Promise<OperationResult<CredentialView<T>>> {
    const generation = transport.generation();
    let privateKey: string;
    try { privateKey = await privateKeyText(source); }
    catch (error) { return rejected(error instanceof Error ? error.message : "Could not read the selected private key."); }
    if (generation !== transport.generation()) return rejected("The authentication context changed. Select the key again.");
    return transport.request(`${credentialsPath}/${type}/import`, decodeCredential(type), { ...body, privateKey });
  }
  return {
    readCredentials,
    async readCredentialFacts(target) {
      const result = await lookup(target);
      return result.status === "available" ? { status: "available", value: credentialFactsFromSnapshot(result.value) } : result;
    },
    readTools: () => transport.read(toolsPath, decodeCredentialTools),
    async readToolConfiguration(tool) {
      const result = await transport.read(toolsPath, decodeCredentialTools);
      if (result.status === "unavailable") return result;
      const item = result.value.find(row => row.tool === tool);
      return item ? { status: "available", value: toolConfigurationFromSnapshot(item) } : { status: "unavailable", problem: { kind: "not-found", message: "Tool configuration is unavailable." } };
    },
    readPublicKey: target => transport.read(path(target, "public-key"), value => {
      const row = object(value);
      if (row.id !== target.id || row.type !== target.type) throw new Error("Public-key identity mismatch");
      return { id: target.id, type: target.type, publicKey: nonempty(row.publicKey), fingerprint: nonempty(row.fingerprint) };
    }),
    generateSsh: intent => transport.request(`${credentialsPath}/ssh/generate`, decodeCredential("ssh"), intent),
    importSsh: intent => importKey("ssh", intent.source, { name: intent.name, capabilities: intent.capabilities, passphrase: intent.passphrase }),
    generateOpenPgp: intent => transport.request(`${credentialsPath}/openpgp/generate`, decodeCredential("openpgp"), intent),
    importOpenPgp: intent => importKey("openpgp", intent.source, { name: intent.name }),
    createToken: intent => transport.request(`${credentialsPath}/token`, decodeCredential("token"), intent),
    unlockCredential: intent => action(intent.target, "unlock", { passphrase: intent.passphrase }),
    lockSsh: target => action(target, "lock"),
    enableCredential: target => action(target, "enable"),
    disableCredential: intent => revoke(intent.target, intent.stop, () => action(intent.target, "disable")),
    deleteCredential: intent => revoke(intent.target, intent.stop, () => transport.request(path(intent.target, "delete"), value => ({ deleted: boolean(object(value).deleted) }), { confirm: intent.confirm, unassign: intent.unassign })),
    testCredential: target => transport.request(path(target, "test"), value => array(object(value).results, parseReadinessResult), {}),
    setToolOverride: intent => transport.request(`${toolsPath}/${encodeURIComponent(intent.tool)}`, value => {
      const tool = parsePublicToolReadinessDto(object(value).tool);
      if (tool.tool !== intent.tool) throw new Error("Tool identity mismatch");
      return tool;
    }, { path: intent.path }),
    testTool: tool => transport.request(`${toolsPath}/${encodeURIComponent(tool)}/test`, value => {
      const result = parsePublicToolReadinessDto(object(value).tool);
      if (result.tool !== tool) throw new Error("Tool identity mismatch");
      return result;
    }, {}),
    assignWorkspace: intent => transport.request(`/api/hub/workspaces/${encodeURIComponent(intent.workspaceId)}/credential-assignments`, value => {
      const assignments = array(object(value).assignments, parseCredentialAssignment);
      if (assignments.some(row => row.workspaceId !== intent.workspaceId)) throw new Error("Assignment identity mismatch");
      return assignments;
    }, { ...intent.selection, ...(intent.selection.authentication ? { authentication: { ...intent.selection.authentication, host: normalizeProviderHost(intent.selection.authentication.host) } } : {}) }),
    assignCredential: intent => {
      const { credentialId, ...assignment } = intent.assignment;
      return transport.request(`${credentialsPath}/${encodeURIComponent(credentialId)}/assign`, value => {
        const result = parseCredentialAssignment(object(value).assignment);
        if (result.credentialId !== credentialId || result.workspaceId !== assignment.workspaceId) throw new Error("Assignment identity mismatch");
        return result;
      }, { ...assignment, replace: intent.replace });
    },
    async removeAssignment(intent) {
      const generation = transport.generation();
      const { credentialId, ...assignment } = intent.assignment;
      if (intent.stop !== "stop-dependent-workspaces") {
        const workspace = await workspaces.readWorkspace(assignment.workspaceId);
        if (workspace.status === "unavailable") return { status: "rejected", problem: workspace.problem };
        if (workspace.value.runtime.status === "running") return { status: "completed", value: { status: "needs-stop", workspaceIds: [assignment.workspaceId] } };
      }
      if (generation !== transport.generation()) return rejected("Hub state changed. Review the assignment again.");
      const result = await transport.request(`${credentialsPath}/${encodeURIComponent(credentialId)}/unassign`, value => ({ removed: boolean(object(value).removed) }), { ...assignment, stop: intent.stop === "stop-dependent-workspaces" });
      return result.status === "completed" ? { status: "completed", value: { status: "completed", value: result.value } } : result;
    },
  };
}
