import { describe, expect, it } from "vitest";

import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const { token } = await createSessionToken("usr_123");
    expect(await verifySessionToken(token)).toBe("usr_123");
  });

  it("rejects tampered tokens", async () => {
    const { token } = await createSessionToken("usr_123");
    const tampered = token.slice(0, -3) + "abc";
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejects missing or malformed tokens", async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken("not-a-token")).toBeNull();
  });
});
