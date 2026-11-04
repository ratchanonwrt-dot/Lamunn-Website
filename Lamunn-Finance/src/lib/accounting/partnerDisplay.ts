/** แสดงชื่อคู่ค้าและสาขาแบบเดียวกันทั้งระบบ โดยไม่แก้ชื่อจริงที่เก็บในฐานข้อมูล */
export function formatPartnerBranch(branchTag: string | null | undefined): string {
  const branch = String(branchTag ?? "").trim();
  if (!branch) return "";
  if (branch.includes("สำนักงานใหญ่") || branch.toLowerCase().includes("head office")) return "สำนักงานใหญ่";
  if (branch.startsWith("สาขา")) return branch;
  return `สาขา ${branch}`;
}

export function formatPartnerDisplayName(name: string, branchTag: string | null | undefined): string {
  const cleanName = name.trim();
  const branch = formatPartnerBranch(branchTag);
  if (!branch) return cleanName;
  const suffix = `(${branch})`;
  return cleanName.endsWith(suffix) ? cleanName : `${cleanName} ${suffix}`;
}
