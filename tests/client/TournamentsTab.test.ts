import { describe, expect, it } from "vitest";
import {
  hasLiveTournament,
  setTournamentsTabVisible,
} from "../../src/client/TournamentsTab";

describe("TournamentsTab", () => {
  it("shows the tab only while a tournament is open or running", () => {
    expect(hasLiveTournament([])).toBe(false);
    expect(
      hasLiveTournament([{ status: "finished" }, { status: "draft" }]),
    ).toBe(false);
    expect(
      hasLiveTournament([{ status: "finished" }, { status: "open" }]),
    ).toBe(true);
    expect(hasLiveTournament([{ status: "running" }])).toBe(true);
  });

  it("toggles the class that hides it", () => {
    setTournamentsTabVisible(false);
    expect(document.documentElement.classList.contains("no-tournaments")).toBe(
      true,
    );
    setTournamentsTabVisible(true);
    expect(document.documentElement.classList.contains("no-tournaments")).toBe(
      false,
    );
  });
});
