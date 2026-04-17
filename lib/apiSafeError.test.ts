import { describe, expect, it, vi, afterEach } from "vitest";
import { safeApiErrorMessage } from "./apiSafeError";

describe("safeApiErrorMessage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns internal message when not production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(safeApiErrorMessage("internal detail")).toBe("internal detail");
  });

  it("returns public message in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(safeApiErrorMessage("internal detail")).toBe("요청을 처리할 수 없습니다.");
    expect(safeApiErrorMessage("internal", "공개 메시지")).toBe("공개 메시지");
  });
});
