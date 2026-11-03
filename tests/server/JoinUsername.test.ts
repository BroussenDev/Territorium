import { describe, expect, test } from "vitest";
import {
  isJoinUsernameTooLong,
  MAX_JOIN_USERNAME_LENGTH,
} from "../../src/server/JoinUsername";

describe("isJoinUsernameTooLong", () => {
  test("accepts names up to the limit", () => {
    expect(MAX_JOIN_USERNAME_LENGTH).toBe(20);
    expect(isJoinUsernameTooLong("a".repeat(20))).toBe(false);
    expect(isJoinUsernameTooLong("Bastien")).toBe(false);
  });

  test("rejects names over the limit, including the old 27 bound", () => {
    expect(isJoinUsernameTooLong("a".repeat(21))).toBe(true);
    expect(isJoinUsernameTooLong("a".repeat(27))).toBe(true);
  });
});
