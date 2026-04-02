import { describe, expect, it } from "vitest";
import { isValidPublicUserId } from "./validation.shared";

describe("isValidPublicUserId", () => {
  it("accepts normal ids", () => {
    expect(isValidPublicUserId("user-1")).toBe(true);
    expect(isValidPublicUserId("  u42  ")).toBe(true);
  });

  it("rejects control chars and angle brackets", () => {
    expect(isValidPublicUserId("a\nb")).toBe(false);
    expect(isValidPublicUserId("x<y")).toBe(false);
    expect(isValidPublicUserId("")).toBe(false);
  });
});
