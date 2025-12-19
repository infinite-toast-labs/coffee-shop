import { describe, expect, it } from "vitest";
import { normalizeMessage, validateMessage } from "./messages";

describe("normalizeMessage", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeMessage("  hello   world  ")).toBe("hello world");
  });
});

describe("validateMessage", () => {
  it("rejects empty content", () => {
    const result = validateMessage("   ");
    expect(result.ok).toBe(false);
  });

  it("accepts valid content", () => {
    const result = validateMessage("Fresh brew");
    if (!result.ok) {
      throw new Error("Expected valid message");
    }
    expect(result.value).toBe("Fresh brew");
  });
});
