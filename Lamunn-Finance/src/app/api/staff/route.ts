import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@lamunn/db-finance";
import { requireStaff, type Role } from "@/lib/requireStaff";
import { logActivity } from "@/lib/activityLog";

const VALID_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "STAFF", "CATERING_STAFF", "MARKETING"];

export async function GET() {
  const staff = await requireStaff(["SUPER_ADMIN"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const users = await prisma.staffUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const staff = await requireStaff(["SUPER_ADMIN"]);
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, email, password, role } = body;
  if (!name || !email || !password) {
    return NextResponse.json({ error: "name, email, password are required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" }, { status: 400 });
  }

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "อีเมลนี้มีผู้ใช้งานอยู่แล้ว" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.staffUser.create({
    data: { name, email, passwordHash, role: VALID_ROLES.includes(role) ? role : "STAFF" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  await logActivity({
    staffId: staff.staffId,
    staffName: staff.staffName,
    action: "CREATE",
    entity: "Staff",
    summary: `เพิ่มผู้ใช้งานใหม่ — ${user.name} (${user.email}, ${user.role})`,
  });

  return NextResponse.json({ user });
}
