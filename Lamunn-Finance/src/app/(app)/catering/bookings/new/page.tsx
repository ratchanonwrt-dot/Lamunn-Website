import { requireSectionPage } from "@/lib/permissions";
import NewBookingForm from "@/components/catering/NewBookingForm";

export default async function NewBookingPage({ searchParams }: { searchParams: { date?: string } }) {
  await requireSectionPage("CATERING", "edit");
  // กดวันว่างจากหน้าปฏิทินแล้วมาที่นี่ — เติมวันที่ให้เลย
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date! : "";

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-800">ลงงานจัดเลี้ยงใหม่</h1>
      <NewBookingForm initialDate={date} />
    </div>
  );
}
