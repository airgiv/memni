"use client";
import { useEffect, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, FormField, Label, RadioGroup, RadioGroupItem, Textarea, ToggleGroup, ToggleGroupItem, toast } from "@/ui/rapui";
import { api } from "@/client/api";
import type { ClientTemplate } from "@/lib/templates/client";
import type { PersonDTO, RoleDTO } from "@/lib/server/present";
import type { LookSettings } from "@/lib/domain/types";

/**
 * The person's look in THIS meme. Only options the template's pipeline
 * supports are shown; no fake precise controls (height in cm etc.).
 * Settings are free — nothing is generated until the user asks.
 */
export function LookTab({
  template,
  role,
  person,
  onLook,
  onPersonChanged,
}: {
  template: ClientTemplate;
  role: RoleDTO;
  person: PersonDTO;
  onLook: (look: Partial<LookSettings>) => Promise<unknown>;
  onPersonChanged: () => Promise<unknown>;
}) {
  const look = role.look!;
  const [note, setNote] = useState(person.appearanceNote);
  useEffect(() => setNote(person.appearanceNote), [person.appearanceNote]);

  const clothingLabels: Record<string, { label: string; description: string }> = {
    photo: { label: "Одежда с фото", description: "Как на загруженных фотографиях" },
    template: { label: "Одежда из мема", description: template.look.templateOutfit.label },
    preset: { label: "Другой вариант", description: "Выбрать из вариантов этого мема" },
  };

  const saveNote = async () => {
    if (note === person.appearanceNote) return;
    try {
      await api(`/api/people/${person.id}`, { method: "PATCH", json: { appearanceNote: note } });
      await onPersonChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-[1rem] font-medium">Одежда</p>
        <RadioGroup
          variant="card"
          value={look.clothing}
          onValueChange={(v) => void onLook({ clothing: v as LookSettings["clothing"] })}
          aria-label="Одежда"
        >
          {template.look.clothingModes.map((m) => (
            <RadioGroupItem key={m} value={m} label={clothingLabels[m].label} description={clothingLabels[m].description} />
          ))}
        </RadioGroup>
        {look.clothing === "preset" && template.look.presets.length > 0 && (
          <RadioGroup variant="card" value={look.presetId} onValueChange={(v) => void onLook({ presetId: v })} aria-label="Вариант одежды" className="fun:animate-deal-in">
            {template.look.presets.map((p) => (
              <RadioGroupItem key={p.id} value={p.id} label={p.label} description={p.description} />
            ))}
          </RadioGroup>
        )}
      </div>

      <Collapsible>
        <CollapsibleTrigger>Дополнительно — необязательно</CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-5 pt-4">
            {template.look.glassesOption && (
              <div className="flex flex-col gap-2">
                <Label>Очки</Label>
                <ToggleGroup type="single" value={look.glasses ?? "as-photo"} onValueChange={(v) => v && void onLook({ glasses: v as "as-photo" | "remove" })}>
                  <ToggleGroupItem value="as-photo">Как на фото</ToggleGroupItem>
                  <ToggleGroupItem value="remove">Без очков</ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
            <FormField
              label="Уточнения внешности"
              optional
              hint={`Если на фото что-то не видно или изменилось: «сейчас короткая стрижка», «носит бороду». Сохранится для ${person.name} во всех роликах.`}
            >
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} limit={template.look.appearanceNoteMaxLength} rows={2} autoGrow />
            </FormField>
            <p className="text-[0.8125rem] text-mute">
              Мы не определяем пол, возраст и другие черты автоматически — модель опирается на ваши фото и эти добровольные уточнения.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
