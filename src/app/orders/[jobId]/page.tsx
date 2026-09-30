import { TEMPLATES } from "@/lib/templates";
import { OrderView } from "@/components/OrderView";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const templates = TEMPLATES.map((t) => ({ id: t.id, title: t.title, roles: t.roles.length, aspectRatio: t.aspectRatio, durationSec: t.durationSec }));
  return <OrderView jobId={jobId} templates={templates} />;
}
