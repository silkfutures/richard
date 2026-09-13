import { NextResponse } from "next/server";

// Command Centre is intentionally accessible without an app-level password.
// Use Vercel Deployment Protection if access needs to be restricted later.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\.[^/]+$).*)", "/api/:path*"],
};
