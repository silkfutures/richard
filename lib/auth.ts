import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "command_centre_session";

function authSecret() {
  return process.env.AUTH_SECRET?.trim() || "";
}

export function authConfigured() {
  return Boolean(authSecret() && process.env.COMMAND_CENTRE_PASSWORD?.trim());
}

export function expectedSessionToken() {
  if (!authSecret()) return "";
  return createHmac("sha256", authSecret())
    .update("nathan-command-centre:owner:v1")
    .digest("base64url");
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function safeEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

export function validPassword(password: string) {
  const expected = process.env.COMMAND_CENTRE_PASSWORD || "";
  return Boolean(expected && safeEqual(password, expected));
}

export function validSession(token?: string | null) {
  const expected = expectedSessionToken();
  return Boolean(token && expected && safeEqual(token, expected));
}
