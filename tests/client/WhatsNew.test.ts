import { afterEach, describe, expect, it, vi } from "vitest";
import { translateText } from "../../src/client/Utils";
import {
  WHATS_NEW_ID,
  WHATS_NEW_ITEMS,
  WhatsNew,
  type WhatsNewItem,
  whatsNewDecision,
  whatsNewMediaOf,
  whatsNewVersionLabel,
} from "../../src/client/WhatsNew";

const NEXT = translateText("whats_new.next");
const PREVIOUS = translateText("whats_new.previous");
const OK = translateText("whats_new.ok");

type Mounted = WhatsNew & { updateComplete: Promise<boolean> };

function mount(items?: WhatsNewItem[]): Mounted {
  const el = document.createElement("whats-new") as Mounted;
  if (items) el.items = items;
  document.body.appendChild(el);
  return el;
}

async function ready(el: WhatsNew): Promise<void> {
  await el.updateComplete;
}

function dialog(el: WhatsNew): HTMLElement {
  const found = el.querySelector<HTMLElement>("[data-whats-new]");
  if (!found) throw new Error("dialog not rendered");
  return found;
}

function button(el: WhatsNew, label: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`button "${label}" not rendered`);
  return found;
}

function currentSlide(el: WhatsNew): string | null {
  return (
    el.querySelector("[aria-current='step']")?.getAttribute("aria-label") ??
    null
  );
}

function pointer(
  target: Element,
  type: "pointerdown" | "pointerup",
  clientX: number,
  pointerType = "touch",
) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientX, pointerType });
  target.dispatchEvent(event);
}

const TWO_ITEMS: WhatsNewItem[] = [
  { key: "video", icon: "video" },
  { key: "tips", icon: "tips" },
];

function setReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  document.body.innerHTML = "";
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("WhatsNew", () => {
  it("shows the notes once after an update, never to a newcomer", () => {
    expect(whatsNewDecision(null)).toEqual({ show: false, mark: WHATS_NEW_ID });
    expect(whatsNewDecision("v0_1_100").show).toBe(true);
    expect(whatsNewDecision(WHATS_NEW_ID).show).toBe(false);
  });

  it("labels the release from its id", () => {
    expect(whatsNewVersionLabel("v0_1_180")).toBe("v0.1.180");
    expect(whatsNewVersionLabel()).toBe("v0.1.180");
  });

  it("reads the old image field as a still image", () => {
    expect(
      whatsNewMediaOf({ key: "x", image: "images/whats-new/a/x.webp" }),
    ).toEqual({ src: "images/whats-new/a/x.webp", kind: "image" });
    expect(whatsNewMediaOf({ key: "x" })).toBeNull();
    const clip = {
      src: "images/whats-new/a/x.webm",
      kind: "video" as const,
    };
    expect(whatsNewMediaOf({ key: "x", image: "old.webp", media: clip })).toBe(
      clip,
    );
  });

  it("opens on the first item of three, as a labelled dialog", async () => {
    const el = mount();
    await ready(el);
    const d = dialog(el);
    expect(d.getAttribute("role")).toBe("dialog");
    expect(d.getAttribute("aria-labelledby")).toBe("whats-new-title");
    expect(el.querySelectorAll("[role='group']")).toHaveLength(
      WHATS_NEW_ITEMS.length,
    );
    expect(currentSlide(el)).toBe("1 / 3");
    expect(button(el, PREVIOUS).disabled).toBe(true);
    expect(button(el, NEXT)).toBeTruthy();
  });

  it("moves between items with the buttons, the dots and the arrow keys", async () => {
    const el = mount();
    await ready(el);
    button(el, NEXT).click();
    await ready(el);
    expect(currentSlide(el)).toBe("2 / 3");
    expect(button(el, PREVIOUS).disabled).toBe(false);

    dialog(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await ready(el);
    expect(currentSlide(el)).toBe("3 / 3");

    dialog(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    await ready(el);
    expect(currentSlide(el)).toBe("2 / 3");

    el.querySelector<HTMLButtonElement>("button[aria-label='1 / 3']")?.click();
    await ready(el);
    expect(currentSlide(el)).toBe("1 / 3");
  });

  it("stops at the last item and closes from its button", async () => {
    const el = mount(TWO_ITEMS);
    await ready(el);
    button(el, NEXT).click();
    await ready(el);
    // On the last item the button is the closing one, not "Next".
    expect(() => button(el, NEXT)).toThrow();
    dialog(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await ready(el);
    expect(currentSlide(el)).toBe("2 / 2");
    expect(el.isConnected).toBe(true);

    button(el, OK).click();
    expect(el.isConnected).toBe(false);
  });

  it("closes on Escape and on a click outside the dialog", async () => {
    const first = mount();
    await ready(first);
    dialog(first).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(first.isConnected).toBe(false);

    const second = mount();
    await ready(second);
    second
      .querySelector<HTMLElement>(".fixed")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(second.isConnected).toBe(false);
  });

  it("swipes on touch, but not with the mouse", async () => {
    const el = mount();
    await ready(el);
    const track = el.querySelector<HTMLElement>(".touch-pan-y");
    if (!track) throw new Error("track not rendered");

    pointer(track, "pointerdown", 300, "mouse");
    pointer(track, "pointerup", 100, "mouse");
    await ready(el);
    expect(currentSlide(el)).toBe("1 / 3");

    pointer(track, "pointerdown", 300);
    pointer(track, "pointerup", 200);
    await ready(el);
    expect(currentSlide(el)).toBe("2 / 3");

    pointer(track, "pointerdown", 200);
    pointer(track, "pointerup", 230);
    await ready(el);
    expect(currentSlide(el)).toBe("2 / 3");
  });

  it("keeps focus inside the dialog with Tab", async () => {
    const el = mount(TWO_ITEMS);
    await ready(el);
    const firstFocusable = el.querySelector<HTMLButtonElement>("button");
    const last = button(el, NEXT);
    last.focus();
    const forward = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    dialog(el).dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstFocusable);
  });

  it("renders a video clip muted, looping and inline, with its poster", async () => {
    const el = mount([
      {
        key: "video",
        media: {
          src: "images/whats-new/v/clip.webm",
          kind: "video",
          poster: "images/whats-new/v/clip.webp",
        },
      },
    ]);
    await ready(el);
    const video = el.querySelector("video");
    if (!video) throw new Error("video not rendered");
    expect(video.getAttribute("src")).toContain("images/whats-new/v/clip.webm");
    expect(video.getAttribute("poster")).toContain("clip.webp");
    expect(video.hasAttribute("autoplay")).toBe(true);
    expect(video.hasAttribute("loop")).toBe(true);
    expect(video.hasAttribute("muted")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
  });

  it("renders gifs and images as img elements", async () => {
    const el = mount([
      { key: "a", media: { src: "images/a.webp", kind: "gif" } },
      { key: "b", media: { src: "images/b.webp", kind: "image" } },
    ]);
    await ready(el);
    const img = el.querySelector<HTMLImageElement>("img[loading='lazy']");
    expect(img?.getAttribute("src")).toContain("images/a.webp");
    expect(el.querySelector("video")).toBeNull();
  });

  it("loads media only for the shown item and the next one", async () => {
    const el = mount([
      { key: "a", media: { src: "images/a.webm", kind: "video" } },
      { key: "b", media: { src: "images/b.webm", kind: "video" } },
      { key: "c", media: { src: "images/c.webm", kind: "video" } },
    ]);
    await ready(el);
    const sources = () =>
      [...el.querySelectorAll("video")].map((v) => v.getAttribute("src"));
    expect(sources()).toHaveLength(2);
    button(el, NEXT).click();
    await ready(el);
    expect(sources()).toHaveLength(2);
    expect(sources().join(" ")).toContain("c.webm");
    expect(sources().join(" ")).not.toContain("a.webm");
  });

  it("shows the poster instead of playing a clip with reduced motion", async () => {
    setReducedMotion(true);
    const el = mount([
      {
        key: "video",
        media: {
          src: "images/clip.webm",
          kind: "video",
          poster: "images/clip.webp",
        },
      },
      {
        key: "tips",
        media: { src: "images/loop.webp", kind: "gif" },
      },
    ]);
    await ready(el);
    expect(el.querySelector("video")).toBeNull();
    const poster = el.querySelector("[role='group'] img");
    expect(poster?.getAttribute("src")).toContain("images/clip.webp");
    // A gif has no poster here, so the illustration stays instead.
    button(el, NEXT).click();
    await ready(el);
    expect(el.querySelector("img[src*='loop.webp']")).toBeNull();
  });

  it("keeps still images with reduced motion", async () => {
    setReducedMotion(true);
    const el = mount([
      { key: "a", media: { src: "images/still.webp", kind: "image" } },
    ]);
    await ready(el);
    expect(
      el.querySelector("[role='group'] img")?.getAttribute("src"),
    ).toContain("images/still.webp");
  });

  it("still shows the old image field as a screenshot", async () => {
    const el = mount([{ key: "a", image: "images/old.webp" }]);
    await ready(el);
    expect(
      el.querySelector("[role='group'] img")?.getAttribute("src"),
    ).toContain("images/old.webp");
  });

  it("draws an illustration when an item has no media", async () => {
    const el = mount([{ key: "a" }]);
    await ready(el);
    expect(el.querySelector("[role='group'] img[loading='lazy']")).toBeNull();
    expect(el.querySelector("svg[viewBox='0 0 64 64']")).not.toBeNull();
  });
});
