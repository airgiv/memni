import { OrdersList } from "@/components/OrdersList";
import { TEMPLATES } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  return <OrdersList titles={Object.fromEntries(TEMPLATES.map((t) => [t.id, t.title]))} />;
}
