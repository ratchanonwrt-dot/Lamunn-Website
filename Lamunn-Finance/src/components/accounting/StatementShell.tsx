"use client";

import Link from "next/link";
import { Printer } from "lucide-react";

/** กรอบมาตรฐานของงบการเงินทุกใบ — หัวงบ (ชื่อบริษัท / ชื่องบ / งวด) + ปุ่มพิมพ์
 * จัดหัวไว้ตรงกลางตามรูปแบบงบที่ยื่นกรมพัฒน์ เพื่อให้พิมพ์ออกมาแล้วใช้ได้เลย */
export default function StatementShell({
  companyName,
  title,
  subtitle,
  printHref,
  children,
}: {
  companyName: string;
  title: string;
  subtitle: string;
  printHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 print:border-0">
        <div className="flex-1 text-center">
          <p className="text-base font-bold text-gray-900">{companyName || "บริษัท (ยังไม่ได้ตั้งชื่อในหน้าตั้งค่าระบบ)"}</p>
          <p className="text-sm font-semibold text-gray-700">{title}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        {printHref ? (
          <Link
            href={printHref}
            target="_blank"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 print:hidden"
          >
            <Printer size={14} /> พิมพ์ / บันทึก PDF
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => window.print()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 print:hidden"
          >
            <Printer size={14} /> พิมพ์
          </button>
        )}
      </div>
      <div className="overflow-x-auto px-5 py-4">{children}</div>
    </div>
  );
}
