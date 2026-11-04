import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ideasUrl,
  openIdeas,
  openLinks,
  siteLinks,
  type LinksModal,
} from "../../src/client/Links";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Links", () => {
  it("lists every Territorium site, with the French or English paths", () => {
    const fr = Object.fromEntries(siteLinks("fr").map((l) => [l.id, l.url]));
    const en = Object.fromEntries(siteLinks("en").map((l) => [l.id, l.url]));
    expect(Object.keys(fr)).toEqual([
      "help",
      "ideas",
      "wiki",
      "status",
      "developers",
      "press",
      "leaderboards",
      "discord",
    ]);
    expect(fr.ideas).toBe("https://support.territorium.gg/idees");
    expect(en.ideas).toBe("https://support.territorium.gg/ideas");
    expect(fr.leaderboards).toBe("https://territorium.gg/classements");
    expect(en.leaderboards).toBe("https://territorium.gg/leaderboards");
    expect(siteLinks("de").find((l) => l.id === "ideas")?.url).toBe(
      ideasUrl("de"),
    );
    expect(en.discord).toBe("https://discord.gg/SEnDhvxVtv");
    for (const url of Object.values(en)) expect(url).toMatch(/^https:\/\//);
  });

  it("opens the ideas board in a new browser window", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    openIdeas();
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/support\.territorium\.gg\/(idees|ideas)$/,
      ),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens one window at a time, with a custom icon per site, and closes on Escape", async () => {
    openLinks();
    openLinks();
    expect(document.querySelectorAll("links-modal")).toHaveLength(1);
    const el = document.querySelector("links-modal") as LinksModal;
    await el.updateComplete;
    const rows = el.querySelectorAll("a[data-link]");
    expect(rows).toHaveLength(8);
    for (const row of rows) expect(row.querySelector("svg")).not.toBeNull();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    (rows[2] as HTMLElement).click();
    expect(open).toHaveBeenCalledWith(
      "https://wiki.territorium.gg",
      "_blank",
      "noopener,noreferrer",
    );
    el.querySelector("[data-links-modal]")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(document.querySelector("links-modal")).toBeNull();
  });

  it("is translated in every language file", () => {
    const dir = "resources/lang";
    const keys = Object.keys(
      JSON.parse(readFileSync(`${dir}/en.json`, "utf8")).links,
    );
    expect(keys).toContain("suggest");
    expect(keys).toContain("button");
    for (const file of readdirSync(dir)) {
      if (file === "metadata.json") continue;
      const links = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")).links;
      expect(Object.keys(links).sort(), file).toEqual([...keys].sort());
      for (const v of Object.values(links)) expect(v).not.toBe("");
    }
  });
});
