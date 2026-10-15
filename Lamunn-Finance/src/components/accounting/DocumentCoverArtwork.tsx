import { thaiMonthLabel } from "@/lib/format";

export default function DocumentCoverArtwork({
  companyName,
  documentLabel,
  documentEnglish,
  year,
  month,
  preview = false,
}: {
  companyName: string;
  documentLabel: string;
  documentEnglish: string;
  year: number;
  month: number;
  preview?: boolean;
}) {
  return (
    <article
      className={`relative overflow-hidden bg-[#fdfdfb] text-slate-900 ${
        preview ? "aspect-[210/297] w-full rounded-sm shadow-[0_18px_55px_rgba(15,23,42,0.16)]" : "h-[277mm] w-full"
      }`}
    >
      <div className="absolute inset-0 border-[1.5px] border-[#183a37]" />
      <div className="absolute inset-[7px] border border-[#c5a86a]/70" />
      <div className="absolute left-0 top-0 h-[26%] w-2 bg-[#183a37]" />
      <div className="absolute right-0 top-0 h-24 w-24 translate-x-12 -translate-y-12 rotate-45 border border-[#c5a86a]/60" />
      <div className="absolute bottom-0 right-0 h-[30%] w-2 bg-[#c5a86a]" />

      <div className={`relative flex h-full flex-col ${preview ? "px-[9%] py-[10%]" : "px-[18mm] py-[20mm]"}`}>
        <header className="flex items-start justify-between gap-5">
          <div>
            <p className={`${preview ? "text-[8px]" : "text-[9pt]"} font-semibold uppercase tracking-[0.28em] text-[#183a37]`}>
              Lamunn Finance
            </p>
            <p className={`${preview ? "mt-1 text-[6px]" : "mt-1 text-[7.5pt]"} uppercase tracking-[0.18em] text-slate-400`}>
              Accounting Document
            </p>
          </div>
          <div className={`${preview ? "h-8 w-8 text-xs" : "h-11 w-11 text-base"} flex items-center justify-center rounded-full border border-[#c5a86a] font-bold text-[#183a37]`}>
            L
          </div>
        </header>

        <section className={`flex flex-1 flex-col justify-center ${preview ? "pb-[7%]" : "pb-[18mm]"}`}>
          <p className={`${preview ? "text-[9px]" : "text-[11pt]"} break-words font-medium tracking-wide text-slate-500`}>
            {companyName || "ชื่อบริษัท"}
          </p>
          <div className={`${preview ? "my-4 w-12" : "my-7 w-20"} h-px bg-[#c5a86a]`} />
          <h1 className={`${preview ? "max-w-[90%] text-[22px] leading-tight" : "max-w-[155mm] text-[32pt] leading-[1.2]"} font-bold tracking-tight text-[#183a37]`}>
            {documentLabel}
          </h1>
          <p className={`${preview ? "mt-2 text-[7px]" : "mt-3 text-[10pt]"} font-medium uppercase tracking-[0.2em] text-slate-400`}>
            {documentEnglish}
          </p>
          <p className={`${preview ? "mt-8 text-[12px]" : "mt-12 text-[17pt]"} font-semibold text-slate-700`}>
            ประจำเดือน {thaiMonthLabel(year, month - 1)}
          </p>
        </section>

        <footer className="grid grid-cols-2 gap-6 border-t border-slate-200 pt-5 text-slate-500">
          <div>
            <p className={`${preview ? "text-[6px]" : "text-[7pt]"} uppercase tracking-[0.18em] text-slate-400`}>Document Period</p>
            <p className={`${preview ? "mt-1 text-[8px]" : "mt-1 text-[9pt]"} font-medium text-slate-700`}>{thaiMonthLabel(year, month - 1)}</p>
          </div>
          <div className="text-right">
            <p className={`${preview ? "text-[6px]" : "text-[7pt]"} uppercase tracking-[0.18em] text-slate-400`}>Document Control</p>
            <p className={`${preview ? "mt-1 text-[8px]" : "mt-1 text-[9pt]"} font-medium text-slate-700`}>ฝ่ายบัญชีและการเงิน</p>
          </div>
        </footer>
      </div>
    </article>
  );
}
