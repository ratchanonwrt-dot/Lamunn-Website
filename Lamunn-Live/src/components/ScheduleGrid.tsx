"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TimeSelect from "@/components/TimeSelect";
import clsx from "clsx";
import { Plus, X } from "lucide-react";
import { DAY_START_MIN, DAY_END_MIN, GRID_END_MIN, PREFERRED_START_MIN, minutesToLabel, streamerColor } from "@/lib/schedule";
import { formatBaht, formatHours, timeToMinutes } from "@/lib/format";

export interface GridShift {
  id: string;
  streamerId: string;
  streamerName: string;
  channelName: string | null;
  startTime: string;
  endTime: string;
  s: number; // นาที
  e: number; // นาที (อาจเกิน 1440)
  hours: number;
  sales: number;
  hasResults: boolean;
  pay: number; // ยอดที่จ่ายจริง (หลังขั้นต่ำ / ยอดที่แอดมินกำหนดเอง)
  effectivePct: number | null; // จ่ายจริงคิดเป็นกี่ % ของยอดหลังหักค่าส่ง (null = ยอดขายเป็นศูนย์)
  hitMinimum: boolean;
  payOverridden: boolean;
}

/** % คอมจริง ทศนิยม 1 ตำแหน่ง — ยอดขายเป็นศูนย์คิด % ไม่ได้ */
function pctLabel(v: number | null): string {
  return v === null ? "–%" : `${v.toFixed(1)}%`;
}

export interface GridRequest {
  id: string;
  requesterName: string;
  channelName: string | null;
  startTime: string;
  endTime: string;
  s: number;
  e: number;
}

export interface GridBlock {
  id: string;
  label: string;
  note: string | null;
  channelName: string | null; // null = ทุกช่องทาง
  startTime: string;
  endTime: string;
  s: number;
  e: number;
}

export interface GridDay {
  date: string; // YYYY-MM-DD
  requests: GridRequest[]; // คำขอจากเว็บจองที่รออนุมัติ
  blocks: GridBlock[]; // บล็อกเวลา unavailable
  dayLabel: string; // "จ 8 ก.ย."
  isToday: boolean;
  isPast: boolean;
  shifts: GridShift[];
  free: { s: number; e: number }[];
}

interface Option {
  id: string;
  name: string;
}

