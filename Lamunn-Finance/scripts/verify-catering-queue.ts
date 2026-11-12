// พิสูจน์ตรรกะคิวงาน Catering (lib/cateringQueue.ts) ด้วยข้อมูลจำลอง — ไม่แตะฐานข้อมูล
// รัน: npx tsx scripts/verify-catering-queue.ts
import { buildQueue, type QueueBooking } from "../src/lib/cateringQueue";
import { makeStaffColorLookup } from "../src/lib/cateringStaffColor";

let failed = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(extra)}`);
  if (!ok) failed++;
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const JOB_DOW = d("2092-11-20").getUTCDay(); // วันของงานเป้าหมายในเคส 3 — คำนวณจากวันที่จริง ไม่เดาเอง
const roster = [
  { name: "A", dayOffs: "", isActive: true },
  { name: "B", dayOffs: String(JOB_DOW), isActive: true }, // หยุดตรงกับวันของงานเป้าหมาย
  { name: "C", dayOffs: "", isActive: true },
  { name: "D", dayOffs: "", isActive: false },
];
const month = { monthStart: d("2092-11-01"), monthEnd: d("2092-11-30"), today: d("2092-11-02") };
const job = (id: string, from: string, to: string | null, staff: string[], required = 1, status = "CONFIRMED"): QueueBooking => ({
  id, customer: `[test]${id}`, eventDate: d(from), eventEndDate: to ? d(to) : null, status, staffNames: staff, required,
});

// 1) ลำดับคิว: น้อยสุดก่อน, คนปิดใช้งาน (D) ไม่ถูกเสนอ
{
  const r = buildQueue({
    roster, ...month, duties: [],
    bookings: [job("j1", "2092-11-05", null, ["A"]), job("j2", "2092-11-10", null, ["a "]), job("j3", "2092-11-12", null, ["B"])],
  });
  check("order is C(0), B(1), A(2) — names matched case/space-insensitively", r.rows.map((x) => `${x.name}${x.jobs}`).join(",") === "C0,B1,A2", r.rows);
  check("spread 2 → not fair", r.spread === 2 && !r.fair, r);
  check("inactive D never appears", !r.rows.some((x) => x.name === "D"));
}

// 2) งานหลายวันนับเป็น 1 งาน แต่นับวัน; งานยกเลิกไม่นับ; งานที่คร่อมเดือนนับเฉพาะวันในเดือน
{
  const r = buildQueue({
    roster, ...month, duties: [],
    bookings: [job("m1", "2092-11-05", "2092-11-07", ["A"]), job("m2", "2092-11-09", null, ["A"], 1, "CANCELLED"), job("m3", "2092-10-30", "2092-11-02", ["B"])],
  });
  const a = r.rows.find((x) => x.name === "A")!;
  const b = r.rows.find((x) => x.name === "B")!;
  check("multi-day job = 1 job, 3 days", a.jobs === 1 && a.days === 3, a);
  check("cancelled job ignored", a.jobs === 1, a);
  check("job straddling month start counts only in-month days (2)", b.jobs === 1 && b.days === 2, b);
}

// 3) งานถัดไป: เลือกคิวตามลำดับ, ข้ามคนติดงานอื่น/วันหยุด
{
  const base = [job("j1", "2092-11-05", null, ["A"]), job("j2", "2092-11-10", null, ["A"]), job("j3", "2092-11-12", null, ["B"])];
  const target = job("x", "2092-11-20", null, [], 2); // ต้อง 2 คน ยังไม่มีใคร
  let r = buildQueue({ roster, ...month, duties: [], bookings: [...base, target] });
  check("next job is the earliest short-staffed one", r.nextJob?.booking.id === "x", r.nextJob);
  check("B skipped (day off on the job day) → picks C then A", r.nextJob?.picks.join(",") === "C,A", r.nextJob);
  check("B listed as dayOff skip", r.nextJob?.suggestions.find((s) => s.name === "B")?.skipped === "dayOff", r.nextJob?.suggestions);
  check("missing = 2", r.nextJob?.missing === 2);

  r = buildQueue({ roster, ...month, duties: [], bookings: [...base, target, job("clash", "2092-11-19", "2092-11-20", ["C"])] });
  check("C busy on another job that day → skipped as busy", r.nextJob?.suggestions.find((s) => s.name === "C")?.skipped === "busy", r.nextJob?.suggestions);
  check("then only A is pickable (B day off, C busy)", r.nextJob?.picks.join(",") === "A", r.nextJob?.picks);

  r = buildQueue({ roster, ...month, duties: [], bookings: [...base, job("full", "2092-11-18", null, ["C"], 1)] });
  check("fully staffed jobs are not 'next job'", r.nextJob === null, r.nextJob);
}

// 4) เท่ากัน = fair, tie-break ด้วยคนที่ไปงานล่าสุดนานที่สุด
{
  const r = buildQueue({
    roster, ...month, duties: [],
    bookings: [job("t1", "2092-11-03", null, ["A"]), job("t2", "2092-11-08", null, ["B"]), job("t3", "2092-11-15", null, ["C"])],
  });
  check("all equal → fair, spread 0", r.fair && r.spread === 0, r);
  check("tie-break: A (went earliest) is next, then B, then C", r.rows.map((x) => x.name).join(",") === "A,B,C", r.rows);
}

// 5) สอน/แทนสาขาโชว์เป็นวัน แต่ไม่ปนกับจำนวนงานจัดเลี้ยง
{
  const r = buildQueue({ roster, ...month, bookings: [], duties: [{ staffName: "a", date: d("2092-11-04") }, { staffName: "A", date: d("2092-12-04") }] });
  check("branch duty days counted in-month only, jobs stay 0", r.rows.find((x) => x.name === "A")!.dutyDays === 1 && r.rows.find((x) => x.name === "A")!.jobs === 0);
}

// 6) สีประจำตัว: คงที่, ไม่ซ้ำกันภายในรายชื่อ, ไม่เปลี่ยนเมื่อเพิ่มคนใหม่
{
  const people = ["พี", "บี", "ซี", "ดี"].map((name, i) => ({ name, createdAt: new Date(2026, 0, 1 + i) }));
  const color = makeStaffColorLookup(people);
  const bars = people.map((p) => color(p.name).bar);
  check("roster colours are unique", new Set(bars).size === people.length, bars);
  const color2 = makeStaffColorLookup([...people, { name: "อี", createdAt: new Date(2026, 5, 1) }]);
  check("existing colours unchanged after adding a person", people.every((p) => color2(p.name).bar === color(p.name).bar));
  check("unknown name gets a stable colour", color("ไม่มีในรายชื่อ").bar === color("ไม่มีในรายชื่อ ").bar);
}

if (failed) {
  console.error(`\n${failed} check(s) FAILED`);
  process.exit(1);
}
console.log("\nall checks passed");
