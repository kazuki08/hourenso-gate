import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/liff(.*)",
  "/api/webhook(.*)",
  "/api/webhook/line(.*)",
  "/api/notion/oauth/callback(.*)",
]);

function isEmbeddedWebView(userAgent: string) {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes(" line/") ||
    ua.includes("fban") ||
    ua.includes("fbav") ||
    ua.includes("instagram") ||
    ua.includes("; wv") ||
    ua.includes("webview")
  );
}

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }

  const { userId } = await auth();
  const userAgent = req.headers.get("user-agent") || "";
  if (!userId && isEmbeddedWebView(userAgent)) {
    const redirectUrl = new URL("/", req.url);
    const requestedPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    redirectUrl.searchParams.set("openExternal", "1");
    redirectUrl.searchParams.set("redirect_url", requestedPath);
    return NextResponse.redirect(redirectUrl);
  }

  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless query params are present.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always apply to API routes.
    "/(api|trpc)(.*)",
  ],
};
