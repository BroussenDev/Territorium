import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
}));

import { SteamLaunchDialog } from "../../src/client/components/SteamLaunchDialog";
import {
  showSteamLaunchDialog,
  STEAM_LAUNCH_LOCKED,
  steamLaunchLocked,
} from "../../src/client/SteamLaunch";

if (!customElements.get("steam-launch-dialog")) {
  customElements.define("steam-launch-dialog", SteamLaunchDialog);
}

async function openDialog(feature: "ranked" | "versus" | "public_lobby") {
  showSteamLaunchDialog(feature);
  const dialog = document.querySelector<SteamLaunchDialog>(
    "steam-launch-dialog",
  )!;
  await dialog.updateComplete;
  return dialog;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Steam launch lock", () => {
  it("keeps ranked, Versus and public lobbies locked on the website", () => {
    expect(STEAM_LAUNCH_LOCKED).toBe(true);
  });

  it("opens them in the Steam app", () => {
    window.openfrontDesktop = {};
    try {
      expect(steamLaunchLocked()).toBe(false);
    } finally {
      delete window.openfrontDesktop;
    }
    expect(steamLaunchLocked()).toBe(true);
  });

  it("names the feature the player tried and highlights it", async () => {
    const dialog = await openDialog("versus");
    expect(dialog.querySelector("h2")?.textContent).toContain(
      "steam_launch.title_versus",
    );
    const current = dialog.querySelector('[data-steam-feature="versus"]')!;
    expect(current.className).toContain("border-capital");
  });

  it("links to Territorium's own Steam page", async () => {
    const dialog = await openDialog("ranked");
    const link = dialog.querySelector<HTMLAnchorElement>(
      "[data-steam-wishlist]",
    )!;
    expect(link.href).toContain(
      "store.steampowered.com/app/5369890/Territorium/",
    );
    expect(link.href).toContain("utm_campaign=locked_ranked");
    expect(link.target).toBe("_blank");
  });

  it("shows one dialog at a time and closes on Escape", async () => {
    await openDialog("ranked");
    await openDialog("public_lobby");
    expect(document.querySelectorAll("steam-launch-dialog")).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector("steam-launch-dialog")).toBeNull();
  });
});
