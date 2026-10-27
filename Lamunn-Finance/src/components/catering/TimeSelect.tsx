"use client";

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let min = 0; min < 60; min += 10) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
}

// แทน <input type="time"> เพราะบางเบราว์เซอร์/OS โชว์เป็น AM/PM ตาม locale เครื่อง คุมให้เป็น
// 24 ชม. ทุกเครื่องไม่ได้ — ใช้ dropdown ตายตัว 00:00–23:50 ทีละ 10 นาทีแทน
export default function TimeSelect({
  value,
  onChange,
  required,
}: {
  value: string; // "HH:mm" หรือ ""
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
    >
      <option value="">เวลา</option>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
