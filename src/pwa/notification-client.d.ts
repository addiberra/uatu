export function mountNotifications(options: {
  apiUrl: string; stateUrl: string; workerUrl: string; hosts: string;
  workspaceId?: string | null; beforeRegister?: () => Promise<void>;
  /** Focused phone page; defaults retain the existing desktop dialog/triggers. */
  root?: HTMLElement;
  current?: () => boolean;
  onUnauthorized?: () => void;
}): { ready: Promise<void>; destroy(): void } | undefined;
declare const assetPath: string;
export default assetPath;
