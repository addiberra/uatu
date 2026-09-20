import { afterEach, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { TimelineAnchorController } from "./anchor";
import { CoordinatedScrollOwner } from "./coordinated-scroll";

const disposals: Array<() => void> = [];
afterEach(() => { for (const dispose of disposals.splice(0).reverse()) dispose(); });

function fixture() {
  const { document, window } = parseHTML("<html><body><div></div></body></html>");
  const element = document.querySelector("div")! as unknown as HTMLElement;
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  let top = 300;
  let extent = 600;
  let itemTop = 0;
  let active = true;
  const writes: number[] = [];
  Object.defineProperties(element, {
    scrollTop: { get: () => top, set: value => { top = Math.max(0, Math.min(value, extent - 300)); writes.push(top); } },
    scrollHeight: { get: () => extent }, clientHeight: { value: 300 },
  });
  const anchor = new TimelineAnchorController();
  const options = {
    anchor, active: () => active,
    measure: () => ({ scrollTop: top, scrollHeight: extent, clientHeight: 300,
      items: [{ id: "line", top: itemTop - top, bottom: itemTop - top + 1000 }] }),
    requestFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelFrame: (id: number) => { frames.delete(id); },
  };
  const owner = new CoordinatedScrollOwner(element, options);
  disposals.push(() => owner.dispose());
  return { element, owner, anchor, frames, writes, options, document,
    grow: (height: number) => { extent = height; top = Math.min(top, extent - 300); },
    move: (value: number) => { top = value; },
    shift: (value: number) => { itemTop = value; },
    hide: () => { active = false; },
    show: () => { active = true; },
    event: (name: string, fields = {}) => { element.dispatchEvent(Object.assign(new window.Event(name, { bubbles: true }), fields) as unknown as Event); },
    eventAt: (target: { dispatchEvent(event: Event): boolean }, name: string, fields = {}) => {
      target.dispatchEvent(Object.assign(new window.Event(name, { bubbles: true }), fields) as unknown as Event);
    },
    flush: () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(sequence); },
  };
}

function stubRect(element: object, rect: () => { top: number; bottom: number }): void {
  Object.defineProperty(element, "getBoundingClientRect", { configurable: true, value: rect });
}

