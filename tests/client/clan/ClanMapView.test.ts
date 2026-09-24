import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clanApiMockFactory,
  flushAsync,
  utilsMockFactory,
} from "./ClanModalTestUtils";

vi.mock("../../../src/client/ClanApi", () => clanApiMockFactory());
vi.mock("../../../src/client/Utils", () => utilsMockFactory());

import { fetchClanMap } from "../../../src/client/ClanApi";
import {
  buildTerritories,
  clanColor,
  ClanMapView,
} from "../../../src/client/components/clan/ClanMapView";
import type { ClanMapResponse } from "../../../src/core/ClanApiSchemas";
import { maps } from "../../../src/core/game/Game";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const contender = (tag: string, wins: number) => ({
  tag,
  name: `Clan ${tag}`,
  wins,
  games: wins + 1,
  score: wins,
});

const board: ClanMapResponse = {
  start: "2026-08-25T00:00:00.000Z",
  end: "2026-09-24T00:00:00.000Z",
  territories: [
    {
      map: "Europe",
      holder: contender("NRD", 3),
      contenders: [contender("NRD", 3), contender("SUD", 1)],
    },
    { map: "Africa", holder: contender("SUD", 2), contenders: [] },
  ],
  clans: [
    { tag: "NRD", name: "Clan NRD", territories: 1, score: 3 },
    { tag: "SUD", name: "Clan SUD", territories: 1, score: 2 },
  ],
};

describe("buildTerritories", () => {
  it("lists every map in the public rotation with its holder", () => {
    const list = buildTerritories(board);
    const rotation = maps.filter((m) => m.multiplayerFrequency > 0);
    expect(list.length).toBe(rotation.length);
    expect(list.find((t) => t.map.type === "Europe")?.holder?.tag).toBe("NRD");
    expect(list.find((t) => t.map.type === "Africa")?.holder?.tag).toBe("SUD");
    expect(list.filter((t) => t.holder).length).toBe(2);
  });

  it("leaves every map unclaimed without a board", () => {
    expect(buildTerritories(null).every((t) => t.holder === null)).toBe(true);
  });
});

describe("clanColor", () => {
  it("gives a clan the same colour every time", () => {
    expect(clanColor("NRD")).toBe(clanColor("NRD"));
    expect(clanColor("NRD")).not.toBe(clanColor("SUD"));
  });
});

describe("ClanMapView", () => {
  let view: ClanMapView;

  beforeEach(async () => {
    if (!customElements.get("clan-map-view")) {
      customElements.define("clan-map-view", ClanMapView);
    }
    asMock(fetchClanMap).mockResolvedValue(board);
    view = document.createElement("clan-map-view") as ClanMapView;
    view.myClanTags = ["SUD"];
    document.body.appendChild(view);
    await flushAsync(view);
  });

  afterEach(() => {
    view.remove();
    vi.clearAllMocks();
  });

  const tile = (map: string) =>
    view.querySelector<HTMLButtonElement>(`[data-map="${map}"]`)!;
  const chip = (key: string) =>
    Array.from(view.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === key,
    )!;

  it("colours held maps and leaves free ones disabled", () => {
    expect(tile("Europe").textContent).toContain("[NRD]");
    expect(tile("Europe").disabled).toBe(false);
    expect(tile("World").disabled).toBe(true);
    expect(tile("World").textContent).toContain(
      "clan_modal.territory_unclaimed",
    );
  });

  it("fires clan-select with the holder when a held map is clicked", () => {
    const selected = vi.fn();
    view.addEventListener("clan-select", (e) =>
      selected((e as CustomEvent<{ tag: string }>).detail.tag),
    );
    tile("Europe").click();
    expect(selected).toHaveBeenCalledWith("NRD");
  });

  it("filters down to the player's own territories", async () => {
    chip("clan_modal.territory_filter_mine").click();
    await flushAsync(view);
    const shown = Array.from(view.querySelectorAll("[data-map]")).map((el) =>
      el.getAttribute("data-map"),
    );
    expect(shown).toEqual(["Africa"]);
  });

  it("shows an error when the board can't load", async () => {
    view.remove();
    asMock(fetchClanMap).mockResolvedValue(false);
    view = document.createElement("clan-map-view") as ClanMapView;
    document.body.appendChild(view);
    await flushAsync(view);
    expect(view.textContent).toContain("clan_modal.error_loading");
    expect(view.querySelector("[data-map]")).toBeNull();
  });
});
