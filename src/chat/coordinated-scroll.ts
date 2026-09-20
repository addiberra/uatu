import type { TimelineAnchorController, AnchorGeometry } from "./anchor";

/** Shell line anchors can supply the same operations without depending on DOM rows. */
export type CoordinatedScrollAnchor = Pick<TimelineAnchorController,
  "isPinned" | "afterMutation" | "beforeMutation" | "jumpToLatest" | "pause" | "observe">;

export interface CoordinatedScrollOptions {
  anchor: CoordinatedScrollAnchor;
  /** Include semantic items when requested, even if the anchor is still pinned. */
  measure: (includeItems: boolean) => AnchorGeometry;
  active?: () => boolean;
  onChange?: () => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}

const owners = new WeakMap<HTMLElement, CoordinatedScrollOwner>();

/** The only automatic position writer for a managed scroller. */
export class CoordinatedScrollOwner {
  private frame: number | null = null;
  private newContent = false;
  private revealTarget: HTMLElement | null = null;
  private heldTarget: HTMLElement | null = null;
  private heldTop: number | null = null;
  private disposed = false;
  private previous: AnchorGeometry;
  private touchY: number | null = null;
  private upwardPending = false;
  private lastCorrectionFrame = -Infinity;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (id: number) => void;
  private readonly previousAnchoring: string;
  private readonly previousBehavior: string;