describe("coordinated scrolling", () => {
  test("upward scrolling without a wheel event still pauses when revealing content changes the extent", () => {
    const f = fixture();
    f.grow(800);
    f.move(100);
    f.event("scroll");
    expect(f.anchor.isPinned()).toBe(false);
    f.owner.request(true);
    f.flush();
    expect(f.element.scrollTop).toBe(100);
    expect(f.anchor.hasUnseen()).toBe(true);
  });
  test("an unconsumed upward gesture cannot replace the reading anchor on a later clamp", () => {
    const f = fixture();
    f.move(240); f.owner.pause();
    f.grow(400); f.event("scroll"); f.owner.request(); f.flush();
    expect(f.element.scrollTop).toBe(100);
    expect(f.anchor.isPinned()).toBe(false);
    f.grow(600); f.owner.request(); f.flush();
    expect(f.element.scrollTop).toBe(240);
  });
  test("a correction retires earlier upward intent before a downward arrival", () => {
    const f = fixture();
    f.move(200); f.owner.pause(); f.owner.request(); f.flush();
    f.move(300); f.event("scroll");
    expect(f.anchor.isPinned()).toBe(true);
  });
  test("cancelling transient upward intent permits the first downward arrival after explicit positioning", () => {
    const f = fixture();
    f.event("keydown", { key: "Home" });
    f.owner.cancel();
    f.anchor.restore({ itemId: "line", offset: 0 });
    f.owner.request(); f.flush(); f.event("scroll");
    expect(f.anchor.isPinned()).toBe(false);
    f.event("wheel", { deltaY: 300 }); f.move(300); f.event("scroll");
    expect(f.anchor.isPinned()).toBe(true);
  });
  test("hide cancellation clears only transient intent, preserving the paused anchor on return", () => {
    const f = fixture();
    f.move(100); f.owner.pause(); f.owner.cancel(); f.hide();
    f.show(); f.owner.request(); f.flush();
    expect(f.anchor.isPinned()).toBe(false);
    f.event("wheel", { deltaY: 200 }); f.move(300); f.event("scroll");
    expect(f.anchor.isPinned()).toBe(true);
  });
  test("coalesces sources, reads final geometry, and preserves horizontal position", () => {
    const f = fixture();
    f.element.scrollLeft = 27;
    f.owner.request(true); f.owner.request(); f.grow(700); f.owner.request(); f.grow(800);
    expect(f.frames.size).toBe(1);
    f.flush();
    expect(f.writes).toEqual([500]);
    expect(f.element.scrollLeft).toBe(27);
    f.event("scroll"); f.owner.request(); f.flush();
    expect(f.writes).toEqual([500]);
  });
  test("an upward wheel cancels a latest correction before the default scroll", () => {
    const f = fixture();
    f.owner.pause(); f.move(200); f.event("scroll");
    f.owner.latest();
    f.event("wheel", { deltaY: -4 });
    expect(f.frames.size).toBe(0);
    expect(f.anchor.isPinned()).toBe(false);
    f.move(196); f.event("scroll"); f.grow(800); f.owner.request(true); f.flush();
    expect(f.element.scrollTop).toBe(196);
    expect(f.anchor.hasUnseen()).toBe(true);
  });
  test("touch and keyboard upward intent cancel pending frames", () => {
    const f = fixture();
    f.owner.latest();
    f.event("touchstart", { touches: [{ clientY: 100 }] });
    f.event("touchmove", { touches: [{ clientY: 104 }] });
    expect(f.anchor.isPinned()).toBe(false);
    expect(f.frames.size).toBe(0);
    f.owner.latest(); f.event("keydown", { key: "PageUp" });
    expect(f.anchor.isPinned()).toBe(false);
    expect(f.frames.size).toBe(0);
  });
  test("a touch gesture inside a text control does not move the conversation", () => {
    const f = fixture();
    const input = f.document.createElement("input");
    f.element.append(input);
    f.owner.latest();
    expect(f.anchor.isPinned()).toBe(true);
    f.eventAt(input as unknown as { dispatchEvent(event: Event): boolean }, "touchstart", { touches: [{ clientY: 100 }] });
    f.eventAt(input as unknown as { dispatchEvent(event: Event): boolean }, "touchmove", { touches: [{ clientY: 140 }] });
    expect(f.anchor.isPinned()).toBe(true);
    expect(f.frames.size).toBe(1);
    f.event("touchstart", { touches: [{ clientY: 100 }] });
    f.event("touchmove", { touches: [{ clientY: 140 }] });
    expect(f.anchor.isPinned()).toBe(false);
    expect(f.frames.size).toBe(0);
  });
  test("delayed and repeated programmatic echoes retain a paused near-end anchor", () => {
    const f = fixture();
    f.anchor.restore({ itemId: "line", offset: -280 });
    f.owner.request(); f.flush();
    f.event("scroll"); f.event("scroll");
    expect(f.anchor.isPinned()).toBe(false);
    f.grow(700); f.owner.request(true); f.flush();
    expect(f.element.scrollTop).toBe(280);
  });
  test("clamping a paused reader to bottom does not resume on delayed echoes or regrowth", () => {
    const f = fixture();
    f.owner.pause(); f.move(296); f.event("scroll");
    f.grow(400); f.event("scroll"); f.owner.request(); f.flush(); f.event("scroll");
    expect(f.anchor.isPinned()).toBe(false);
    f.grow(800); f.owner.beforeMutation(); f.owner.request(true); f.flush();
    expect(f.anchor.isPinned()).toBe(false);
    expect(f.element.scrollTop).toBeLessThan(500);
  });
  test("multiple prepends retain the original semantic offset until correction", () => {
    const f = fixture();
    f.owner.pause(); f.move(100); f.event("scroll");
    f.owner.beforeMutation(); f.shift(100); f.grow(700); f.owner.request();
    f.owner.beforeMutation(); f.shift(200); f.grow(800); f.owner.request(); f.flush();
    expect(f.element.scrollTop).toBe(300);
    expect(f.writes).toEqual([300]);
  });
  test("latest moves immediately in one frame and follows further appends", () => {
    const f = fixture();
    f.owner.pause(); f.move(100); f.event("scroll"); f.owner.latest(); f.grow(800); f.flush();
    expect(f.element.scrollTop).toBe(500);
    expect(f.anchor.isPinned()).toBe(true);
    f.grow(900); f.owner.request(true); f.flush();
    expect(f.writes).toEqual([500, 600]);
  });
  test("hidden, cancelled, and disposed owners do not write stale work", () => {
    const f = fixture();
    f.owner.request(); f.grow(700); f.owner.cancel(); f.flush();
    expect(f.writes).toEqual([]);
    f.owner.request(); f.hide(); f.flush();
    expect(f.writes).toEqual([]);
    f.owner.dispose(); f.owner.latest(); f.flush();
    expect(f.writes).toEqual([]);
  });
  test("one owner per element; disposal releases ownership", () => {
    const f = fixture();
    expect(() => new CoordinatedScrollOwner(f.element, f.options)).toThrow("already has");
    f.owner.dispose();
    const replacement = new CoordinatedScrollOwner(f.element, f.options);
    replacement.dispose();
  });
  test("nested owner input pauses only the scroller receiving it", () => {
    const parent = fixture();
    const child = fixture();
    parent.element.append(child.element);
    parent.owner.latest(); child.owner.latest();
    child.event("wheel", { deltaY: -4 });
    expect(child.anchor.isPinned()).toBe(false);
    expect(parent.anchor.isPinned()).toBe(true);
    expect(child.frames.size).toBe(0);
    expect(parent.frames.size).toBe(1);
  });
  test("render and resize callbacks sharing a frame cannot spend two corrections", () => {
    const f = fixture();
    f.grow(700); f.owner.request(); f.owner.flush(100);
    f.grow(800); f.owner.request(); f.owner.flush(100);
    expect(f.writes).toEqual([400]);
    expect(f.frames.size).toBe(1);
    f.owner.flush(116);
    expect(f.writes).toEqual([400, 500]);
  });
  test("revealing a focused control is one write, and the anchor then holds it", () => {
    const f = fixture();
    // linkedom lays nothing out, so the two rectangles this reveal reasons
    // about are stubbed: a 300px client box at the top of the page, and a
    // field sitting 60px below its bottom edge.
    stubRect(f.element, () => ({ top: 0, bottom: 300 }));
    const field = f.document.createElement("input");
    f.element.append(field);
    let fieldTop = 340;
    stubRect(field, () => ({ top: fieldTop, bottom: fieldTop + 20 }));
    // A reader parked mid-transcript: the anchor's own correction is a no-op,
    // so any write in this frame is the reveal's.
    f.grow(900); f.move(300); f.owner.pause();

    f.owner.reveal(field as unknown as HTMLElement);
    expect(f.frames.size).toBe(1);
    f.flush();
    expect(f.writes).toEqual([360]);

    // The reveal re-captured through the anchor, so the next correction holds
    // the revealed position instead of snapping back to where it was.
    f.owner.request(); f.flush();
    expect(f.writes).toEqual([360]);
    expect(f.element.scrollTop).toBe(360);
    expect(f.anchor.isPinned()).toBe(false);

    // Already inside the box: nothing to reveal, nothing written.
    fieldTop = 100;
    f.owner.reveal(field as unknown as HTMLElement);
    f.flush();
    expect(f.writes).toEqual([360]);
  });
  test("a held control is put back after a scroll the owner did not write", () => {
    const f = fixture();
    // As in the reveal case above: a 300px client box at the top of the page.
    // This field's rectangle moves with the scroller, as a laid-out element
    // does — which is what makes the re-reveal after a foreign scroll a real
    // measurement rather than a replay of the first one.
    stubRect(f.element, () => ({ top: 0, bottom: 300 }));
    const field = f.document.createElement("input");
    f.element.append(field);
    stubRect(field, () => ({ top: 640 - f.element.scrollTop, bottom: 660 - f.element.scrollTop }));
    f.grow(900); f.move(300); f.owner.pause();

    f.owner.hold(field as unknown as HTMLElement);
    f.flush();
    expect(f.writes).toEqual([360]);
    // The echo of our own write: the held position is the one we are at, so
    // there is nothing to undo and no frame to spend.
    f.event("scroll");
    expect(f.frames.size).toBe(0);
    expect(f.writes).toEqual([360]);

    // WebKit autoscrolling the transcript while the caret is dragged: one
    // frame, one write, and the field is inside the box again.
    f.move(60);
    f.event("scroll");
    expect(f.frames.size).toBe(1);
    expect(f.anchor.isPinned()).toBe(false);
    f.flush();
    expect(f.writes).toEqual([360, 360]);
    expect(f.element.scrollTop).toBe(360);
    f.event("scroll");
    expect(f.frames.size).toBe(0);
    expect(f.writes).toEqual([360, 360]);

    // Released on blur: the scroller is left where it stands, and a foreign
    // scroll is the reader's again.
    f.owner.release();
    expect(f.element.scrollTop).toBe(360);
    f.move(60);
    f.event("scroll");
    expect(f.frames.size).toBe(0);
    expect(f.element.scrollTop).toBe(60);
    expect(f.writes).toEqual([360, 360]);
  });
  test("upward input with concurrent layout growth captures the actual reader position", () => {
    const f = fixture();
    f.event("wheel", { deltaY: -4 }); f.grow(700); f.move(296); f.event("scroll");
    f.owner.request(true); f.flush();
    expect(f.element.scrollTop).toBe(296);
    expect(f.anchor.isPinned()).toBe(false);
    f.move(390); f.event("scroll");
    expect(f.anchor.isPinned()).toBe(true);
    f.flush(); expect(f.element.scrollTop).toBe(400);
  });
});
