import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isPublicRoute } from "@/lib/authPolicy.mjs";

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  if (request.auth || isPublicRoute(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
