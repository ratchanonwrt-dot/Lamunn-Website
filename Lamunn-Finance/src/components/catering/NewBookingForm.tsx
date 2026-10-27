"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DateSelect from "./DateSelect";
import TimeSelect from "./TimeSelect";

const SOURCE_OPTIONS = [
  { value: "", label: "ไม่ระบุ" },
  { value: "LINE", label: "Line" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "PHONE", label: "โทรศัพท์" },
  { value: "REFERRAL", label: "คนแนะนำ/บอกต่อ" },
  { value: "WALK_IN", label: "เดินเข้ามาเอง" },
  { value: "GOOGLE", label: "Google" },
  { value: "OTHER", label: "อื่นๆ" },
];

const PAYMENT_OPTIONS = [
  { value: "UNPAID", label: "จอง (ยังไม่จ่าย)" },
  { value: "DEPOSIT_PAID", label: "มัดจำแล้ว" },
  { value: "FULLY_PAID", label: "จ่ายเต็มแล้ว" },
];

const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10";

/** ฟอร์มลงงานหลังลูกค้าทักมา — พนักงานกรอกเองทั้งหมดในหน้าเดียว
 * เลือกวันแล้วบอกทันทีว่าวันนั้นมีงานอยู่แล้วกี่งาน รับเพิ่มได้ไหม (อิงค่า "รับได้สูงสุดต่อวัน" ในหน้าปฏิทิน) */
export default function NewBookingForm({ initialDate = "" }: { initialDate?: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [source, setSource] = useState("");
  const [foundExisting, setFoundExisting] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const [eventDate, setEventDate] = useState(initialDate);
  const [eventEndDate, setEventEndDate] = useState("");
  const [multiDay, setMultiDay] = useState(false);
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("UNPAID");
  const [depositAmount, setDepositAmount] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");

  const [availability, setAvailability] = useState<{ count: number; capacity: number; names: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // เช็ควันว่างทุกครั้งที่เปลี่ยนวันจัดงาน
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/catering/availability?month=${eventDate.slice(0, 7)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const day = data.days?.[eventDate];
        setAvailability({ count: day?.count ?? 0, capacity: data.capacity, names: day?.names ?? [] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventDate]);

  async function handlePhoneBlur() {
    if (!phone) return;
    setLookingUp(true);
    const res = await fetch(`/api/catering/customers?phone=${encodeURIComponent(phone)}`);
    setLookingUp(false);
    if (!res.ok) return;
    const body = await res.json();
    if (body.customer) {
      setCustomerName(body.customer.name);
      setSource(body.customer.source ?? "");
      setFoundExisting(true);
    } else {
      setFoundExisting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/catering/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        customerName,
        source: source || undefined,
        eventDate,
        eventEndDate: eventEndDate || undefined,
        eventStartTime: eventStartTime || undefined,
        eventEndTime: eventEndTime || undefined,
        location: location || undefined,
        guestCount: guestCount || undefined,
        totalAmount,
        paymentStatus,
        depositAmount: paymentStatus === "UNPAID" ? undefined : depositAmount || undefined,
        paymentDueDate: paymentDueDate || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    const body = await res.json();
    router.push(`/catering/bookings/${body.booking.id}`);
    router.refresh();
  }

  const full = availability && availability.count >= availability.capacity;

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-sm text-white">1</span>ลูกค้า</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">ชื่อลูกค้า</label>
            <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">ข้อมูลติดต่อ (เบอร์โทร / LINE ID)</label>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={handlePhoneBlur} className={inputCls} />
            {lookingUp && <p className="mt-1 text-sm text-gray-600">กำลังค้นหา...</p>}
            {foundExisting && <p className="mt-1 text-sm font-medium text-emerald-700">พบลูกค้าเดิม — เติมข้อมูลให้แล้ว</p>}
          </div>
          <div className="sm:col-span-3">
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">ลูกค้าติดต่อมาทาง</label>
            <div className="flex flex-wrap gap-1.5">
              {SOURCE_OPTIONS.filter((o) => o.value).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSource(source === o.value ? "" : o.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${source === o.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-sm text-white">2</span>งาน</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">วันที่จัดงาน</label>
            <DateSelect required value={eventDate} onChange={setEventDate} />
            {availability && (
              <p className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${full ? "bg-red-600 text-white" : availability.count > 0 ? "bg-amber-400 text-amber-950" : "bg-emerald-600 text-white"}`}>
                {availability.count === 0
                  ? `ว่าง — รับได้ ${availability.capacity} งานต่อวัน`
                  : full
                    ? `เต็มแล้ว — มี ${availability.count} งาน (${availability.names.join(", ")})`
                    : `มีแล้ว ${availability.count} งาน (${availability.names.join(", ")}) — รับเพิ่มได้อีก ${availability.capacity - availability.count}`}
              </p>
            )}
          </div>
          <div>
            {/* งานส่วนใหญ่จัดวันเดียว — ซ่อนช่อง "ถึงวันที่" ไว้หลังปุ่ม ให้ฟอร์มสั้นลงสำหรับเคสปกติ */}
            {multiDay ? (
              <>
                <label className="mb-1 flex items-center justify-between text-sm font-semibold text-gray-800">
                  ถึงวันที่
                  <button type="button" onClick={() => { setMultiDay(false); setEventEndDate(""); }} className="text-xs font-medium text-gray-500 hover:text-gray-900">
                    จัดวันเดียว
                  </button>
                </label>
                <DateSelect value={eventEndDate} onChange={setEventEndDate} />
              </>
            ) : (
              <button type="button" onClick={() => setMultiDay(true)} className="mt-6 w-full rounded-lg border-2 border-dashed border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-900 hover:text-gray-900">
                + จัดหลายวัน
              </button>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">จำนวนเสิร์ฟ</label>
            <input type="number" min="0" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">เวลาเริ่ม</label>
            <TimeSelect value={eventStartTime} onChange={setEventStartTime} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">เวลาสิ้นสุด</label>
            <TimeSelect value={eventEndTime} onChange={setEventEndTime} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">สถานที่จัดงาน</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-sm text-white">3</span>การชำระเงิน</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">สถานะ</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map((o) => {
                const on = paymentStatus === o.value;
                const color = o.value === "FULLY_PAID" ? "emerald" : o.value === "DEPOSIT_PAID" ? "sky" : "amber";
                const active = { amber: "border-amber-400 bg-amber-400 text-amber-950", sky: "border-sky-600 bg-sky-600 text-white", emerald: "border-emerald-600 bg-emerald-600 text-white" }[color];
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPaymentStatus(o.value)}
                    className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${on ? active : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-800">ยอดรวม (บาท)</label>
            <input required type="number" step="0.01" min="0" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className={inputCls} />
          </div>
          {paymentStatus === "DEPOSIT_PAID" && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-800">ยอดมัดจำที่ได้รับ (บาท)</label>
              <input type="number" step="0.01" min="0" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className={inputCls} />
            </div>
          )}
          {paymentStatus !== "FULLY_PAID" && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-800">ครบกำหนดจ่ายวันที่</label>
              <DateSelect value={paymentDueDate} onChange={setPaymentDueDate} />
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-gray-900 px-8 py-3.5 text-base font-bold text-white hover:bg-gray-700 disabled:opacity-50 sm:w-auto sm:self-end"
      >
        {saving ? "กำลังบันทึก..." : full ? "บันทึก (วันนี้เต็มแล้ว)" : "บันทึกงาน"}
      </button>
    </form>
  );
}