const HOUR_PX = 34;
/** จัดช่วงที่ทับกันให้วางเคียงกัน: คืน lane ของแต่ละช่วง และจำนวน lane ของกลุ่มที่มันอยู่ */
function laneLayout<T extends { s: number; e: number }>(items: T[]): { item: T; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out: { item: T; lane: number; lanes: number }[] = [];
  let group: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const flush = () => {
    for (const g of group) g.lanes = laneEnds.length;
    out.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const it of sorted) {
    if (it.s >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((end) => end <= it.s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.e);
    } else laneEnds[lane] = it.e;
    group.push({ item: it, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, it.e);
  }
  if (group.length) flush();
  return out;
}

const HOURS = Array.from({ length: (GRID_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => DAY_START_MIN + i * 60);
const COL_HEIGHT = ((GRID_END_MIN - DAY_START_MIN) / 60) * HOUR_PX;
const inputCls = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-ink/10";
/** ตัวเลือกจำนวนชั่วโมง — กดทีเดียวแทนการเลื่อนหาเวลาจบ */
const HOUR_CHOICES = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/** เวลาจบ = เริ่ม + ชั่วโมง — ข้ามเที่ยงคืนได้ (เช่น 22:00 + 3 ชม. = 01:00) และยังนับเป็นกะของวันเดิม */
function endFromStart(startTime: string, hours: number): { endTime: string; hours: number; crossesMidnight: boolean } {
  const s = timeToMinutes(startTime);
  if (s === null || !(hours > 0)) return { endTime: "", hours: 0, crossesMidnight: false };
  const e = s + Math.round(hours * 60);
  return { endTime: minutesToLabel(e), hours: (e - s) / 60, crossesMidnight: e > DAY_END_MIN };
}

interface FormState {
  id: string | null;
  kind: "shift" | "block"; // ลงกะ หรือ บล็อกเวลา unavailable
  date: string;
  streamerId: string;
  channelId: string;
  startTime: string;
  hours: string; // จำนวนชั่วโมง (ข้อความจากช่องกรอก)
  note: string;
}

export default function ScheduleGrid({
  days,
  streamers,
  channels,
  colors,
}: {
  days: GridDay[];
  streamers: Option[];
  channels: Option[];
  colors: Record<string, string>; // streamerId -> ชื่อสี (palette key)
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew(date: string, startMin?: number) {
    const day = days.find((d) => d.date === date);
    // เริ่มที่จุดที่คลิก (ปัดเป็น 30 นาที) หรือช่องว่างที่ครอบ 10:00 / ช่องว่างถัดไป / ช่องว่างแรกของวัน
    let s = startMin !== undefined ? Math.floor(startMin / 30) * 30 : PREFERRED_START_MIN;
    const gap =
      day?.free.find((f) => s >= f.s && s < f.e) ??
      day?.free.find((f) => f.s >= s) ??
      day?.free[0];
    if (gap && (startMin === undefined || s < gap.s || s >= gap.e)) s = Math.max(gap.s, startMin === undefined ? Math.min(PREFERRED_START_MIN, gap.e - 60) : gap.s);
    // ค่าเริ่มต้น 3 ชม. แต่ไม่เกินช่องว่างที่เหลือ
    const maxHours = gap && gap.e < GRID_END_MIN ? (gap.e - s) / 60 : 24; // ช่องว่างท้ายตารางไม่จำกัด เพราะข้ามเที่ยงคืนได้
    const hours = Math.max(0.5, Math.min(3, maxHours));
    setError(null);
    setForm({
      id: null,
      kind: "shift",
      date,
      streamerId: streamers[0]?.id ?? "",
      channelId: channels[0]?.id ?? "",
      startTime: minutesToLabel(s),
      hours: String(hours),
      note: "",
    });
  }

  async function removeBlock(b: GridBlock) {
    if (!confirm(`ลบบล็อก "${b.label}" ${b.startTime}–${b.endTime}?`)) return;
    const res = await fetch(`/api/blocks/${b.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("ลบไม่สำเร็จ (ต้องเป็นผู้จัดการขึ้นไป)");
      return;
    }
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const { endTime } = endFromStart(form.startTime, Number(form.hours));
    if (!endTime) {
      setError("กรุณาเลือกเวลาเริ่มและจำนวนชั่วโมง");
      return;
    }
    setSaving(true);
    setError(null);
    if (form.kind === "block") {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.date, channelId: form.channelId || null, startTime: form.startTime, endTime, label: "unavailable", note: form.note }),
      });
      setSaving(false);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setForm(null);
      router.refresh();
      return;
    }
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: form.date, streamerId: form.streamerId, channelId: form.channelId || null, startTime: form.startTime, endTime, note: form.note }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    const body = await res.json();
    // ลงกะเสร็จ -> ไปหน้ากะทันที เพื่อกรอกคนดู/ยอดขายต่อได้เลย
    router.push(`/shifts/${body.shift.id}`);
    router.refresh();
  }

  const derived = form ? endFromStart(form.startTime, Number(form.hours)) : null;

  function onColumnClick(ev: React.MouseEvent<HTMLDivElement>, day: GridDay) {
    if ((ev.target as HTMLElement).closest("[data-shift]")) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const minutes = DAY_START_MIN + ((ev.clientY - rect.top) / HOUR_PX) * 60;
    openNew(day.date, Math.max(DAY_START_MIN, Math.min(GRID_END_MIN - 30, minutes)));
  }

  return (
    <div>
      {streamers.length === 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">ยังไม่มีรายชื่อคนไลฟ์ — เพิ่มที่เมนู &quot;คนไลฟ์&quot; ก่อนจึงจะลงตารางได้</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
        <div className="min-w-[900px]">
          {/* หัวตาราง */}
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
            <div />
            {days.map((d) => (
              <div key={d.date} className={clsx("border-l border-line/60 px-2 py-2 text-center", d.isToday && "bg-brand-50")}>
                <p className={clsx("text-sm font-semibold", d.isToday ? "text-brand-700" : "text-ink/80")}>{d.dayLabel}</p>
                <p className="text-[11px] text-stone-400">
                  {d.shifts.length ? `${d.shifts.length} กะ · ${formatHours(d.shifts.reduce((a, s) => a + s.hours, 0))}` : "ยังไม่ลงใคร"}
                </p>
              </div>
            ))}
          </div>

          {/* ตัวตาราง */}
          <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
            {/* แกนเวลา */}
            <div className="relative" style={{ height: COL_HEIGHT }}>
              {HOURS.map((h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-stone-400" style={{ top: ((h - DAY_START_MIN) / 60) * HOUR_PX }}>
                  {minutesToLabel(h)}
                </span>
              ))}
            </div>
            {days.map((d) => (
              <div
                key={d.date}
                onClick={(ev) => streamers.length > 0 && onColumnClick(ev, d)}
                className={clsx("relative cursor-pointer border-l border-line/60", d.isToday && "bg-brand-50/40", d.isPast && "bg-paper/60")}
                style={{ height: COL_HEIGHT }}
                title="คลิกช่องว่างเพื่อลงกะ"
              >
                {HOURS.slice(1).map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-dashed border-line/60" style={{ top: ((h - DAY_START_MIN) / 60) * HOUR_PX }} />
                ))}
                {d.blocks.map((b) => {
                  const top = ((Math.max(b.s, DAY_START_MIN) - DAY_START_MIN) / 60) * HOUR_PX;
                  const bottom = ((Math.min(b.e, GRID_END_MIN) - DAY_START_MIN) / 60) * HOUR_PX;
                  return (
                    <button
                      key={b.id}
                      data-shift
                      type="button"
                      onClick={() => removeBlock(b)}
                      className="absolute inset-x-1 overflow-hidden rounded-lg border-2 border-gray-900 bg-gray-900 px-1.5 py-1 text-left text-[11px] leading-tight text-white shadow-sm hover:bg-black"
                      style={{ top: top + 1, height: Math.max(bottom - top - 2, 18) }}
                      title={`บล็อกเวลา ${b.startTime}–${b.endTime}${b.channelName ? ` · ${b.channelName}` : " · ทุกช่องทาง"}${b.note ? ` · ${b.note}` : ""} — คลิกเพื่อลบ`}
                    >
                      <p className="truncate text-[12px] font-bold uppercase tracking-wide">{b.label}</p>
                      <p className="truncate opacity-80">
                        {b.startTime}–{b.endTime}
                        {b.channelName ? ` · ${b.channelName}` : ""}
                      </p>
                    </button>
                  );
                })}
                {laneLayout(d.requests).map(({ item: q, lane, lanes }) => {
                  const top = ((Math.max(q.s, DAY_START_MIN) - DAY_START_MIN) / 60) * HOUR_PX;
                  const bottom = ((Math.min(q.e, GRID_END_MIN) - DAY_START_MIN) / 60) * HOUR_PX;
                  // คำขอที่ทับกันวางเคียงกันเป็นคอลัมน์ย่อย ให้แอดมินเห็นครบทุกคนแล้วเลือกเอง
                  return (
                    <a
                      key={q.id}
                      data-shift
                      href="/requests"
                      className={clsx("absolute overflow-hidden rounded-lg border-2 border-dashed px-1.5 py-1 text-[11px] leading-tight", lanes > 1 ? "border-orange-500 bg-orange-100 text-orange-900" : "border-orange-400 bg-orange-50 text-orange-800")}
                      style={{ top: top + 1, height: Math.max(bottom - top - 2, 18), left: `calc(4px + (100% - 8px) * ${lane} / ${lanes})`, width: `calc((100% - 8px) / ${lanes} - 2px)` }}
                      title={`คำขอจากเว็บจอง: ${q.requesterName} ${q.startTime}–${q.endTime} — รออนุมัติ${lanes > 1 ? " (มีคนขอช่วงเดียวกัน — เลือกได้คนเดียว)" : ""}`}
                    >
                      <p className="truncate font-semibold">{lanes > 1 ? "" : "คำขอ: "}{q.requesterName}</p>
                      <p className="truncate opacity-80">
                        {q.startTime}–{q.endTime} · รออนุมัติ
                      </p>
                    </a>
                  );
                })}
                {d.shifts.map((s) => {
                  const top = (Math.max(s.s, DAY_START_MIN) - DAY_START_MIN) / 60 * HOUR_PX;
                  const bottom = (Math.min(s.e, GRID_END_MIN) - DAY_START_MIN) / 60 * HOUR_PX;
                  const spills = s.e > GRID_END_MIN || s.s < DAY_START_MIN;
                  return (
                    <a
                      key={s.id}
                      data-shift
                      href={`/shifts/${s.id}`}
                      className={clsx(
                        "absolute inset-x-1 overflow-hidden rounded-lg border-2 px-1.5 py-1 text-[11px] leading-tight shadow-sm transition hover:shadow-md",
                        streamerColor(colors[s.streamerId])
                      )}
                      style={{ top: top + 1, height: Math.max(bottom - top - 2, 18) }}
                      title={`${s.streamerName} ${s.startTime}–${s.endTime}${s.channelName ? ` · ${s.channelName}` : ""}${
                        s.hasResults
                          ? ` · ขาย ${formatBaht(s.sales)} ฿ · จ่ายจริง ${formatBaht(s.pay)} ฿ = ${pctLabel(s.effectivePct)} ของยอดหลังหักค่าส่ง${s.payOverridden ? " (แอดมินกำหนดยอดเอง)" : s.hitMinimum ? " (จ่ายขั้นต่ำรายชั่วโมง)" : ""}`
                          : " · ยังไม่กรอกยอด"
                      }`}
                    >
                      <p className="truncate text-[13px] font-bold leading-tight">{s.streamerName}</p>
                      <p className="truncate text-[11px] opacity-80">
                        {s.startTime}–{s.endTime}
                        {spills && " ↗"}
                        {/* กะสั้นมีที่แค่สองบรรทัด — ต่อ % คอมจริงท้ายเวลาให้เห็นทุกกะที่กรอกยอดแล้ว */}
                        {s.hasResults && bottom - top <= 44 && <span className="font-semibold"> · {pctLabel(s.effectivePct)}</span>}
                      </p>
                      {bottom - top > 44 && (
                        s.hasResults ? (
                          <p className="truncate text-[12px] font-bold">คอมจริง {pctLabel(s.effectivePct)}</p>
                        ) : (
                          <p className="truncate opacity-70">{s.channelName ?? ""}</p>
                        )
                      )}
                      {s.hasResults && bottom - top > 62 && (
                        <p className="truncate opacity-75">
                          จ่าย {formatBaht(s.pay)} ฿{s.payOverridden ? " (กำหนดเอง)" : s.hitMinimum ? " (ขั้นต่ำ)" : ""}
                        </p>
                      )}
                      {s.hasResults && bottom - top > 78 && <p className="truncate opacity-60">ขาย {formatBaht(s.sales)} ฿</p>}
                    </a>
                  );
                })}
              </div>
            ))}
          </div>

          {/* ช่วงที่ยังว่าง */}
          <div className="grid border-t border-line bg-paper/60" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
            <div className="px-2 py-2 text-[10px] text-stone-400">ว่าง</div>
            {days.map((d) => (
              <div key={d.date} className="border-l border-line/60 px-2 py-2">
                {d.free.length === 0 ? (
                  <p className="text-[11px] text-emerald-600">เต็มแล้ว</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {d.free.map((f) => (
                      <button
                        key={f.s}
                        onClick={() => streamers.length > 0 && openNew(d.date, f.s)}
                        className="rounded-md border border-dashed border-line bg-white px-1.5 py-0.5 text-[11px] tabular-nums text-muted hover:border-brand-400 hover:text-brand-700"
                      >
                        {minutesToLabel(f.s)}–{minutesToLabel(f.e)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ตำนานสี */}
      {Object.keys(colors).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {streamers
            .filter((s) => colors[s.id] !== undefined)
            .map((s) => (
              <span key={s.id} className={clsx("rounded-md border-2 px-2.5 py-0.5 text-xs font-semibold", streamerColor(colors[s.id]))}>
                {s.name}
              </span>
            ))}
        </div>
      )}

      <button
        onClick={() => streamers.length > 0 && openNew(days.find((d) => d.isToday)?.date ?? days[0].date)}
        disabled={streamers.length === 0}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        <Plus size={16} /> ลงกะใหม่
      </button>

      {/* ฟอร์มลงกะ */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={() => setForm(null)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[15px] font-semibold text-ink">{form.kind === "block" ? "บล็อกเวลา (unavailable)" : "ลงกะไลฟ์"}</h2>
              <button type="button" onClick={() => setForm(null)} className="text-stone-400 hover:text-muted">
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1 text-xs">
              <button type="button" onClick={() => setForm({ ...form, kind: "shift" })} className={clsx("rounded-md px-2 py-1.5 font-medium", form.kind === "shift" ? "bg-white text-ink shadow-sm" : "text-muted")}>
                ลงกะให้คนไลฟ์
              </button>
              <button type="button" onClick={() => setForm({ ...form, kind: "block" })} className={clsx("rounded-md px-2 py-1.5 font-medium", form.kind === "block" ? "bg-gray-900 text-white shadow-sm" : "text-muted")}>
                ⛔ บล็อก unavailable
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted">วันที่</label>
                <select value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls}>
                  {days.map((d) => (
                    <option key={d.date} value={d.date}>
                      {d.dayLabel}
                    </option>
                  ))}
                </select>
              </div>
              <div className={clsx("col-span-2", form.kind === "block" && "hidden")}>
                <label className="mb-1 block text-xs font-medium text-muted">คนไลฟ์</label>
                <select required={form.kind === "shift"} value={form.streamerId} onChange={(e) => setForm({ ...form, streamerId: e.target.value })} className={inputCls}>
                  {streamers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">เวลาเริ่ม</label>
                <TimeSelect value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} required minuteStep={30} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">ไลฟ์กี่ชั่วโมง</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={24}
                  step={0.5}
                  required
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {HOUR_CHOICES.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setForm({ ...form, hours: String(h) })}
                      className={clsx(
                        "rounded-lg border px-2.5 py-1 text-xs tabular-nums",
                        Number(form.hours) === h ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-line text-muted hover:bg-paper"
                      )}
                    >
                      {h} ชม.
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {derived?.endTime ? (
                    <>
                      กะนี้ <span className="font-semibold tabular-nums text-ink">{form.startTime}–{derived.endTime}</span>
                      {derived.crossesMidnight && <span className="text-stone-400"> (ข้ามเที่ยงคืน — ยังนับเป็นกะของวันนี้)</span>}
                    </>
                  ) : (
                    "เลือกเวลาเริ่มและจำนวนชั่วโมง"
                  )}
                </p>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted">ช่องทาง</label>
                <select value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} className={inputCls}>
                  <option value="">{form.kind === "block" ? "ทุกช่องทาง" : "ไม่ระบุ"}</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted">หมายเหตุ</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} placeholder="เช่น โปรพิเศษ, ไลฟ์คู่" />
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className={clsx("rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50", form.kind === "block" ? "bg-gray-900 hover:bg-black" : "bg-brand-600 hover:bg-brand-600")}
              >
                {saving ? "กำลังบันทึก..." : form.kind === "block" ? "บล็อกช่วงนี้" : "ลงกะ"}
              </button>
              <button type="button" onClick={() => setForm(null)} className="rounded-xl border border-line px-5 py-2.5 text-sm text-muted hover:bg-paper">
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
