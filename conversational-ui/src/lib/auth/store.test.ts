import { describe, expect, it } from "vitest";

import { createUser, verifyCredentials } from "@/lib/auth/store";

describe("auth store", () => {
  it("verifies the seeded demo account", async () => {
    const user = await verifyCredentials("demo@underarmour.com", "password123");
    expect(user?.email).toBe("demo@underarmour.com");
  });

  it("rejects wrong passwords", async () => {
    expect(await verifyCredentials("demo@underarmour.com", "wrong")).toBeNull();
  });

  it("creates a new user and prevents duplicates", async () => {
    const email = `new_${Date.now()}@ua.com`;
    const created = await createUser("New User", email, "password123");
    expect(created.user?.email).toBe(email);
    const dup = await createUser("New User", email, "password123");
    expect(dup.error).toBeTruthy();
  });
});
