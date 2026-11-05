export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  // ภาษาหน้าจอเป็นไทย ส่วนค่าที่ส่ง API ยังคงเป็น ISO เพื่อไม่กระทบข้อมูลเดิม
  return <div lang="th">{children}</div>;
}
