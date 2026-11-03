import { describe, expect, it, vi } from "vitest";
import { GameRenderer } from "../../../src/client/hud/GameRenderer";

describe("GameRenderer resize listener", () => {
  function makeRenderer() {
    const transformHandler = {
      centerAll: vi.fn(),
      updateCanvasBoundingRect: vi.fn(),
    };
    const renderer = new GameRenderer(
      transformHandler as never,
      {} as never,
      [],
      {} as never,
    );
    return { renderer, transformHandler };
  }

  it("updates the canvas rect on resize until disposed", () => {
    const { renderer, transformHandler } = makeRenderer();
    renderer.initialize();

    window.dispatchEvent(new Event("resize"));
    expect(transformHandler.updateCanvasBoundingRect).toHaveBeenCalledTimes(1);

    renderer.dispose();
    window.dispatchEvent(new Event("resize"));
    expect(transformHandler.updateCanvasBoundingRect).toHaveBeenCalledTimes(1);
  });

  it("does not stack listeners across renderers", () => {
    const first = makeRenderer();
    first.renderer.initialize();
    first.renderer.dispose();

    const second = makeRenderer();
    second.renderer.initialize();
    window.dispatchEvent(new Event("resize"));

    expect(
      first.transformHandler.updateCanvasBoundingRect,
    ).not.toHaveBeenCalled();
    expect(
      second.transformHandler.updateCanvasBoundingRect,
    ).toHaveBeenCalledTimes(1);
    second.renderer.dispose();
  });
});
