import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname !== "/login" && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/cron")) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      // Must match authOptions.cookies.sessionToken.name in src/lib/auth.ts —
      // withAuth()'s default getToken() doesn't know about that override, so
      // it never found the cookie and bounced every request back to /login.
      cookieName: "lamunn-finance.session-token",
    });

    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Marketing ใช้งาน Finance ได้เฉพาะหน้าทำจ่ายคนไลฟ์และ API เพิ่มรายการเท่านั้น
    // การตรวจตรง middleware ป้องกันการพิมพ์ URL ของหน้า/API อื่นเองโดยตรง
    if (token.role === "MARKETING") {
      const allowedPage = pathname === "/accounting/live-payouts";
      const allowedApi =
        pathname === "/api/accounting/live-payouts" ||
        pathname === "/api/accounting/live-payouts/manual";
      if (!allowedPage && !allowedApi) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Marketing ใช้งานได้เฉพาะหน้าทำจ่ายคนไลฟ์" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/accounting/live-payouts", req.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // ต้องยกเว้นไฟล์ static ทุกตัวในโฟลเดอร์ public/ ด้วย (manifest.json, ไอคอนต่างๆ, favicon) ไม่งั้น
  // เบราว์เซอร์/OS ที่ดึงไฟล์พวกนี้ตรงๆ (ไม่มี cookie login) จะโดน redirect ไป /login แทนที่จะได้ไฟล์จริง
  // ทำให้ "Add to Home Screen" ดึงไอคอน/manifest ไม่ได้ — ยกเว้นด้วยนามสกุลไฟล์แทนชื่อไฟล์เจาะจง กันลืมเวลาเพิ่มไฟล์ใหม่
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|json|webmanifest|xml|txt)$).*)"],
};
