import { describe, it, expect, beforeAll } from "vitest";

// getJwtSecret() requires a 32+ char, non-placeholder-looking secret with
// >=12 unique characters — set it before any module under test is imported.
//
// The import itself is hoisted here rather than repeated inside each test.
// It has to be dynamic (the secret must exist first), but a dynamic import in
// the FIRST test charges that test for transforming the whole module graph,
// which on a cold run overran vitest's 5s per-test timeout and failed there
// while every later test hit the module cache and passed. Paying the cost in
// beforeAll puts it where it belongs.
let auth: typeof import("@/lib/auth-utils");

beforeAll(async () => {
  process.env.JWT_SECRET_KEY = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123";
  auth = await import("@/lib/auth-utils");
});

describe("getAccessTokenFromRequest (cookie parsing)", () => {
  it("returns null when there is no cookie header", async () => {
    const { getAccessTokenFromRequest } = auth;
    const req = new Request("https://example.com");
    expect(getAccessTokenFromRequest(req)).toBeNull();
  });

  it("reads access_token among multiple cookies", async () => {
    const { getAccessTokenFromRequest } = auth;
    const req = new Request("https://example.com", {
      headers: { cookie: "theme=dark; access_token=abc123; other=1" },
    });
    expect(getAccessTokenFromRequest(req)).toBe("abc123");
  });

  it("does not truncate a cookie value containing '=' (e.g. base64 padding)", async () => {
    const { getAccessTokenFromRequest } = auth;
    const req = new Request("https://example.com", {
      headers: { cookie: "access_token=abc==def==" },
    });
    expect(getAccessTokenFromRequest(req)).toBe("abc==def==");
  });

  it("returns null when access_token is absent", async () => {
    const { getAccessTokenFromRequest } = auth;
    const req = new Request("https://example.com", { headers: { cookie: "theme=dark" } });
    expect(getAccessTokenFromRequest(req)).toBeNull();
  });
});

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const { hashPassword, verifyPassword } = auth;
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("access tokens", () => {
  it("round-trips userId/admin/tier through create + verify", async () => {
    const { createAccessToken, verifyAccessToken } = auth;
    const token = await createAccessToken(42, true, "premium");
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("42");
    expect(payload.admin).toBe(true);
    expect(payload.tier).toBe("premium");
  });

  it("returns null for a garbage token", async () => {
    const { verifyAccessToken } = auth;
    expect(await verifyAccessToken("not-a-jwt")).toBeNull();
  });
});

describe("password reset tokens", () => {
  it("round-trips userId/otpRecordId", async () => {
    const { createPasswordResetToken, verifyPasswordResetToken } = auth;
    const token = await createPasswordResetToken(7, 99);
    const result = await verifyPasswordResetToken(token);
    expect(result).toEqual({ userId: 7, otpRecordId: 99 });
  });

  it("rejects a token of the wrong type (email verification token)", async () => {
    const { createVerificationToken, verifyPasswordResetToken } = auth;
    const emailToken = await createVerificationToken(7);
    expect(await verifyPasswordResetToken(emailToken)).toBeNull();
  });
});

describe("email verification tokens", () => {
  it("round-trips the userId", async () => {
    const { createVerificationToken, verifyEmailToken } = auth;
    const token = await createVerificationToken(15);
    expect(await verifyEmailToken(token)).toBe(15);
  });

  it("rejects a token of the wrong type (password reset token)", async () => {
    const { createPasswordResetToken, verifyEmailToken } = auth;
    const resetToken = await createPasswordResetToken(15, 1);
    expect(await verifyEmailToken(resetToken)).toBeNull();
  });
});
