"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import clsx from "clsx";
import AppSwitcher from "./AppSwitcher";
import {
  LayoutDashboard,
  Building2,
  Clock,
  Wallet,
  BarChart3,
  Landmark,
  SlidersHorizontal,
  CalendarDays,
  LogOut,
  Menu,
  X,
  Users,
  ShieldCheck,
  Receipt,
  PiggyBank,
  Lock,
  ChefHat,
  CalendarCheck,
  UserRound,
  ShoppingBag,
  Utensils,
  BookOpen,
  Scale,
  FileSpreadsheet,
  ReceiptText,
  ListTree,
  Trophy,
  History,
  ChevronDown,
  TrendingUp,
  Handshake,
  Banknote,
} from "lucide-react";
import type { PermissionMap, PermissionSection } from "@/lib/permissions";

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "ผู้ดูแลระบบสูงสุด",
  MANAGER: "Manager",
  STAFF: "Accounting Team",
  CATERING_STAFF: "Catering Team",
};

interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  color: string;
  section: PermissionSection;
  exact?: boolean;
  activePrefixes?: string[];
}

interface NavMenuGroup {
  label: string;
  items: NavMenuItem[];
}

type NavMenuItem = NavLink | NavMenuGroup;

/** สีประจำแต่ละหมวด — ให้เห็นทันทีว่ากำลังอยู่หมวดไหนก่อนจะอ่านตัวหนังสือด้วยซ้ำ
 * (แนวเดียวกับ Nav ของ Employee Manage) เขียนเป็น class string เต็มๆ แทนที่จะประกอบจากตัวแปร
 * เพราะ Tailwind ต้องเห็น class ตรงๆ ในซอร์สถึงจะ generate ให้ */
type Tone = keyof typeof TONES;
const TONES = {
  blue: {
    title: "text-brand-700",
    bar: "bg-brand-500",
    rail: "border-brand-100",
  },
  amber: {
    title: "text-amber-700",
    bar: "bg-amber-500",
    rail: "border-amber-100",
  },
  violet: {
    title: "text-violet-700",
    bar: "bg-violet-500",
    rail: "border-violet-100",
  },
  green: {
    title: "text-emerald-700",
    bar: "bg-emerald-500",
    rail: "border-emerald-100",
  },
  slate: {
    title: "text-gray-500",
    bar: "bg-gray-400",
    rail: "border-gray-200",
  },
} as const;

// กลุ่ม "การเงิน" — งานหลักที่ใช้บ่อยประจำวัน (วางบิลย้ายไปอยู่หมวดบัญชีแล้ว)
const financeLinks: NavLink[] = [
  { href: "/reports", label: "รายงาน/วิเคราะห์", icon: BarChart3, color: "bg-blue-100 text-blue-500", section: "REPORTS" },
  { href: "/monthly", label: "ยอดขายรายวัน (รายเดือน)", icon: CalendarDays, color: "bg-indigo-100 text-indigo-500", section: "MONTHLY" },
  { href: "/credit-term", label: "Credit Term", icon: Clock, color: "bg-amber-100 text-amber-500", section: "CREDIT_TERM" },
  { href: "/cash-status", label: "สถานะเงินสด", icon: Wallet, color: "bg-violet-100 text-violet-500", section: "CASH_STATUS" },
  { href: "/dashboard", label: "ภาพรวม", icon: LayoutDashboard, color: "bg-sky-100 text-sky-500", section: "DASHBOARD" },
  { href: "/investment-cost", label: "ค่าใช้จ่ายลงทุน", icon: TrendingUp, color: "bg-fuchsia-100 text-fuchsia-500", section: "INVESTMENT_COST" },
  { href: "/reports/ranking", label: "อันดับยอดขายรายสาขา", icon: Trophy, color: "bg-yellow-100 text-yellow-600", section: "REPORTS" },
  { href: "/reports/sssg", label: "SSSG สาขาเดิม", icon: BarChart3, color: "bg-orange-100 text-orange-500", section: "REPORTS" },
];

