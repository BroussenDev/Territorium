import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiMockFactory,
  authMockFactory,
  clanApiMockFactory,
  crazyGamesSdkMockFactory,
  flushAsync,
  getElState,
  stubGameEnv,
  stubLocalStorage,
  utilsMockFactory,
  virtualizerMockFactory,
  waitForSubComponent,
} from "./ClanModalTestUtils";

vi.mock("@lit-labs/virtualizer/virtualize.js", () => virtualizerMockFactory());
vi.mock("../../../src/client/Api", () => apiMockFactory());
vi.mock("../../../src/client/ClanApi", () => clanApiMockFactory());
vi.mock("../../../src/client/Utils", () => utilsMockFactory());
vi.mock("../../../src/client/Auth", () => authMockFactory());
vi.mock("../../../src/client/CrazyGamesSDK", () => crazyGamesSdkMockFactory());

stubLocalStorage();

import { getUserMe } from "../../../src/client/Api";
import { fetchClanMap, joinClan } from "../../../src/client/ClanApi";
import { ClanModal } from "../../../src/client/ClanModal";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

// Signed out: the map and Browse are public, My Clans asks to sign in, and
// nothing routes the visitor to a 401.
describe("ClanModal — signed out", () => {
  let modal: ClanModal;
  let showPage: ReturnType<typeof vi.fn<(pageId: string) => void>>;

  beforeEach(async () => {
    if (!customElements.get("clan-modal")) {
      customElements.define("clan-modal", ClanModal);
    }
    asMock(getUserMe).mockResolvedValue({ user: {}, player: {} } as never);
    showPage = vi.fn<(pageId: string) => void>();
    window.showPage = showPage;

    modal = document.createElement("clan-modal") as ClanModal;
    modal.setAttribute("inline", "");
    document.body.appendChild(modal);
    await modal.updateComplete;
  });

  afterEach(() => {
    modal.remove();
    delete window.showPage;
    vi.clearAllMocks();
    // Back to the factory's signed-in leader.
    asMock(getUserMe).mockReset();
  });

  function buttonWithText(text: string): HTMLButtonElement | undefined {
    return Array.from(modal.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === text,
    );
  }

  it("stays open on My Clans and offers to sign in", async () => {
    modal.open();
    await flushAsync(modal);

    expect(modal.isOpen()).toBe(true);
    expect(getElState(modal, "activeTab")).toBe("my-clans");
    expect(modal.textContent).toContain("clan_modal.sign_in_for_clans");
    expect(showPage).not.toHaveBeenCalled();

    modal.querySelector<HTMLElement>("o-button")!.click();
    await flushAsync(modal);

    expect(modal.isOpen()).toBe(false);
    expect(showPage).toHaveBeenCalledWith("page-account");
  });

  it("lets a signed-out viewer deep-link to the map", async () => {
    stubGameEnv("dev");
    // The router's sequence for `#modal=clan&tab=map`: showPage() opens the
    // inline modal without args, then the URL's args arrive.
    modal.open();
    modal.open({ tab: "map" });
    await flushAsync(modal);

    expect(modal.isOpen()).toBe(true);
    expect(getElState(modal, "activeTab")).toBe("map");
    expect(modal.querySelector("clan-map-view")).not.toBeNull();
  });

  it("shows the territory map in prod too", async () => {
    stubGameEnv("prod");
    modal.open({ tab: "map" });
    await flushAsync(modal);

    expect(getElState(modal, "activeTab")).toBe("map");
    expect(modal.querySelector("clan-map-view")).not.toBeNull();
  });

  it("lets a signed-out viewer browse clans", async () => {
    modal.open({ tab: "browse" });
    await flushAsync(modal);

    expect(modal.isOpen()).toBe(true);
    expect(modal.querySelector("clan-browse-view")).not.toBeNull();
  });

  it("offers sign-in instead of Join on a clan's detail", async () => {
    modal.open({ clan: "TST" });
    await waitForSubComponent(modal, "clan-detail-view");
    await flushAsync(modal, modal.querySelector("clan-detail-view"));

    expect(buttonWithText("clan_modal.join_clan")).toBeUndefined();
    const signIn = buttonWithText("clan_modal.sign_in_to_join");
    expect(signIn).toBeDefined();

    signIn!.click();
    await flushAsync(modal);

    expect(joinClan).not.toHaveBeenCalled();
    expect(showPage).toHaveBeenCalledWith("page-account");
  });
});

describe("ClanModal — clan map", () => {
  let modal: ClanModal;

  beforeEach(async () => {
    if (!customElements.get("clan-modal")) {
      customElements.define("clan-modal", ClanModal);
    }
    asMock(fetchClanMap).mockResolvedValue({
      start: "2026-08-25T00:00:00.000Z",
      end: "2026-09-24T00:00:00.000Z",
      territories: [
        {
          map: "Europe",
          holder: { tag: "TST", name: "Test", wins: 3, games: 4, score: 3 },
          contenders: [
            { tag: "TST", name: "Test", wins: 3, games: 4, score: 3 },
          ],
        },
      ],
      clans: [{ tag: "TST", name: "Test", territories: 1, score: 3 }],
    });
    modal = document.createElement("clan-modal") as ClanModal;
    modal.setAttribute("inline", "");
    document.body.appendChild(modal);
    await modal.updateComplete;
  });

  afterEach(() => {
    modal.remove();
    vi.clearAllMocks();
  });

  it("opens the holder's page when a held territory is clicked", async () => {
    modal.open({ tab: "map" });
    await flushAsync(modal);
    const mapView = await waitForSubComponent(modal, "clan-map-view");
    await flushAsync(modal, mapView);

    mapView.querySelector<HTMLButtonElement>('[data-map="Europe"]')!.click();
    await flushAsync(modal);

    expect(getElState(modal, "selectedClanTag")).toBe("TST");
    expect(modal.querySelector("clan-detail-view")).not.toBeNull();
  });
});
