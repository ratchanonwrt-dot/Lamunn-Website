"use client";

function monthOptions(invoiceDate: string, currentValue: string) {
  const match = /^(\d{4})-(\d{2})/.exec(invoiceDate);
  if (!match) return currentValue ? [{ value: currentValue, label: currentValue }] : [];

  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const values = Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  if (currentValue && !values.includes(currentValue)) values.push(currentValue);
  values.sort();

  return values.map((value) => {
    const [year, month] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    return {
      value,
      label: new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(date),
    };
  });
}

export default function PurchaseTaxClaimPeriodSelect({ invoiceDate, value, onChange, className }: {
  invoiceDate: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select required value={value} onChange={(event) => onChange(event.target.value)} className={className}>
      {monthOptions(invoiceDate, value).map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