// กลุ่ม "บัญชี" — งานหลังบ้านที่ทีมบัญชีใช้เป็นหลัก (มัดจำ/ค่าเช่า/ตั้งค่าสาขา/เงินเข้าบัญชี)
const accountingLinks: NavLink[] = [
  { href: "/held-deposits", label: "เงินมัดจำ", icon: PiggyBank, color: "bg-lime-100 text-lime-600", section: "HELD_DEPOSITS" },
  { href: "/rent", label: "ค่าเช่า", icon: Landmark, color: "bg-orange-100 text-orange-500", section: "RENT" },
  { href: "/branches", label: "ตั้งค่าสาขา/ค่าเช่า", icon: Building2, color: "bg-slate-100 text-slate-500", section: "BRANCHES" },
  { href: "/deposits", label: "เงินเข้าบัญชี", icon: Landmark, color: "bg-cyan-100 text-cyan-500", section: "DEPOSITS" },
  { href: "/reports/branch-sales", label: "ดึงยอดขายรายสาขา", icon: FileSpreadsheet, color: "bg-cyan-100 text-cyan-600", section: "REPORTS" },
  { href: "/credit-term/billing", label: "วางบิล (Credit Term)", icon: Receipt, color: "bg-rose-100 text-rose-500", section: "CREDIT_TERM" },
  { href: "/accounting/live-payouts", label: "ทำจ่ายคนไลฟ์", icon: Banknote, color: "bg-lime-100 text-lime-600", section: "ACCOUNTING" },
];

// แยกงบการเงินออกจากงานบัญชี เพื่อให้หมวดรีพอร์ตไม่กางรายการยาวจนหาเมนูยาก
const financialStatementLinks: NavLink[] = [
  { href: "/accounting", label: "ภาพรวมบัญชี", icon: BookOpen, color: "bg-emerald-100 text-emerald-600", section: "ACCOUNTING", exact: true },
  { href: "/accounting/trial-balance", label: "งบทดลอง", icon: Scale, color: "bg-teal-100 text-teal-600", section: "ACCOUNTING" },
  { href: "/accounting/income-statement", label: "งบกำไรขาดทุน", icon: BarChart3, color: "bg-green-100 text-green-600", section: "ACCOUNTING" },
  { href: "/accounting/balance-sheet", label: "งบแสดงฐานะการเงิน", icon: FileSpreadsheet, color: "bg-sky-100 text-sky-600", section: "ACCOUNTING" },
];

const taxReportLinks: NavLink[] = [
  {
    href: "/accounting/tax-reports",
    label: "ภ.พ.30",
    icon: ReceiptText,
    color: "bg-violet-100 text-violet-600",
    section: "ACCOUNTING",
    exact: true,
    activePrefixes: ["/accounting/tax-reports/input-vat", "/accounting/tax-reports/output-vat"],
  },
  {
    href: "/accounting/tax-reports/pnd3",
    label: "ภ.ง.ด.",
    icon: Landmark,
    color: "bg-fuchsia-100 text-fuchsia-600",
    section: "ACCOUNTING",
    exact: true,
    activePrefixes: ["/accounting/tax-reports/pnd3", "/accounting/tax-reports/pnd53"],
  },
];

const accountingReportItems: NavMenuItem[] = [
  { href: "/accounting/journal", label: "สมุดรายวัน", icon: ListTree, color: "bg-indigo-100 text-indigo-600", section: "ACCOUNTING" },
  { href: "/accounting/ledger", label: "บัญชีแยกประเภท", icon: BookOpen, color: "bg-purple-100 text-purple-600", section: "ACCOUNTING" },
  { href: "/accounting/bank-reconciliation", label: "กระทบยอดเงินฝากธนาคาร", icon: Landmark, color: "bg-cyan-100 text-cyan-600", section: "ACCOUNTING" },
  { href: "/accounting/daily-posting", label: "ลงบัญชียอดขายรายวัน", icon: CalendarDays, color: "bg-blue-100 text-blue-600", section: "ACCOUNTING" },
  { href: "/accounting/tax-invoices", label: "ใบกำกับภาษีเต็มรูป", icon: ReceiptText, color: "bg-rose-100 text-rose-600", section: "ACCOUNTING" },
  { label: "รายงานภาษี", items: taxReportLinks },
  { href: "/accounting/partners", label: "คู่ค้า (ลูกหนี้/เจ้าหนี้)", icon: Handshake, color: "bg-amber-100 text-amber-600", section: "ACCOUNTING" },
];

