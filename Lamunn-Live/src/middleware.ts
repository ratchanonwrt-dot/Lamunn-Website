import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // หน้า "สรุปกำไร" เดิมถูกรวมเข้า "วิเคราะห์ & กำไร" — พาไปหน้ารวมทันที (คงช่วงวันที่ใน query ไว้)
  if (pathname === "/profit") {
    const url = req.nextUrl.clone();
    url.pathname = "/analysis";
    url.searchParams.delete("range");
    return NextResponse.redirect(url);
  }

  // API สำหรับเว็บ Finance (ทำจ่าย) ใช้กุญแจลับใน header แทนคุกกี้ — ตรวจสิทธิ์ใน route เอง
  const payoutApi = pathname === "/api/payouts/export" || /^\/api\/payouts\/[^/]+\/paid$/.test(pathname);

  if (pathname !== "/login" && !pathname.startsWith("/api/auth") && !payoutApi) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      // Must match authOptions.cookies.sessionToken.name in src/lib/auth.ts —
      // withAuth()'s default getToken() doesn't know about that override, so
      // it never found the cookie and bounced every request back to /login.
      cookieName: "lamunn-live.session-token",
    });

    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|json|webmanifest|xml|txt)$).*)"],
};
