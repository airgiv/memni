import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/server/repo";
import { currentUserId } from "@/lib/server/auth";
import { getTemplate } from "@/lib/templates";
import { clientTemplate } from "@/lib/templates/client";
import { Constructor } from "@/components/constructor/Constructor";

export const dynamic = "force-dynamic";

export default async function CreatePage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const userId = await currentUserId();
  const draft = userId ? await getRepo().getDraft(userId, draftId) : null;
  // someone else's or a missing draft looks the same: not found
  if (!draft) notFound();
  const t = getTemplate(draft.templateId);
  if (!t) notFound();
  return (
    <Suspense>
      <Constructor template={clientTemplate(t)} />
    </Suspense>
  );
}