const reportMenuGroups: NavMenuGroup[] = [
  { label: "งบการเงิน", items: financialStatementLinks },
  { label: "บัญชี", items: accountingReportItems },
];

// กลุ่ม "อื่นๆ" — ใช้ไม่บ่อยเท่า/งานตั้งค่า
const otherLinks: NavLink[] = [
  { href: "/settings", label: "ตั้งค่าระบบ", icon: SlidersHorizontal, color: "bg-gray-200 text-gray-600", section: "SETTINGS" },
];

// กลุ่ม Catering — จัดเลี้ยง/รับออเดอร์หน้าร้าน
const cateringLinks: NavLink[] = [
  { href: "/catering", label: "Catering Overall", icon: ChefHat, color: "bg-orange-100 text-orange-600", section: "CATERING" },
  { href: "/catering/bookings", label: "งานจัดเลี้ยง", icon: CalendarCheck, color: "bg-amber-100 text-amber-600", section: "CATERING" },
  { href: "/catering/customers", label: "ลูกค้า", icon: UserRound, color: "bg-teal-100 text-teal-600", section: "CATERING" },
  { href: "/catering/menu", label: "จัดการเมนู/ราคา", icon: Utensils, color: "bg-lime-100 text-lime-600", section: "CATERING" },
  { href: "/catering/pickup-orders", label: "ออเดอร์รับที่ร้าน", icon: ShoppingBag, color: "bg-rose-100 text-rose-600", section: "CATERING" },
];

