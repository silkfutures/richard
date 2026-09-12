import { NextRequest, NextResponse } from "next/server";
import { authConfigured, SESSION_COOKIE, validSession } from "./lib/auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/sw.js",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (authConfigured() && validSession(token)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  if (!authConfigured()) loginUrl.searchParams.set("setup", "1");
  else if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\.[^/]+$).*)", "/api/:path*"],
};
