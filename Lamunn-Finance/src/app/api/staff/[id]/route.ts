import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@lamunn/db-finance";
import { requireStaff, type Role } from "@/lib/requireStaff";
import { logActivity } from "@/lib/activityLog";

const VALID_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "STAFF", "CATERING_STAFF", "MARKETING"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff(["SUPER_ADMIN"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { role, isActive, password } = body;

  // ป้องกัน Super Admin ปิดการใช้งาน/ลดสิทธิ์ตัวเองจนล็อกตัวเองออกจากระบบ
  if (staff.staffId === params.id && (isActive === false || (role !== undefined && role !== "SUPER_ADMIN"))) {
    return NextResponse.json({ error: "ไม่สามารถลดสิทธิ์หรือปิดการใช้งานบัญชีตัวเองได้" }, { status: 400 });
  }

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "สิทธิ์ไม่ถูกต้อง" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (role !== undefined) data.role = role;
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const user = await prisma.staffUser.update({
    where: { id: params.id },
    data,
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  const changes = [
    role !== undefined ? `เปลี่ยนสิทธิ์เป็น ${role}` : null,
    isActive !== undefined ? (isActive ? "เปิดใช้งานบัญชี" : "ปิดใช้งานบัญชี") : null,
    password ? "ตั้งรหัสผ่านใหม่" : null,
  ].filter(Boolean);
  if (changes.length > 0) {
    await logActivity({
      staffId: staff.staffId,
      staffName: staff.staffName,
      action: "UPDATE",
      entity: "Staff",
      summary: `แก้ไขผู้ใช้งาน ${user.name} (${user.email}) — ${changes.join(", ")}`,
    });
  }

  return NextResponse.json({ user });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff(["SUPER_ADMIN"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (staff.staffId === params.id) {
    return NextResponse.json({ error: "ลบบัญชีตัวเองไม่ได้" }, { status: 400 });
  }

  const target = await prisma.staffUser.findUnique({ where: { id: params.id }, select: { name: true, email: true, role: true } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (target.role === "SUPER_ADMIN") {
    const adminCount = await prisma.staffUser.count({ where: { role: "SUPER_ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "ลบไม่ได้ — ต้องมีผู้ดูแลระบบสูงสุดเหลืออย่างน้อย 1 คน" }, { status: 400 });
    }
  }

  // ประวัติที่เคยผูกกับบัญชีนี้ (สร้างรายการ Catering/Event/บันทึกยอด ฯลฯ) จะยังอยู่ครบ
  // แค่ช่อง "สร้างโดย" จะว่างไป (onDelete: SetNull ในสคีมา) ไม่กระทบข้อมูลอื่น
  await prisma.staffUser.delete({ where: { id: params.id } });

  await logActivity({
    staffId: staff.staffId,
    staffName: staff.staffName,
    action: "DELETE",
    entity: "Staff",
    summary: `ลบผู้ใช้งาน — ${target.name} (${target.email}, ${target.role})`,
  });

  return NextResponse.json({ ok: true });
}
