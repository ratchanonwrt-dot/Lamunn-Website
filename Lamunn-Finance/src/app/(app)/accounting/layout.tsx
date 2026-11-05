export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  // ช่องวันที่ของเบราว์เซอร์อิงภาษาจาก container จึงกำหนดแบบอังกฤษสหราชอาณาจักรให้เรียง วัน/เดือน/ปี
  return <div lang="en-GB">{children}</div>;
}
