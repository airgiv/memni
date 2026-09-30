import { TEMPLATES } from "@/lib/templates";
import { OrderView } from "@/components/OrderView";

export default async function OrderPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const templates = TEMPLATES.map((t) => ({ id: t.id, title: t.title, aspectRatio: t.aspectRatio }));
  return <OrderView jobId={jobId} templates={templates} />;
}
