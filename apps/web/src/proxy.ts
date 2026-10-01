import { NextResponse, type NextRequest } from "next/server";
import { loginUrl } from "./lib/auth-redirect";

export function proxy(request: NextRequest) {
  const destination = request.nextUrl.pathname + request.nextUrl.search;
  const hasAccess = ["__Host-shanity_access", "shanity_access"].some((name) =>
    Boolean(request.cookies.get(name)?.value),
  );
  if (!hasAccess) {
    const response = NextResponse.redirect(
      new URL(loginUrl(destination), request.url),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  // Always overwrite caller input. The server layout uses this only for navigation.
  const headers = new Headers(request.headers);
  headers.set("x-shanity-return-to", destination);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/my-courses/:path*",
    "/admin/:path*",
  ],
};
