import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthHeader, getUserMe, linkDiscord } = vi.hoisted(() => ({
  getAuthHeader: vi.fn(),
  getUserMe: vi.fn(),
  linkDiscord: vi.fn(),
}));
vi.mock("../../src/client/Auth", () => ({
  getAuthHeader: () => getAuthHeader(),
  linkDiscord: () => linkDiscord(),
}));
vi.mock("../../src/client/Api", () => ({
  getUserMe: () => getUserMe(),
}));
vi.mock("../../src/client/InGameModal", () => ({
  showInGameAlert: vi.fn(),
}));
vi.mock("../../src/client/ApiBase", () => ({
  getApiBase: () => "https://api.test",
}));
vi.mock("../../src/client/Utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Utils")>()),
  translateText: (key: string) => key,
}));

import "../../src/client/components/DiscordShareToggle";
import {
  privateGameChanged,
  privateGameEnded,
} from "../../src/client/DiscordShare";

const fetchMock = vi.fn();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  fetchMock.mockReset();
  getAuthHeader.mockReset();
  getAuthHeader.mockResolvedValue("Bearer jwt");
  getUserMe.mockReset();
  getUserMe.mockResolvedValue({
    user: {
      discord: {
        id: "1",
        avatar: null,
        username: "chef",
        global_name: "Chef",
        discriminator: "0",
      },
    },
  });
  linkDiscord.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("discord-share-toggle", () => {
  it("shows the saved setting and saves a change", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ enabled: false, linked: true })),
    );
    const el = document.createElement("discord-share-toggle");
    document.body.appendChild(el);
    await flush();
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete;
    const input = el.querySelector<HTMLInputElement>("#discord-share-toggle")!;
    expect(input.checked).toBe(false);
    expect(el.textContent).toContain("account_modal.discord_share");

    fetchMock.mockResolvedValueOnce(new Response("{}"));
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    await flush();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.test/users/@me/discord-share");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ enabled: true });
    expect(input.checked).toBe(true);
  });

  it("puts the switch back and says so when saving fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ enabled: true })),
    );
    const el = document.createElement("discord-share-toggle");
    document.body.appendChild(el);
    await flush();
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete;
    const input = el.querySelector<HTMLInputElement>("#discord-share-toggle")!;
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    input.checked = false;
    input.dispatchEvent(new Event("change"));
    await flush();
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete;
    expect(input.checked).toBe(true);
    expect(el.textContent).toContain("account_modal.discord_share_failed");
  });

  it("asks to sign in when signed out", async () => {
    getUserMe.mockResolvedValue(false);
    const el = document.createElement("discord-share-toggle");
    document.body.appendChild(el);
    await flush();
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete;
    expect(el.querySelector("input")).toBeNull();
    expect(el.textContent).toContain("user_setting.discord_signed_out");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers to link Discord when the account has none", async () => {
    getUserMe.mockResolvedValue({ user: {} });
    linkDiscord.mockResolvedValue(true);
    const el = document.createElement("discord-share-toggle");
    document.body.appendChild(el);
    await flush();
    await (el as unknown as { updateComplete: Promise<void> }).updateComplete;
    expect(el.querySelector("input")).toBeNull();
    el.querySelector<HTMLButtonElement>("#discord-link-button")!.click();
    expect(linkDiscord).toHaveBeenCalled();
  });
});

describe("private game reports", () => {
  it("reports the lobby once its settings settle, then its end", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response("{}"));
    privateGameChanged("AbCd1234", { map: "World", mode: "Free For All" });
    privateGameChanged("AbCd1234", { map: "Europe", mode: "Team" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/users/@me/private-game");
    expect(JSON.parse(init.body)).toEqual({
      gameID: "AbCd1234",
      map: "Europe",
      mode: "Team",
    });

    privateGameEnded("AbCd1234");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.test/users/@me/private-game/AbCd1234",
    );
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
  });

  it("sends nothing for a lobby closed before its report", async () => {
    vi.useFakeTimers();
    privateGameChanged("Zz998877", { map: "World", mode: "Team" });
    privateGameEnded("Zz998877");
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
