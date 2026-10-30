"use client";

import { useState } from "react";
import { formatBaht } from "@/lib/format";
import { CHART_COLORS } from "@/components/charts/DonutChart";

interface BranchRankRow {
  branchId: string;
  branchName: string;
  isActive: boolean;
  storefront: number;
  grab: number;
  lineman: number;
  shopee: number;
}

type ViewMode = "ALL" | "STOREFRONT" | "DELIVERY";

const MODE_LABEL: Record<ViewMode, string> = {
  ALL: "ทั้งหมด",
  STOREFRONT: "หน้าร้านเท่านั้น",
  DELIVERY: "Delivery เท่านั้น",
};

export default function BranchRankingChart({ rows }: { rows: BranchRankRow[] }) {
  const [mode, setMode] = useState<ViewMode>("ALL");

  const valueOf = (r: BranchRankRow) =>
    mode === "STOREFRONT" ? r.storefront : mode === "DELIVERY" ? r.grab + r.lineman + r.shopee : r.storefront + r.grab + r.lineman + r.shopee;
  const hasShopee = rows.some((r) => r.shopee !== 0);

  const sorted = [...rows].sort((a, b) => valueOf(b) - valueOf(a));
  const maxTotal = Math.max(...sorted.map(valueOf), 1);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {mode !== "DELIVERY" && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.blue }} />
              หน้าร้าน (Storefront)
            </span>
          )}
          {mode !== "STOREFRONT" && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.green }} />
              Grab
            </span>
          )}
          {mode !== "STOREFRONT" && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.magenta }} />
              Lineman
            </span>
          )}
          {mode !== "STOREFRONT" && hasShopee && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.orange }} />
              Shopee
            </span>
          )}
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs">
          {(["ALL", "STOREFRONT", "DELIVERY"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                mode === m ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map((r, i) => {
          const total = valueOf(r);
          const storefrontPct = mode === "DELIVERY" ? 0 : (r.storefront / maxTotal) * 100;
          const grabPct = mode === "STOREFRONT" ? 0 : (r.grab / maxTotal) * 100;
          const linemanPct = mode === "STOREFRONT" ? 0 : (r.lineman / maxTotal) * 100;
          const shopeePct = mode === "STOREFRONT" ? 0 : (r.shopee / maxTotal) * 100;
          return (
            <div key={r.branchId} className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-right text-xs font-semibold text-gray-400">{i + 1}</span>
              <span className="w-40 shrink-0 truncate text-sm text-gray-700">
                {r.branchName}
                {!r.isActive && <span className="ml-1 text-[10px] text-gray-400">(ปิด)</span>}
              </span>
              <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-gray-100">
                {storefrontPct > 0 && (
                  <div
                    style={{ width: `${storefrontPct}%`, backgroundColor: CHART_COLORS.blue }}
                    title={`หน้าร้าน: ${formatBaht(r.storefront)}`}
                  />
                )}
                {grabPct > 0 && (
                  <div
                    style={{ width: `${grabPct}%`, backgroundColor: CHART_COLORS.green }}
                    title={`Grab: ${formatBaht(r.grab)}`}
                  />
                )}
                {linemanPct > 0 && (
                  <div
                    style={{ width: `${linemanPct}%`, backgroundColor: CHART_COLORS.magenta }}
                    title={`Lineman: ${formatBaht(r.lineman)}`}
                  />
                )}
                {shopeePct > 0 && (
                  <div
                    style={{ width: `${shopeePct}%`, backgroundColor: CHART_COLORS.orange }}
                    title={`Shopee: ${formatBaht(r.shopee)}`}
                  />
                )}
              </div>
              <span className="w-24 shrink-0 text-right text-sm font-semibold text-gray-800">{formatBaht(total)}</span>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-sm text-gray-400">ยังไม่มีข้อมูล</p>}
      </div>
    </div>
  );
}
