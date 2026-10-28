import { describe, expect, it } from "vitest";
import {
  BUG_TEXT_MAX,
  bugReportBody,
  gameIDFromPath,
  reporterKey,
} from "../../src/client/BugReport";
import { shouldShowDevNotice } from "../../src/client/DevNotice";

describe("BugReport", () => {
  it("finds the game a page shows", () => {
    expect(gameIDFromPath("/w0/game/amDoEPS2Dz")).toBe("amDoEPS2Dz");
    expect(gameIDFromPath("/")).toBeNull();
  });

  it("sends the player's words, trimmed and capped, with the context", () => {
    const body = bugReportBody(`  ${"x".repeat(3000)}  `, "display", "abc");
    expect(body.text).toHaveLength(BUG_TEXT_MAX);
    expect(body.category).toBe("display");
    expect(body.context.gameID).toBe("abc");
    expect(body.context.platform).toBe("web");
  });
});

describe("reporterKey", () => {
  it("is made once and kept, so the team's answer finds this browser", () => {
    localStorage.clear();
    const key = reporterKey();
    expect(key).toMatch(/^[0-9a-f]{36}$/);
    expect(reporterKey()).toBe(key);
    expect(bugReportBody("Un souci de carte", "other", null).reporterKey).toBe(
      key,
    );
  });
});

describe("DevNotice", () => {
  const storage = (value: string | null) => ({ getItem: () => value });

  it("greets website visitors once per session, never in the Steam app", () => {
    expect(shouldShowDevNotice(false, storage(null))).toBe(true);
    expect(shouldShowDevNotice(false, storage("1"))).toBe(false);
    expect(shouldShowDevNotice(true, storage(null))).toBe(false);
    expect(shouldShowDevNotice(false, null)).toBe(true);
  });
});
