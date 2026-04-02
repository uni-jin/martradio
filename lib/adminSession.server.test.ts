import { describe, expect, it } from "vitest";
import { signAdminSessionPayload, verifyAdminSessionToken } from "./adminSession.server";

const secret = "unit-test-admin-session-secret-32b!!";

describe("adminSession token", () => {
  it("roundtrips username", () => {
    const t = signAdminSessionPayload("admin", secret);
    const v = verifyAdminSessionToken(t, secret);
    expect(v?.username).toBe("admin");
  });

  it("rejects tampered token", () => {
    const t = signAdminSessionPayload("admin", secret);
    const bad = t.slice(0, -3) + "xxx";
    expect(verifyAdminSessionToken(bad, secret)).toBeNull();
  });
});
