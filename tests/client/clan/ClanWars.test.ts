import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/client/Api", () => ({
  getApiBase: vi.fn(() => "http://localhost:3000"),
  getUserMe: vi.fn(),
}));

vi.mock("../../../src/client/Auth", () => ({
  getAuthHeader: vi.fn(async () => "Bearer test-token"),
}));

import {
  answerClanWar,
  challengeClan,
  fetchClanLeaderboard,
  fetchClanWars,
} from "../../../src/client/ClanApi";
import "../../../src/client/components/clan/ClanCrestBadge";
import type { ClanCrestBadge } from "../../../src/client/components/clan/ClanCrestBadge";
import "../../../src/client/components/clan/ClanCrestEditor";
import type { ClanCrestEditor } from "../../../src/client/components/clan/ClanCrestEditor";
import "../../../src/client/components/clan/ClanWarsView";
import type { ClanWarsView } from "../../../src/client/components/clan/ClanWarsView";

const okJson = (data: unknown, status = 200) => ({
  ok: true,
  status,
  json: async () => data,
});

const failRes = (status: number, data: unknown = {}) => ({
  ok: false,
  status,
  json: async () => data,
});

const side = (tag: string) => ({ tag, name: `Clan ${tag}`, crest: null });

const war = (id: number, status: string, over: object = {}) => ({
  id,
  challenger: side("BBB"),
  defender: side("AAA"),
  status,
  createdAt: "2026-10-01T00:00:00.000Z",
  answeredAt: null,
  expiresAt: "2026-10-04T00:00:00.000Z",
  endedAt: null,
  winner: null,
  gameId: null,
  ...over,
});

const warsResponse = (wars: object[]) => ({
  season: { number: 1, endsAt: "2026-10-31T23:00:00.000Z" },
  wins: 1,
  losses: 0,
  wars,
});

