import { NextResponse } from "next/server";
import { authConfigured, expectedSessionToken, SESSION_COOKIE, validPassword } from "../../../../lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") || "").slice(0, 256);
  const nextPath = String(form.get("next") || "/");
  const destination = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";

  if (!authConfigured() || !validPassword(password)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.cookies.set(SESSION_COOKIE, expectedSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
