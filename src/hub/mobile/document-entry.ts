import { eligibleMobileHub, mountLiveHub } from "./live-entry";

if (eligibleMobileHub()) {
  const legacy = document.querySelector<HTMLElement>("body > main");
  // The phone has its own scoped presentation. Desktop is a fresh document
  // boundary; retain no duplicate form/label tree behind the product root.
  legacy?.remove();
  const root = document.createElement("div");
  root.id = "mobile-hub-root"; root.style.cssText = "position:fixed;inset:0";
  document.body.append(root);
  mountLiveHub(root);
}
