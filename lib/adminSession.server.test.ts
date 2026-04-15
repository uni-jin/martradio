import { describe, expect, it } from "vitest";
import { signAdminSessionPayload, verifyAdminSessionToken } from "./adminSession.server";

const secret = "unit-test-admin-session-secret-32b!!";

describe("adminSession token", () => {
  it("roundtrips username", () => {
    const t = signAdminSessionPayload({ username: "admin", role: "admin", referrerId: null }, secret);
    const v = verifyAdminSessionToken(t, secret);
    expect(v?.username).toBe("admin");
    expect(v?.role).toBe("admin");
    expect(v?.referrerId).toBeNull();
  });

  it("rejects tampered token", () => {
    const t = signAdminSessionPayload({ username: "admin", role: "admin", referrerId: null }, secret);
    const bad = t.slice(0, -3) + "xxx";
    expect(verifyAdminSessionToken(bad, secret)).toBeNull();
  });
});
