"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import AppSwitcher from "./AppSwitcher";
import clsx from "clsx";
import { LayoutDashboard, CalendarDays, Inbox, Radio, BarChart3, Wallet, Banknote, Package, Users, Tv, UserCog, LogOut, Menu, X } from "lucide-react";

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "ผู้ดูแลระบบสูงสุด",
  MANAGER: "ผู้จัดการ",
  STAFF: "พนักงาน",
};

const ALL_ROLES = ["SUPER_ADMIN", "MANAGER", "STAFF"];
const EDITOR_ROLES = ["SUPER_ADMIN", "MANAGER"];

const mainLinks = [
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard, roles: ALL_ROLES },
  { href: "/schedule", label: "ตารางไลฟ์", icon: CalendarDays, roles: ALL_ROLES },
  { href: "/requests", label: "คำขอจองกะ", icon: Inbox, roles: ALL_ROLES },
  { href: "/sessions", label: "บันทึกรอบไลฟ์", icon: Radio, roles: ALL_ROLES },
  { href: "/analysis", label: "วิเคราะห์ & กำไร", icon: BarChart3, roles: ALL_ROLES },
  { href: "/commission", label: "ค่าตอบแทนคนไลฟ์", icon: Wallet, roles: ALL_ROLES },
  { href: "/payouts", label: "ทำจ่ายรายวัน", icon: Banknote, roles: EDITOR_ROLES },
];

const otherLinks = [
  { href: "/streamers", label: "คนไลฟ์", icon: Users, roles: EDITOR_ROLES },
  { href: "/channels", label: "ช่องทางไลฟ์", icon: Tv, roles: EDITOR_ROLES },
  { href: "/products", label: "สินค้า / ต้นทุน", icon: Package, roles: EDITOR_ROLES },
  { href: "/staff", label: "ผู้ใช้งาน", icon: UserCog, roles: ["SUPER_ADMIN"] },
];

export default function Nav({ role, name, pendingRequests = 0 }: { role: string; name: string; pendingRequests?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const main = mainLinks.filter((l) => l.roles.includes(role));
  const other = otherLinks.filter((l) => l.roles.includes(role));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function renderLink(link: (typeof mainLinks)[number]) {
    const Icon = link.icon;
    const active = pathname === link.href || pathname.startsWith(link.href + "/") || (link.href === "/schedule" && pathname.startsWith("/shifts/"));
    return (
      <Link
        key={link.href}
        href={link.href}
        className={clsx(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
          active ? "bg-white/10 text-white" : "text-stone-400 hover:bg-white/5 hover:text-stone-100"
        )}
      >
        {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-brand-400" />}
        <Icon size={16} strokeWidth={2} className={clsx("shrink-0", active ? "text-brand-300" : "text-stone-500 group-hover:text-stone-300")} />
        <span className="font-medium">{link.label}</span>
        {link.href === "/requests" && pendingRequests > 0 && (
          <span className="ml-auto rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{pendingRequests}</span>
        )}
      </Link>
    );
  }

  const navBody = (
    <>
      <div className="mb-7 flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Radio size={17} strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold tracking-tight text-white">Lamunn Live</p>
          <p className="text-[11px] text-stone-500">หลังบ้านทีมไลฟ์</p>
        </div>
      </div>

      <AppSwitcher current="live" />

      <nav className="flex flex-1 flex-col gap-0.5">
        <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">งานประจำวัน</p>
        {main.map((link) => renderLink(link))}
        {other.length > 0 && (
          <>
            <p className="mb-1.5 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">ตั้งค่า</p>
            {other.map((link) => renderLink(link))}
          </>
        )}
      </nav>

      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">{name.slice(0, 1) || "?"}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium text-white">{name}</p>
            <p className="text-[11px] text-stone-500">{roleLabel[role] ?? role}</p>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} title="ออกจากระบบ" className="rounded-md p-1.5 text-stone-500 transition hover:bg-white/10 hover:text-white">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* มือถือ: แถบบน */}
      <div className="flex items-center justify-between bg-ink px-4 py-3 text-white md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500">
            <Radio size={14} strokeWidth={2.4} />
          </div>
          <p className="font-display text-sm font-semibold">Lamunn Live</p>
        </div>
        <button onClick={() => setOpen(true)} aria-label="เปิดเมนู" className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-300 hover:bg-white/10">
          <Menu size={20} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-ink px-4 py-5 shadow-pop">
            <button onClick={() => setOpen(false)} aria-label="ปิดเมนู" className="mb-3 flex h-8 w-8 items-center justify-center self-end rounded-lg text-stone-400 hover:bg-white/10">
              <X size={18} />
            </button>
            {navBody}
          </aside>
        </div>
      )}

      {/* จอใหญ่: sidebar เข้ม */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-ink px-4 py-6 md:flex">{navBody}</aside>
    </>
  );
}