function isActiveLink(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function isNavLink(item: NavMenuItem): item is NavLink {
  return "href" in item;
}

function isNavLinkActive(pathname: string, link: NavLink) {
  const routeMatch = link.exact ? pathname === link.href : isActiveLink(pathname, link.href);
  return routeMatch || Boolean(link.activePrefixes?.some((prefix) => isActiveLink(pathname, prefix)));
}

function menuItemHasActive(pathname: string, item: NavMenuItem): boolean {
  return isNavLink(item)
    ? isNavLinkActive(pathname, item)
    : item.items.some((child) => menuItemHasActive(pathname, child));
}

function filterMenuItems(items: NavMenuItem[], canView: (link: NavLink) => boolean): NavMenuItem[] {
  const visibleItems: NavMenuItem[] = [];
  for (const item of items) {
    if (isNavLink(item)) {
      if (canView(item)) visibleItems.push(item);
      continue;
    }
    const childItems = filterMenuItems(item.items, canView);
    if (childItems.length > 0) visibleItems.push({ ...item, items: childItems });
  }
  return visibleItems;
}

function NavLinkRow({ link, pathname, colorful = false }: { link: NavLink; pathname: string; colorful?: boolean }) {
  const Icon = link.icon;
  const active = isNavLinkActive(pathname, link);
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      // ไม่ปิด prefetch — Next.js จะโหลด loading.tsx ของหน้าปลายทางไว้ล่วงหน้าตอนลิงก์อยู่ในจอ
      // พอกดจึงขึ้น skeleton ทันทีแทนที่จะค้างรอเซิร์ฟเวอร์ตอบก่อน (นี่คือความต่างจากเว็บ HRM ที่กดแล้ววิ่งเลย)
      // ใช้ได้คุ้มเพราะเมนูยุบเป็นหมวดอยู่แล้ว มีแค่ลิงก์ของหมวดที่กางอยู่เท่านั้นที่ถูก prefetch
      // สีประจำรายงานช่วยแยกเมนูงบการเงิน ส่วนกรอบและตัวหนาช่วยระบุหน้าที่เปิดอยู่
      className={clsx(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        colorful
          ? [link.color, active ? "font-semibold ring-1 ring-inset ring-current" : "font-medium hover:brightness-95"]
          : active ? "bg-brand-50 font-semibold text-brand-700" : "font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      <Icon size={16} strokeWidth={2} className={clsx("shrink-0", colorful ? "text-current" : active ? "text-brand-600" : "text-gray-400 group-hover:text-gray-600")} />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

/** หมวดในเมนูซ้าย — ยุบไว้เป็นค่าเริ่มต้น เห็นแค่ชื่อหมวดใหญ่
 * หมวดที่มีหน้าที่กำลังเปิดอยู่จะกางให้เองอัตโนมัติ (จะได้รู้ว่าตัวเองอยู่ตรงไหน)
 * และกางค้างไว้ตามที่ผู้ใช้กด แม้เปลี่ยนหน้าไปหน้าอื่นในหมวดเดียวกัน */
function NavGroup({ title, tone, links, pathname, colorful = false }: { title: string; tone: Tone; links: NavLink[]; pathname: string; colorful?: boolean }) {
  const hasActive = links.some((l) => isActiveLink(pathname, l.href));
  const [open, setOpen] = useState(hasActive);

  // ถ้าย้ายไปหน้าที่อยู่ในหมวดนี้ ให้กางหมวดนี้ขึ้นมาเอง (แต่ไม่บังคับยุบหมวดอื่นที่ผู้ใช้กางไว้)
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  if (links.length === 0) return null;
  const t = TONES[tone];

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-100"
      >
        <span className={clsx("h-3.5 w-1 shrink-0 rounded-full", t.bar)} />
        <p className={clsx("flex-1 text-[11px] font-semibold uppercase tracking-[0.12em]", t.title)}>{title}</p>
        {hasActive && !open && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", t.bar)} />}
        <ChevronDown
          size={13}
          className={clsx("shrink-0 text-gray-400 transition-transform", open ? "rotate-0" : "-rotate-90")}
        />
      </button>
      {open && (
        <div className={clsx("ml-2.5 mt-0.5 flex flex-col border-l pl-2", colorful ? "gap-1" : "gap-px", t.rail)}>
          {links.map((link) => (
            <NavLinkRow key={link.href} link={link} pathname={pathname} colorful={colorful} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavSubGroup({ group, pathname, depth = 0 }: { group: NavMenuGroup; pathname: string; depth?: number }) {
  const hasActive = group.items.some((item) => menuItemHasActive(pathname, item));
  const [open, setOpen] = useState(hasActive);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-gray-700 hover:bg-emerald-50",
          depth === 0 ? "text-[13px] font-semibold" : "text-[12.5px] font-medium"
        )}
      >
        <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", depth === 0 ? "bg-emerald-500" : "bg-violet-400")} />
        <span className="flex-1 truncate">{group.label}</span>
        {hasActive && !open && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
        <ChevronDown
          size={12}
          className={clsx("shrink-0 text-gray-400 transition-transform", open ? "rotate-0" : "-rotate-90")}
        />
      </button>
      {open && (
        <div className="ml-2 mt-0.5 flex flex-col gap-1 border-l border-emerald-100 pl-2">
          {group.items.map((item) =>
            isNavLink(item) ? (
              <NavLinkRow key={item.href} link={item} pathname={pathname} colorful />
            ) : (
              <NavSubGroup key={item.label} group={item} pathname={pathname} depth={depth + 1} />
            )
          )}
        </div>
      )}
    </div>
  );
}

function ReportNavGroup({ groups, pathname }: { groups: NavMenuGroup[]; pathname: string }) {
  const hasActive = groups.some((group) => menuItemHasActive(pathname, group));
  const [open, setOpen] = useState(hasActive);

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  if (groups.length === 0) return null;
  const tone = TONES.green;

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-100"
      >
        <span className={clsx("h-3.5 w-1 shrink-0 rounded-full", tone.bar)} />
        <p className={clsx("flex-1 text-[11px] font-semibold uppercase tracking-[0.12em]", tone.title)}>รีพอร์ต</p>
        {hasActive && !open && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", tone.bar)} />}
        <ChevronDown
          size={13}
          className={clsx("shrink-0 text-gray-400 transition-transform", open ? "rotate-0" : "-rotate-90")}
        />
      </button>
      {open && (
        <div className={clsx("ml-2.5 mt-0.5 flex flex-col gap-1 border-l pl-2", tone.rail)}>
          {groups.map((group) => (
            <NavSubGroup key={group.label} group={group} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Nav({
  role,
  name,
  isOwner,
  permissions,
}: {
  role: string;
  name: string;
  isOwner?: boolean;
  permissions: PermissionMap;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const canView = (l: NavLink) => role === "SUPER_ADMIN" || permissions[l.section]?.canView;
  const finance = financeLinks.filter(canView);
  const accounting = accountingLinks.filter(canView);
  const other: (NavLink & { badge?: boolean })[] = otherLinks.filter(canView);
  const catering = cateringLinks.filter(canView);
  const reports = reportMenuGroups.flatMap((group) => {
    const items = filterMenuItems(group.items, canView);
    return items.length > 0 ? [{ ...group, items }] : [];
  });
  // จัดการผู้ใช้งาน/สิทธิ์ตำแหน่ง — ล็อกไว้ที่ SUPER_ADMIN เท่านั้นเสมอ ไม่อยู่ในตาราง RolePermission
  // (กันไม่ให้ตั้งค่าสิทธิ์เผลอถอดสิทธิ์ตัวเองออกจากหน้าที่ใช้ตั้งค่าสิทธิ์)
  if (role === "SUPER_ADMIN") {
    other.push(
      { href: "/staff", label: "จัดการผู้ใช้งาน", icon: Users, color: "bg-fuchsia-100 text-fuchsia-500", section: "SETTINGS" },
      { href: "/permissions", label: "จัดการสิทธิ์ตำแหน่ง", icon: ShieldCheck, color: "bg-emerald-100 text-emerald-600", section: "SETTINGS" },
      { href: "/activity-log", label: "ประวัติการทำงาน (Log)", icon: History, color: "bg-slate-100 text-slate-600", section: "SETTINGS" }
    );
  }
  // เห็นได้เฉพาะบัญชีที่ถูกกำหนดให้เป็น owner เท่านั้น — ไม่ผูกกับสิทธิ์ role ปกติ คนอื่นแม้เป็น Super Admin ก็ไม่เห็น
  // ใส่ไว้บนสุดของ "การเงิน" ให้เห็นง่าย ไม่ต้องเลื่อนหาล่างสุด
  if (isOwner) {
    finance.unshift({ href: "/company-status", label: "สถานะการเงินบริษัท", icon: Lock, color: "bg-purple-100 text-purple-600", section: "DASHBOARD" });
  }

  // ปิดเมนูอัตโนมัติเมื่อเปลี่ยนหน้า (มือถือ)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const navBody = (
    <>
      <div className="mb-5 flex items-center gap-2.5 px-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-[15px] font-bold text-white">฿</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-gray-900">Lamunn Finance</p>
          <p className="truncate text-[11px] text-gray-500">
            {name} · {roleLabel[role] ?? role}
          </p>
        </div>
      </div>
      <AppSwitcher current="finance" />
      <nav className="flex flex-1 flex-col">
        <NavGroup title="การเงิน" tone="blue" links={finance} pathname={pathname} />
        <NavGroup title="บัญชี" tone="amber" links={accounting} pathname={pathname} />
        <ReportNavGroup groups={reports} pathname={pathname} />
        <NavGroup title="Catering" tone="violet" links={catering} pathname={pathname} />
        <NavGroup title="อื่นๆ" tone="slate" links={other} pathname={pathname} />
      </nav>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="mt-4 flex items-center gap-2.5 rounded-lg border-t border-gray-200 px-2.5 pb-1 pt-4 text-left text-[13px] font-medium text-gray-500 hover:text-gray-900"
      >
        <LogOut size={15} strokeWidth={2} className="text-gray-400" />
        ออกจากระบบ
      </button>
    </>
  );

  return (
    <>
      {/* มือถือ: แถบบนสุด + ปุ่มเมนู */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
            {name.slice(0, 1) || "?"}
          </div>
          <p className="text-sm font-semibold text-gray-800">{name}</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* มือถือ: overlay + drawer เลื่อนเข้า */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white px-4 py-6 shadow-xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="ปิดเมนู"
              className="mb-4 flex h-8 w-8 items-center justify-center self-end rounded-lg text-gray-400 hover:bg-gray-50"
            >
              <X size={18} />
            </button>
            {navBody}
          </aside>
        </div>
      )}

      {/* จอใหญ่: sidebar ปกติ ติดข้าง ๆ ตลอด */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white px-3 py-5 md:flex">{navBody}</aside>
    </>
  );
}
