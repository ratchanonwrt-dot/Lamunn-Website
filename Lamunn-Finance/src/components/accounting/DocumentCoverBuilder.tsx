"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import DocumentCoverArtwork from "./DocumentCoverArtwork";
import { DOCUMENT_COVER_TYPES, documentCoverType, type DocumentCoverType } from "@/lib/accounting/documentCover";

const field = "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const label = "text-sm font-medium text-gray-700";

export default function DocumentCoverBuilder({
  initialCompanyName,
  initialType,
  initialYear,
  initialMonth,
}: {
  initialCompanyName: string;
  initialType: DocumentCoverType;
  initialYear: number;
  initialMonth: number;
}) {
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [coverType, setCoverType] = useState<DocumentCoverType>(initialType);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const selectedType = documentCoverType(coverType);
  const years = useMemo(() => Array.from({ length: 12 }, (_, index) => initialYear + 2 - index), [initialYear]);
  const printUrl = `/print/document-cover?${new URLSearchParams({
    companyName: companyName.trim() || "ชื่อบริษัท",
    type: coverType,
    year: String(year),
    month: String(month),
  }).toString()}`;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(360px,1.18fr)]">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3 border-b border-gray-100 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><FileText size={20} /></span>
          <div>
            <h2 className="font-semibold text-gray-900">รายละเอียดหน้าปก</h2>
            <p className="text-xs text-gray-500">กรอกข้อมูลแล้วตัวอย่างด้านขวาจะเปลี่ยนทันที</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className={label}>
            ชื่อบริษัท
            <input required maxLength={160} value={companyName} onChange={(event) => setCompanyName(event.target.value)} className={field} placeholder="กรอกชื่อบริษัท" />
          </label>
          <label className={label}>
            ประเภทเอกสาร
            <select value={coverType} onChange={(event) => setCoverType(event.target.value as DocumentCoverType)} className={field}>
              {DOCUMENT_COVER_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              เดือน
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className={field}>
                {["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"].map((name, index) => (
                  <option key={name} value={index + 1}>{name}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              ปี
              <select value={year} onChange={(event) => setYear(Number(event.target.value))} className={field}>
                {years.map((item) => <option key={item} value={item}>{item + 543} ({item})</option>)}
              </select>
            </label>
          </div>
        </div>

        <a
          href={printUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#183a37] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#102d2a]"
        >
          เปิดหน้าพิมพ์ / บันทึก PDF <ExternalLink size={15} />
        </a>
        <p className="mt-2 text-center text-xs text-gray-400">หน้าพิมพ์เป็นขนาด A4 แนวตั้ง และไม่แสดงเมนูของระบบ</p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">ตัวอย่างหน้าปก</h2>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-500">A4 แนวตั้ง</span>
        </div>
        <div className="mx-auto max-w-[560px]">
          <DocumentCoverArtwork
            companyName={companyName.trim() || "ชื่อบริษัท"}
            documentLabel={selectedType.label}
            documentEnglish={selectedType.english}
            year={year}
            month={month}
            preview
          />
        </div>
      </section>
    </div>
  );
}
