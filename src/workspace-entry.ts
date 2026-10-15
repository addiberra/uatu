import { appBasePath, isHubPage, workspaceIdFromBasePath } from "./shared/app-url";

if (isHubPage() && workspaceIdFromBasePath(appBasePath()) && document.documentElement.dataset.uiMode === "touch") {
  const { mountLiveWorkspace } = await import("./hub/mobile/live-entry");
  mountLiveWorkspace(async () => { const app = await import("./app"); await app.workspaceReady; });
} else {
  await import("./app");
}
