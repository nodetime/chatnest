import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { v7 as uuidv7 } from "uuid";
import { guestRegex } from "@/app/_lib/constants";
import { usesSecureAuthCookies } from "@/server/shared/auth-cookies";

// 每请求 traceId:API 入口生成(uuid7,时序可排序)或透传上游 x-trace-id,
// 挂到请求头供 route 读取,并回显到响应头;logger 经 ALS 自动携带(见 server/shared/logger.ts)
const TRACE_HEADER = "x-trace-id";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  const traceId = pathname.startsWith("/api")
    ? (request.headers.get(TRACE_HEADER) ?? uuidv7())
    : undefined;
  const nextWithTrace = () => {
    const headers = new Headers(request.headers);
    if (traceId) {
      headers.set(TRACE_HEADER, traceId);
    }
    const response = NextResponse.next({ request: { headers } });
    if (traceId) {
      response.headers.set(TRACE_HEADER, traceId);
    }
    return response;
  };

  // Admin APIs own their authorization and return 401/403, never create guest sessions.
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/admin/")) {
    return nextWithTrace();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: usesSecureAuthCookies(request),
  });

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  if (!token) {
    const redirectUrl = encodeURIComponent(new URL(request.url).pathname);

    return NextResponse.redirect(
      new URL(`${base}/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
  }

  return nextWithTrace();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
