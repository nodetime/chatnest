import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { v7 as uuidv7 } from "uuid";
import {
  authReturnPath,
  isPersonalSection,
  personalLoginHref,
} from "@/app/_lib/auth-navigation";
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

  // Public, fixed brand assets must load on login pages without creating a guest.
  // This does not expose uploads or any arbitrary /brand/* resource.
  if (["/brand/radar.svg", "/icon.svg", "/apple-icon.png"].includes(pathname)) {
    return nextWithTrace();
  }

  // These APIs own authorization; message reads also support public sharing.
  if (
    pathname === "/api/health/ready" ||
    pathname === "/api/messages" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/admin/")
  ) {
    return nextWithTrace();
  }

  // Internal billing workers authenticate with a deployment-scoped control token
  // and must not be redirected into the browser guest flow.
  if (
    pathname.startsWith("/api/internal/") &&
    process.env.CHATNEST_CONTROL_TOKEN &&
    request.headers.get("x-chatnest-control-token") ===
      process.env.CHATNEST_CONTROL_TOKEN
  ) {
    return nextWithTrace();
  }

  // The public homepage is not a chat task. Personal return links still pass
  // through their existing authentication guard below; no APIs are made public.
  if (
    pathname === "/" &&
    !isPersonalSection(request.nextUrl.searchParams.get("section") ?? "")
  ) {
    return nextWithTrace();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: usesSecureAuthCookies(request),
  });

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const isAccountPage =
    [
      "/billing",
      "/usage",
      "/organizations",
      "/account",
      "/account/billing",
      "/account/usage",
      "/account/organizations",
    ].includes(pathname) || pathname.startsWith("/account/");
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAccountApi =
    pathname.startsWith("/api/account/") ||
    pathname === "/api/billing" ||
    pathname.startsWith("/api/billing/") ||
    pathname === "/api/organizations" ||
    pathname.startsWith("/api/organizations/");

  // Account surfaces belong to authenticated regular users. Keep them out of
  // the guest bootstrap flow so a direct URL never renders a misleading
  // platform-connection error, and APIs return a machine-readable 401.
  if (isAccountApi && token?.type !== "regular") {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }

  if (isAccountPage && token?.type !== "regular") {
    return NextResponse.redirect(
      new URL(`${base}/login?next=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  // Keep the platform-admin shell out of the guest workspace. The admin
  // layout performs the final staff authorization and returns 404 for regular
  // users without admin membership.
  if (isAdminPage && token?.type !== "regular") {
    return NextResponse.redirect(
      new URL(`${base}/login?next=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  const requestedSection = request.nextUrl.searchParams.get("section") ?? "";
  if (
    pathname === "/" &&
    isPersonalSection(requestedSection) &&
    token?.type !== "regular"
  ) {
    return NextResponse.redirect(
      new URL(`${base}${personalLoginHref(requestedSection)}`, request.url)
    );
  }

  // Auth pages are public. Do not create a guest or lose a validated return target.
  if (!token && ["/login", "/register"].includes(pathname)) {
    return nextWithTrace();
  }

  if (!token) {
    const redirectUrl = encodeURIComponent(new URL(request.url).pathname);

    return NextResponse.redirect(
      new URL(`${base}/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(
      new URL(
        `${base}${authReturnPath(request.nextUrl.searchParams.get("next"))}`,
        request.url
      )
    );
  }

  return nextWithTrace();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/login",
    "/register",

    // The upload handler owns authentication, origin and body admission.
    // Matching it here makes Next.js clone and drain the body before the handler.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/files/upload/?$).*)",
  ],
};
