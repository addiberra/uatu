import { tabBarBottomInset } from "../shell/tab-bar";
import { onUiModeChange } from "../shell/ui-mode";

/** A restored page reports its final metrics a moment after the transition. */
const RESYNC_SETTLE_MS = 250;

export class ChatViewportController {
  private frame: number | null = null;
  private resyncFrame: number | null = null;
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private observer: ResizeObserver | null = null;
  private unsubscribeMode: (() => void) | null = null;
  private correctionPending = false;
  private lastTop: number | null = null;
  private lastHeight: number | null = null;

  /** Every listener shares one frame: a pan must cost one write, not one per event. */
  private readonly schedule = () => {
    if (this.frame !== null) return;
    if (typeof requestAnimationFrame !== "function") { this.apply(); return; }
    this.frame = requestAnimationFrame(() => { this.frame = null; this.apply(); });
  };

  // A page can be restored with the keyboard already dismissed and no viewport
  // event at all, and the metrics reported at the transition are not yet the
  // ones the platform settles on — hence three passes rather than one.
  private readonly resync = () => {
    this.cancelResync();
    this.apply();
    if (typeof requestAnimationFrame === "function") {
      this.resyncFrame = requestAnimationFrame(() => { this.resyncFrame = null; this.apply(); });
    }
    this.resyncTimer = setTimeout(() => { this.resyncTimer = null; this.apply(); }, RESYNC_SETTLE_MS);
  };

  constructor(
    private readonly surface: HTMLElement,
    private readonly composer: HTMLElement,
    private readonly requestCorrection: () => void,
  ) {}

  start(): void {
    this.unsubscribeMode ??= onUiModeChange(this.schedule);
    window.visualViewport?.addEventListener("resize", this.schedule);
    window.visualViewport?.addEventListener("scroll", this.schedule);
    window.addEventListener("resize", this.schedule);
    document.addEventListener("visibilitychange", this.resync);
    window.addEventListener("pageshow", this.resync);
    window.addEventListener("focus", this.resync);
    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(this.schedule);
      this.observer.observe(this.composer);
      this.observer.observe(this.surface);
    }
    this.apply();
  }

  stop(): void {
    this.unsubscribeMode?.();
    this.unsubscribeMode = null;
    window.visualViewport?.removeEventListener("resize", this.schedule);
    window.visualViewport?.removeEventListener("scroll", this.schedule);
    window.removeEventListener("resize", this.schedule);
    document.removeEventListener("visibilitychange", this.resync);
    window.removeEventListener("pageshow", this.resync);
    window.removeEventListener("focus", this.resync);
    this.observer?.disconnect();
    if (this.frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frame);
    this.frame = null;
    this.cancelResync();
  }

  apply(): void {
    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    const top = viewport?.offsetTop ?? 0;
    const metrics = chatViewportMetrics(height, top, window.innerHeight, tabBarBottomInset());
    const root = document.documentElement;
    root.toggleAttribute("data-chat-keyboard", metrics.keyboardVisible);
    const touch = root.getAttribute("data-ui-mode") === "touch";
    const pannedOnly = this.lastTop !== null && this.lastTop !== top && this.lastHeight === metrics.height;
    if (touch) {
      // Rewriting a value the surface already carries re-enters through our own
      // ResizeObserver, so each write has to be a real change.
      if (this.lastTop !== top) this.surface.style.setProperty("--chat-visual-top", `${top}px`);
      if (this.lastHeight !== metrics.height) this.surface.style.setProperty("--chat-visual-height", `${metrics.height}px`);
      this.lastTop = top;
      this.lastHeight = metrics.height;
    } else {
      // The desktop shell owns this rectangle, including its safe areas.
      this.surface.style.removeProperty("--chat-visual-top");
      this.surface.style.removeProperty("--chat-visual-height");
      this.lastTop = null;
      this.lastHeight = null;
    }
    const visible = document.visibilityState !== "hidden" && (touch
      ? root.getAttribute("data-active-tab") === "chat" : root.getAttribute("data-chat-panel") === "open" || root.hasAttribute("data-notification-chat"));
    if (!visible) {
      // Corrections are idempotent requests, so one replay owes for all of them.
      this.correctionPending = true;
      return;
    }
    // A caret-tracking pan moves the window over an unchanged document; the
    // reader did not ask for a new position. Height changes still correct.
    if (pannedOnly && root.hasAttribute("data-chat-editing") && !this.correctionPending) return;
    this.correctionPending = false;
    this.requestCorrection();
  }

  private cancelResync(): void {
    if (this.resyncFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.resyncFrame);
    this.resyncFrame = null;
    if (this.resyncTimer !== null) clearTimeout(this.resyncTimer);
    this.resyncTimer = null;
  }
}

export function chatViewportMetrics(visualHeight: number, visualTop: number, layoutHeight: number, tabBarInset: number): { height: number; tabInset: number; keyboardVisible: boolean } {
  const occluded = Math.max(0, layoutHeight - visualTop - visualHeight);
  const tabInset = Math.max(0, tabBarInset - occluded);
  // A platform that pans the page under the keyboard occludes less than the
  // keyboard takes; the layout/visual height difference sees it either way.
  return { height: Math.max(0, visualHeight - tabInset), tabInset, keyboardVisible: layoutHeight - visualHeight > Math.max(80, tabBarInset) };
}
