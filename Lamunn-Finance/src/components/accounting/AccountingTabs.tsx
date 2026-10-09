"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/accounting", label: "ภาพรวมบัญชี", exact: true, color: "blue" },
  { href: "/accounting/trial-balance", label: "งบทดลอง", color: "cyan" },
  { href: "/accounting/income-statement", label: "งบกำไรขาดทุน", color: "emerald" },
  { href: "/accounting/balance-sheet", label: "งบแสดงฐานะการเงิน", color: "teal" },
  { href: "/accounting/journal", label: "สมุดรายวัน", color: "violet" },
  { href: "/accounting/ledger", label: "บัญชีแยกประเภท", color: "purple" },
  { href: "/accounting/bank-reconciliation", label: "กระทบยอดเงินฝากธนาคาร", color: "indigo" },
  { href: "/accounting/daily-posting", label: "ลงบัญชียอดขายรายวัน", color: "orange" },
  { href: "/accounting/tax-invoices", label: "ใบกำกับภาษีเต็มรูป", color: "amber" },
  { href: "/accounting/tax-reports", label: "รายงานภาษี", color: "yellow" },
  { href: "/accounting/accounts", label: "ผังบัญชี", color: "slate" },
];

const TAB_COLORS = {
  blue: ["bg-blue-600 text-white", "text-blue-700 bg-blue-50 hover:bg-blue-100"],
  cyan: ["bg-cyan-600 text-white", "text-cyan-700 bg-cyan-50 hover:bg-cyan-100"],
  emerald: ["bg-emerald-600 text-white", "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"],
  teal: ["bg-teal-600 text-white", "text-teal-700 bg-teal-50 hover:bg-teal-100"],
  violet: ["bg-violet-600 text-white", "text-violet-700 bg-violet-50 hover:bg-violet-100"],
  purple: ["bg-purple-600 text-white", "text-purple-700 bg-purple-50 hover:bg-purple-100"],
  indigo: ["bg-indigo-600 text-white", "text-indigo-700 bg-indigo-50 hover:bg-indigo-100"],
  orange: ["bg-orange-600 text-white", "text-orange-700 bg-orange-50 hover:bg-orange-100"],
  amber: ["bg-amber-500 text-white", "text-amber-700 bg-amber-50 hover:bg-amber-100"],
  yellow: ["bg-yellow-500 text-white", "text-yellow-700 bg-yellow-50 hover:bg-yellow-100"],
  slate: ["bg-slate-600 text-white", "text-slate-700 bg-slate-50 hover:bg-slate-100"],
} as const;

export default function AccountingTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-5 flex flex-wrap gap-1.5 border-b border-gray-200 pb-3">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const [activeColor, inactiveColor] = TAB_COLORS[t.color as keyof typeof TAB_COLORS];
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active ? activeColor : inactiveColor
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