  constructor(readonly scroller: HTMLElement, private readonly options: CoordinatedScrollOptions) {
    if (owners.has(scroller)) throw new Error("Scroller already has a coordinated owner");
    owners.set(scroller, this);
    this.requestFrame = options.requestFrame ?? (callback => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? (id => cancelAnimationFrame(id));
    this.previous = options.measure(false);
    this.previousAnchoring = scroller.style.getPropertyValue("overflow-anchor");
    this.previousBehavior = scroller.style.getPropertyValue("scroll-behavior");
    scroller.style.setProperty("overflow-anchor", "none");
    scroller.style.setProperty("scroll-behavior", "auto");
    scroller.addEventListener("scroll", this.observe, { passive: true });
    scroller.addEventListener("wheel", this.wheel, { passive: true });
    scroller.addEventListener("touchstart", this.touchStart, { passive: true });
    scroller.addEventListener("touchmove", this.touchMove, { passive: true });
    scroller.addEventListener("keydown", this.keyDown);
  }

  private active(): boolean { return !this.disposed && (this.options.active?.() ?? true); }
  private measure(): AnchorGeometry { return this.options.measure(!this.options.anchor.isPinned()); }

  /** Coalesces render, resize, toggle and viewport work. Reads geometry at execution. */
  request(hasNewContent = false): void {
    if (!this.active()) return;
    this.newContent ||= hasNewContent;
    if (this.frame !== null) return;
    this.frame = this.requestFrame(timestamp => {
      this.frame = null;
      this.flush(timestamp);
    });
  }

  /** Finish a render in its existing rAF, using that callback's timestamp.
   * All callers in the same browser frame share a single correction budget.
   */
  flush(timestamp: number): void {
    if (!this.active()) { this.cancel(); return; }
    if (this.lastCorrectionFrame === timestamp) { this.request(); return; }
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    const geometry = this.measure();
    const target = this.options.anchor.afterMutation(geometry, this.newContent);
    this.newContent = false;
    const top = Math.max(0, Math.min(target, geometry.scrollHeight - geometry.clientHeight));
    if (Math.abs(this.scroller.scrollTop - top) > 0.5) {
      this.lastCorrectionFrame = timestamp;
      this.scroller.scrollTop = top;
    }
    this.previous = { ...geometry, scrollTop: this.scroller.scrollTop };
    // Any later scroll echo belongs to this correction, not an earlier
    // wheel/key gesture whose native movement never arrived.
    this.upwardPending = false;
    // After the anchor has had its say, so the reveal is the last word on
    // where this frame leaves the scroller.
    this.applyReveal(timestamp);
    // Whatever this frame settled on — the anchor's correction, the reveal's
    // refinement of it, or neither — is the position the hold now defends.
    if (this.heldTarget) this.heldTop = this.scroller.scrollTop;
    this.options.onChange?.();
  }

  /**
   * Bring an element inside the scroller's client box on the next coordinated
   * frame. Focus is the caller here — a request's answer field under the
   * software keyboard — and this owner is the only automatic position writer,
   * so the alternative would be a raw `scrollIntoView` on a scroller it
   * manages, which the anchor would then correct straight back.
   */
  reveal(element: HTMLElement): void {
    if (!this.active()) return;
    this.revealTarget = element;
    this.request();
  }

  /**
   * Reveal the element and then keep it there: while a hold is in force, a
   * scroll this owner did not write is undone on the next coordinated frame.
   *
   * A standing mode rather than `reveal(element, { hold: true })`: a reveal is
   * consumed by the frame it is served in, a hold outlives it and has to be
   * ended by name, so an option on the one-shot call would give the mode a
   * beginning and no matching end. `overflow: hidden` or `touch-action: none`
   * would be the platform's way to say the same thing, and WebKit's selection
   * autoscroll honours neither — it moves the scroller while a caret is
   * dragged near its edge regardless. This owner is already the only
   * automatic position writer for the scroller, so defending a position it
   * wrote is its own job rather than a new one.
   */
  hold(element: HTMLElement): void {
    if (!this.active()) return;
    this.heldTarget = element;
    this.heldTop = null;
    this.reveal(element);
  }

  /** End the hold, leaving the scroller exactly where it stands. */
  release(): void {
    this.heldTarget = null;
    this.heldTop = null;
  }

  /**
   * The minimal move that puts the target inside the client box, honouring
   * the scroller's own scroll padding so a revealed control does not park
   * under a floating overlay.
   *
   * A reveal that actually moves the scroller re-captures through the
   * anchor's `pause()`: the reader was deliberately given this position, and
   * an anchor left as it was — pinned to the end, or holding an item further
   * up — would snap off it on the very next correction. `pause()` rather than
   * `beforeMutation()` because unpinning is part of what must happen; it is
   * the same treatment an upward gesture gets. A reveal that needs no move
   * leaves the anchor alone, so following is not lost for nothing.
   */
  private applyReveal(timestamp: number): void {
    const target = this.revealTarget;
    this.revealTarget = null;
    if (!target || !this.scroller.contains(target)) return;
    const delta = this.revealDelta(target);
    if (Math.abs(delta) < 0.5) return;
    const limit = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    const top = Math.max(0, Math.min(this.scroller.scrollTop + delta, limit));
    if (Math.abs(this.scroller.scrollTop - top) <= 0.5) return;
    this.lastCorrectionFrame = timestamp;
    this.scroller.scrollTop = top;
    const geometry = this.options.measure(true);
    this.options.anchor.pause(geometry);
    this.previous = geometry;
    // The reveal is our own assignment, not a gesture awaiting native
    // movement: its scroll echo must not be read as the reader moving.
    this.upwardPending = false;
  }

  private revealDelta(target: HTMLElement): number {
    if (typeof target.getBoundingClientRect !== "function") return 0;
    const box = this.scroller.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    // No computed style (or none declared) means no reserved band: 0.
    const style = typeof getComputedStyle === "function" ? getComputedStyle(this.scroller) : null;
    const padTop = Number.parseFloat(style?.scrollPaddingTop ?? "") || 0;
    const padBottom = Number.parseFloat(style?.scrollPaddingBottom ?? "") || 0;
    const top = box.top + padTop;
    const bottom = box.top + this.scroller.clientHeight - padBottom;
    if (bottom <= top) return 0;
    if (rect.top < top) return rect.top - top;
    // A target taller than the band aligns to its top rather than scrolling
    // its own top out of view to chase its bottom.
    if (rect.bottom > bottom) return Math.min(rect.bottom - bottom, rect.top - top);
    return 0;
  }

  beforeMutation(preferredItemId?: string): void {
    if (this.active() && !this.options.anchor.isPinned()) {
      // Do not overwrite the pre-mutation anchor while a correction is waiting.
      if (this.frame === null) this.options.anchor.beforeMutation(this.measure(), preferredItemId);
    }
  }

  /** Immediate positioning, on the next coordinated frame, never a smooth animation. */
  latest(): void {
    if (!this.active()) return;
    this.upwardPending = false;
    // An explicit jump to the end outranks a reveal still waiting for a frame.
    this.revealTarget = null;
    this.options.anchor.jumpToLatest(this.options.measure(false));
    this.request();
    this.options.onChange?.();
  }

  /** Cancel pending work and transient input, retaining the anchor's follow choice. */
  cancel(): void {
    if (this.frame !== null) this.cancelFrame(this.frame);
    this.frame = null;
    this.newContent = false;
    this.upwardPending = false;
    this.revealTarget = null;
    // A hold is transient input too: the gestures and teardowns that cancel
    // pending work are the reader, or the surface, taking the scroller back.
    this.heldTarget = null;
    this.heldTop = null;
    this.touchY = null;
  }

  pause(): void {
    if (!this.active()) return;
    this.cancel();
    const geometry = this.options.measure(true);
    this.options.anchor.pause(geometry);
    this.upwardPending = true;
    this.previous = geometry;
    this.options.onChange?.();
  }

  private observe = (): void => {
    if (!this.active()) return;
    const geometry = this.measure();
    const previous = this.previous;
    const changedExtent = geometry.scrollHeight !== previous.scrollHeight || geometry.clientHeight !== previous.clientHeight;
    const movement = geometry.scrollTop < previous.scrollTop - 0.5 ? "up"
      : geometry.scrollTop > previous.scrollTop + 0.5 ? "down" : "none";
    if (this.heldTarget) {
      // The held control's position is the one this scroller has. A scroll we
      // did not write — WebKit's autoscroll as the caret is dragged to the
      // edge of the field, a stray pan — is undone on the next coordinated
      // frame by re-running the reveal, which recomputes the minimal move for
      // the held control, so it lands in view even when the content above it
      // changed height in between. None of this speaks for the reader: a held
      // scroll must not pause following or re-anchor.
      const moved = this.heldTop === null || Math.abs(geometry.scrollTop - this.heldTop) > 0.5;
      if (moved || changedExtent) this.reveal(this.heldTarget);
      this.previous = geometry;
      return;
    }
    const bottom = Math.max(0, geometry.scrollHeight - geometry.clientHeight);
    const clamped = changedExtent && bottom < previous.scrollTop - 0.5 && Math.abs(geometry.scrollTop - bottom) <= 1;
    if (clamped) {
      // A pending upward gesture can have no native movement at a boundary.
      // It must not turn a later maximize/layout clamp into a new anchor.
      this.upwardPending = false;
      this.request();
    } else if (this.upwardPending && movement !== "none") {
      this.upwardPending = false;
      this.options.anchor.pause(this.options.measure(true));
    } else if (changedExtent && movement !== "up") {
      // Extent growth alone cannot speak for the reader. An unaccounted
      // upward movement can reveal intrinsic-size content at the same time;
      // it still pauses following. Actual clamps were handled above, and our
      // own assignments already updated `previous` in flush().
      this.request();
    } else {
      this.options.anchor.observe(movement === "up" ? this.options.measure(true) : geometry, movement);
      if (this.options.anchor.isPinned()) this.request();
    }
    this.previous = geometry;
    this.options.onChange?.();
  };

  private ownsInput(event: Event): boolean {
    for (const target of event.composedPath()) {
      if (target === this.scroller) return true;
      if (owners.has(target as HTMLElement)) return false;
    }
    return false;
  }
  /** A caret placement or selection drag inside a text control is not a request
   * to move the conversation. */
  private inTextControl(event: Event): boolean {
    const target = event.target as Element | null;
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable=true]"));
  }
  private wheel = (event: WheelEvent): void => { if (event.deltaY < 0 && this.ownsInput(event)) this.pause(); };
  private touchStart = (event: TouchEvent): void => {
    this.touchY = this.ownsInput(event) && !this.inTextControl(event) ? event.touches[0]?.clientY ?? null : null;
  };
  private touchMove = (event: TouchEvent): void => {
    const y = event.touches[0]?.clientY;
    if (y !== undefined && this.touchY !== null && y > this.touchY && this.ownsInput(event) && !this.inTextControl(event)) this.pause();
    this.touchY = y ?? null;
  };
  private keyDown = (event: KeyboardEvent): void => {
    if (!this.ownsInput(event) || this.inTextControl(event)) return;
    if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) this.pause();
  };

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.scroller.removeEventListener("scroll", this.observe);
    this.scroller.removeEventListener("wheel", this.wheel);
    this.scroller.removeEventListener("touchstart", this.touchStart);
    this.scroller.removeEventListener("touchmove", this.touchMove);
    this.scroller.removeEventListener("keydown", this.keyDown);
    this.scroller.style.setProperty("overflow-anchor", this.previousAnchoring);
    this.scroller.style.setProperty("scroll-behavior", this.previousBehavior);
    owners.delete(this.scroller);
  }
}
