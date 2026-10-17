import { onUiModeChange } from "../shell/ui-mode";

/** One touch layer; existing controls keep their handlers and capability gates. */
export function createTouchChatOptions(openConfiguration: () => void): (() => void) | undefined {
  const toggle = document.querySelector<HTMLButtonElement>("#chat-options-toggle");
  const menu = document.querySelector<HTMLElement>("#chat-options-menu");
  const content = document.querySelector<HTMLElement>("#chat-options-content");
  const backdrop = document.querySelector<HTMLElement>("#chat-options-backdrop");
  const configuration = document.querySelector<HTMLButtonElement>("#chat-options-configuration");
  const original = document.querySelector<HTMLButtonElement>("#chat-configuration-trigger");
  const header = document.querySelector<HTMLElement>("#chat-header-options");
  if (!toggle || !menu || !content || !backdrop || !configuration || !original) return;
  const toggleHome = document.createComment("composer options control");
  toggle.before(toggleHome);
  const homes = ["chat-attach", "chat-context-usage", "chat-background-action", "chat-composer-chips"].flatMap(id => {
    const node = document.getElementById(id);
    if (!node) return [];
    const home = document.createComment("desktop options control"); node.before(home);
    return [{ node, home }];
  });
  let previous: HTMLElement | null = null;
  const measure = () => {
    if (menu.hidden) return;
    const surface = document.querySelector<HTMLElement>("#chat-surface")?.getBoundingClientRect();
    const composer = document.querySelector<HTMLElement>("#chat-composer")?.getBoundingClientRect();
    if (!surface || !composer) return;
    menu.style.setProperty("--chat-options-bottom", `${Math.max(8, surface.bottom - composer.top + 8)}px`);
    menu.style.setProperty("--chat-options-height", `${Math.max(44, composer.top - surface.top - 16)}px`);
  };
  const close = (restore = false) => {
    menu.hidden = backdrop.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey, true);
    if (restore) (previous?.isConnected && previous.getClientRects().length ? previous : toggle).focus({ preventScroll: true });
  };
  const controls = () => [...menu.querySelectorAll<HTMLElement>("button:not(:disabled), summary, select")].filter(node => node.getClientRects().length);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation(); close(true); return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const choices = controls();
    const index = choices.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1
      : (index + (event.key === "ArrowUp" || event.key === "Tab" && event.shiftKey ? -1 : 1) + choices.length) % choices.length;
    choices[next]?.focus();
  };
  const layout = () => {
    const touch = document.documentElement.dataset.uiMode === "touch";
    for (const { node, home } of homes) {
      if (touch) { if (node.parentElement !== content) content.append(node); }
      else if (node.previousSibling !== home) home.after(node);
    }
    // Keep one stable header target throughout keyboard motion. Moving this
    // control only when the device UI mode changes avoids a moving tap target.
    const ownedFocus = document.activeElement === toggle;
    if (touch && header) { if (toggle.parentElement !== header) header.append(toggle); }
    else if (toggle.previousSibling !== toggleHome) toggleHome.after(toggle);
    if (touch && ownedFocus) toggle.focus({ preventScroll: true });
    if (!touch) close();
  };
  layout(); const stopMode = onUiModeChange(layout);
  toggle.addEventListener("mousedown", event => {
    if (document.activeElement?.id === "chat-input") event.preventDefault();
  });
  menu.addEventListener("mousedown", event => {
    if (document.activeElement?.id === "chat-input") event.preventDefault();
  });
  toggle.addEventListener("pointerdown", () => { previous = document.activeElement instanceof HTMLElement ? document.activeElement : toggle; });
  toggle.addEventListener("click", event => {
    if (!menu.hidden) { close(); return; }
    configuration.hidden = original.disabled || original.hidden;
    configuration.textContent = original.textContent?.trim() || "Chat settings";
    menu.hidden = backdrop.hidden = false;
    measure();
    toggle.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", onKey, true);
    if (event.detail === 0) { previous = toggle; controls()[0]?.focus(); }
  });
  backdrop.addEventListener("mousedown", event => event.preventDefault());
  backdrop.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); close(); });
  configuration.addEventListener("click", () => { close(); toggle.focus({ preventScroll: true }); openConfiguration(); });
  menu.addEventListener("click", event => {
    if ((event.target as Element).closest("#chat-continue-workers")) close();
  });
  menu.addEventListener("toggle", event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open || menu.hidden) return;
    const readout = details.querySelector<HTMLElement>(".chat-plan-readout, .chat-context-breakdown");
    if (!readout) return;
    // Secondary readouts scroll inside this layer, never under the composer.
    // Leave the disclosure's own target reachable above its content.
    const top = readout.getBoundingClientRect().top;
    const bounds = menu.getBoundingClientRect();
    menu.scrollTop += Math.max(0, top - bounds.top - 52);
    const available = menu.getBoundingClientRect().bottom - readout.getBoundingClientRect().top - 12;
    readout.style.maxHeight = `${Math.max(44, available)}px`;
    readout.style.overflowY = "auto";
  }, true);
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
  for (const id of ["chat-surface", "chat-composer"]) {
    const node = document.getElementById(id); if (node) observer?.observe(node);
  }
  window.visualViewport?.addEventListener("resize", measure);
  // A mobile pagehide can freeze a page that will be reused. Keep its
  // observers subscribed; explicit disposal is only for actual teardown.
  return () => {
    close(); stopMode(); observer?.disconnect();
    window.visualViewport?.removeEventListener("resize", measure);
  };
}
