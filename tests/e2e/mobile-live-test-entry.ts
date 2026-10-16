// Isolated renderer control for production geometry comparisons. Operational
// E2E tests load production documents/assets; this is not a shipping module.
import { mountMobileHub } from "../../src/hub/mobile/frontend";
import { mobileHubDetail, mobileHubPath, mobileHubRoute } from "../../src/hub/mobile/coordinator";
import { createLiveBackend } from "../../src/hub/mobile/live-backend";
import { liveNotificationSettings } from "../../src/hub/mobile/notifications";
import "../../src/hub/mobile/styles.css";

const root = document.querySelector<HTMLElement>("#live-mobile-test")!;
const view = mountMobileHub(root, createLiveBackend(), {
  brandLogoUrl: "/hub-assets/logo.svg",
  notifications: liveNotificationSettings(),
  navigateWorkspace: id => location.assign(`/s/${encodeURIComponent(id)}/`),
  returnToWorkspace: id => location.assign(`/s/${encodeURIComponent(id)}/`),
  setRoute(route) { history.pushState({}, "", mobileHubPath(route)); show(); },
  detailChanged(detail) { history.pushState({}, "", mobileHubPath(mobileHubRoute(new URL(location.href)) ?? "settings", detail)); },
});
function show() { const url = new URL(location.href); view.show(mobileHubRoute(url) ?? "hub", mobileHubDetail(url)); }
addEventListener("popstate", show);
show();
