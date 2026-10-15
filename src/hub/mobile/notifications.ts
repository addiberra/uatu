import { mountNotifications } from "../../pwa/notification-client.js";
import { hubUrl } from "../../shared/app-url";

/** Presentation port over the existing PWA enrollment owner, not a second
 * subscription implementation. Synthetic assemblies never install this port. */
export type MobileNotificationSettings = (root: HTMLElement, current: () => boolean, unauthorized: () => void) => () => void;
export function liveNotificationSettings(options: { workspaceId?: string; beforeRegister?: () => Promise<void> } = {}): MobileNotificationSettings {
  return (root, current, onUnauthorized) => {
    const controller = mountNotifications({ ...options, apiUrl: hubUrl("/api/hub/notifications"), stateUrl: hubUrl("/api/hub/state"), workerUrl: hubUrl("/push-worker.js"), hosts: "", root, current, onUnauthorized });
    return () => controller?.destroy();
  };
}
