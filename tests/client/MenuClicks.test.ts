import { describe, expect, it } from "vitest";
import { pressedControl } from "../../src/client/sound/MenuClicks";

function pressOn(target: Element): void {
  target.dispatchEvent(
    new Event("pointerdown", { bubbles: true, composed: true }),
  );
}

describe("pressedControl", () => {
  it("finds the button a press landed in", () => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    button.append(label);
    document.body.append(button);
    let control: Element | null = null;
    document.addEventListener(
      "pointerdown",
      (e) => (control = pressedControl(e)),
      { capture: true, once: true },
    );
    pressOn(label);
    expect(control).toBe(button);
    button.remove();
  });

  it("looks inside a component's shadow DOM", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const tab = document.createElement("div");
    tab.setAttribute("role", "tab");
    root.append(tab);
    document.body.append(host);
    let control: Element | null = null;
    document.addEventListener(
      "pointerdown",
      (e) => (control = pressedControl(e)),
      { capture: true, once: true },
    );
    pressOn(tab);
    expect(control).toBe(tab);
    host.remove();
  });

  it("finds nothing on plain text", () => {
    const text = document.createElement("p");
    document.body.append(text);
    let control: Element | null = document.body;
    document.addEventListener(
      "pointerdown",
      (e) => (control = pressedControl(e)),
      { capture: true, once: true },
    );
    pressOn(text);
    expect(control).toBeNull();
    text.remove();
  });
});