async function flush(el: { updateComplete: Promise<unknown> }) {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
  }
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("clan war and season requests", () => {
  it("asks for a given season of the clan board", async () => {
    const fetch = vi.fn(async () =>
      okJson({
        start: "2026-10-31T23:00:00.000Z",
        end: "2026-11-30T23:00:00.000Z",
        season: { number: 2, endsAt: "2026-11-30T23:00:00.000Z" },
        currentSeason: 3,
        clans: [
          {
            clanTag: "AAA",
            games: 3,
            wins: 2,
            losses: 1,
            playerSessions: 9,
            weightedWins: 2,
            weightedLosses: 1,
            weightedWLRatio: 2,
            name: "Clan AAA",
            crest: "round:red:white:star",
            warWins: 1,
            warLosses: 0,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const board = await fetchClanLeaderboard(2);
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(
      "http://localhost:3000/public/clans/leaderboard?season=2",
    );
    expect(board && board.season?.number).toBe(2);
    expect(board && board.clans[0].warWins).toBe(1);
  });

  it("parses a clan's wars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson(warsResponse([war(1, "pending")]))),
    );
    const res = await fetchClanWars("AAA");
    expect(res && res.wars[0].defender.tag).toBe("AAA");
  });

  it("maps the challenge refusals to messages", async () => {
    for (const [code, key] of [
      ["WAR_OPEN", "clan_modal.war_error_open"],
      ["WAR_LIMIT", "clan_modal.war_error_limit"],
      ["WAR_SELF", "clan_modal.war_error_self"],
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => failRes(409, { code })),
      );
      expect(await challengeClan("AAA", "BBB")).toEqual({ error: key });
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failRes(404)),
    );
    expect(await challengeClan("AAA", "ZZZ")).toEqual({
      error: "clan_modal.war_error_not_found",
    });
  });

  it("posts the answer to a war", async () => {
    const fetch = vi.fn(async () => okJson(war(4, "accepted")));
    vi.stubGlobal("fetch", fetch);
    const res = await answerClanWar("AAA", 4, "accept");
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(
      "http://localhost:3000/clans/AAA/wars/4/accept",
    );
    expect("error" in res ? null : res.status).toBe("accepted");
  });
});

describe("clan-crest", () => {
  it("draws the stored crest, or the tag's default", async () => {
    const badge = document.createElement("clan-crest") as ClanCrestBadge;
    badge.crest = "banner:navy:gold:crown";
    badge.tag = "AAA";
    document.body.appendChild(badge);
    await badge.updateComplete;
    const svg = badge.shadowRoot!.querySelector("svg")!;
    expect(svg.getAttribute("style")).toContain("#f1c40f");
    expect(svg.querySelector("text")).toBeNull();

    badge.crest = null;
    await badge.updateComplete;
    expect(svg.querySelector("text")?.textContent).toBe("A");
  });
});

describe("clan-crest-editor", () => {
  it("swaps colors instead of hiding the symbol in the field", async () => {
    const editor = document.createElement(
      "clan-crest-editor",
    ) as ClanCrestEditor;
    editor.tag = "AAA";
    editor.value = "shield:navy:gold:star";
    const changes: string[] = [];
    editor.addEventListener("crest-change", (e) =>
      changes.push((e as CustomEvent<{ crest: string }>).detail.crest),
    );
    document.body.appendChild(editor);
    await editor.updateComplete;

    editor
      .querySelector<HTMLButtonElement>('[data-crest-color="field:gold"]')!
      .click();
    expect(changes).toEqual(["shield:gold:navy:star"]);
  });
});

describe("clan-wars-view", () => {
  function mount(roles: [string, string][]) {
    const view = document.createElement("clan-wars-view") as ClanWarsView;
    view.clanTag = "AAA";
    view.myClanRoles = new Map(roles) as ClanWarsView["myClanRoles"];
    document.body.appendChild(view);
    return view;
  }

  it("lets the challenged clan's officers accept", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/accept")
        ? okJson(war(7, "accepted"))
        : okJson(warsResponse([war(7, "pending")])),
    );
    vi.stubGlobal("fetch", fetch);
    const view = mount([["AAA", "officer"]]);
    await flush(view);

    const row = view.querySelector('[data-war-id="7"]')!;
    const buttons = [...row.querySelectorAll("button")].map((b) =>
      b.textContent!.trim(),
    );
    expect(buttons).toContain("clan_modal.war_accept");
    expect(buttons).toContain("clan_modal.war_decline");

    [...row.querySelectorAll("button")]
      .find((b) => b.textContent!.trim() === "clan_modal.war_accept")!
      .click();
    await flush(view);
    expect(fetch.mock.calls.some(([u]) => u.endsWith("/wars/7/accept"))).toBe(
      true,
    );
  });

  it("shows plain members the record without actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okJson(
          warsResponse([
            war(8, "done", { winner: "AAA", endedAt: "2026-10-02T00:00:00Z" }),
          ]),
        ),
      ),
    );
    const view = mount([["AAA", "member"]]);
    await flush(view);
    const row = view.querySelector('[data-war-id="8"]')!;
    expect(row.textContent).toContain("clan_modal.war_won");
    expect(row.querySelectorAll("button")).toHaveLength(1); // the opponent link
    expect(view.querySelector("form")).toBeNull();
  });

  it("offers officers of another clan to challenge this one", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? okJson(war(9, "pending", { challenger: side("CCC") }), 201)
        : okJson(warsResponse([])),
    );
    vi.stubGlobal("fetch", fetch);
    const view = mount([["CCC", "leader"]]);
    await flush(view);
    [...view.querySelectorAll("button")]
      .find((b) => b.textContent!.includes("clan_modal.war_challenge_this"))!
      .click();
    await flush(view);
    const post = fetch.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(post[0]).toBe("http://localhost:3000/clans/CCC/wars");
    expect(JSON.parse(post[1]!.body as string)).toEqual({ opponent: "AAA" });
  });
});
