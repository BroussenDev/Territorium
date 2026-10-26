import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerClient } from "../../../src/core/worker/WorkerClient";
import type {
  PlayerActionsResultMessage,
  WorkerMessage,
} from "../../../src/core/worker/WorkerMessages";

type MockWorker = {
  postMessage: (message: unknown) => void;
};

function createClient() {
  const worker: MockWorker = {
    postMessage: vi.fn(),
  };
  const client = new WorkerClient({} as never, undefined);
  const internalClient = client as unknown as {
    worker: MockWorker;
    isInitialized: boolean;
    messageHandlers: Map<string, unknown>;
    handleWorkerMessage: (event: MessageEvent<WorkerMessage>) => void;
  };
  internalClient.worker = worker;
  internalClient.isInitialized = true;
  return { client, worker, internalClient };
}

function actionsResult(): PlayerActionsResultMessage {
  return {
    type: "player_actions_result",
    id: "request-id",
    result: {
      canAttack: true,
      buildableUnits: [],
      canSendEmojiAllPlayers: false,
    },
  };
}

describe("WorkerClient playerInteraction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves and removes the handler when the worker responds", async () => {
    const { client, worker, internalClient } = createClient();
    const promise = client.playerInteraction("7");
    const request = vi.mocked(worker.postMessage).mock.calls[0][0] as {
      id: string;
    };

    internalClient.handleWorkerMessage({
      data: { ...actionsResult(), id: request.id },
    } as MessageEvent<WorkerMessage>);

    await expect(promise).resolves.toEqual({
      canAttack: true,
      buildableUnits: [],
      canSendEmojiAllPlayers: false,
    });
    expect(internalClient.messageHandlers.size).toBe(0);
  });

  it("rejects and removes the handler when the worker reports an error", async () => {
    const { client, worker, internalClient } = createClient();
    const promise = client.playerInteraction("7");
    const rejection = expect(promise).rejects.toThrow(
      "player with id 7 not found",
    );
    const request = vi.mocked(worker.postMessage).mock.calls[0][0] as {
      id: string;
    };

    internalClient.handleWorkerMessage({
      data: {
        type: "player_actions_error",
        id: request.id,
        error: "player with id 7 not found",
      },
    } as MessageEvent<WorkerMessage>);

    await rejection;
    expect(internalClient.messageHandlers.size).toBe(0);
  });

  it("rejects and removes the handler when the worker does not respond", async () => {
    const { client, internalClient } = createClient();
    const promise = client.playerInteraction("7");
    const rejection = expect(promise).rejects.toThrow(
      "player_actions request timed out",
    );

    await vi.advanceTimersByTimeAsync(5000);

    await rejection;
    expect(internalClient.messageHandlers.size).toBe(0);
  });

  it("cleans up only the request that times out when requests run concurrently", async () => {
    const { client, worker, internalClient } = createClient();
    const first = client.playerInteraction("7");
    const second = client.playerInteraction("8");
    const requests = vi
      .mocked(worker.postMessage)
      .mock.calls.map(([message]) => message as { id: string });
    const secondRejection = expect(second).rejects.toThrow(
      "player with id 8 not found",
    );

    internalClient.handleWorkerMessage({
      data: {
        type: "player_actions_error",
        id: requests[1].id,
        error: "player with id 8 not found",
      },
    } as MessageEvent<WorkerMessage>);

    await secondRejection;
    expect(internalClient.messageHandlers.size).toBe(1);

    const firstRejection = expect(first).rejects.toThrow(
      "player_actions request timed out",
    );
    await vi.advanceTimersByTimeAsync(5000);
    await firstRejection;
    expect(internalClient.messageHandlers.size).toBe(0);
  });
});

describe("WorkerClient errors", () => {
  it("raises the worker's uncaught errors on the page for the crash reports", () => {
    const { internalClient } = createClient();
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    addEventListener("game-worker-error", listener);
    (
      internalClient as unknown as {
        handleWorkerError: (e: ErrorEvent) => void;
      }
    ).handleWorkerError(
      new ErrorEvent("error", {
        message: "boom",
        filename: "https://territorium.gg/assets/Worker.worker-a.js",
        lineno: 1,
        colno: 42,
      }),
    );
    removeEventListener("game-worker-error", listener);
    expect(seen).toEqual([
      {
        message: "boom",
        stack: "at https://territorium.gg/assets/Worker.worker-a.js:1:42",
      },
    ]);
  });
});
