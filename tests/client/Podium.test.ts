import { html, render } from "lit";
import { describe, expect, it } from "vitest";
import { podium } from "../../src/client/components/leaderboard/Podium";

const place = (name: string, value: string) => ({
  key: name,
  name: html`<span class="n">${name}</span>`,
  value,
  unit: "Elo",
});

describe("podium", () => {
  it("shows second, first and third from left to right, first crowned", () => {
    const root = document.createElement("div");
    render(
      podium("test", [
        place("Gold", "2140"),
        place("Silver", "2079"),
        place("Bronze", "2018"),
      ]),
      root,
    );
    const names = [...root.querySelectorAll(".n")].map((n) => n.textContent);
    expect(names).toEqual(["Silver", "Gold", "Bronze"]);
    // One crown (no fill url), three medals with their own gradient ids.
    const ids = [...root.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(ids.sort()).toEqual([
      "podium-test-0",
      "podium-test-1",
      "podium-test-2",
    ]);
    expect(root.textContent).not.toMatch(/👑|🥈|🥉/u);
  });

  it("leaves empty steps bare and draws nothing without anyone", () => {
    const root = document.createElement("div");
    render(podium("test", [place("Only", "10")]), root);
    expect(root.querySelectorAll(".n")).toHaveLength(1);
    expect(root.querySelectorAll('[role="listitem"]')).toHaveLength(3);
    const empty = document.createElement("div");
    render(podium("test", []), empty);
    expect(empty.querySelector('[role="list"]')).toBeNull();
  });
});
