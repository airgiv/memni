/**
 * Server-rendered editorial content of a meme page. It sits in the sheet
 * body: crawlers read it in the initial HTML, people reveal it by expanding
 * the sheet. Every section lists the sources its facts come from.
 */
import type { Messages } from "@/i18n/messages/en";
import type { MemeContent, SourceRef } from "@/memes/types";

export function MemeEditorial({ content, sources, m, localeTag }: { content: MemeContent; sources: SourceRef[]; m: Messages; localeTag: string }) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const used = sources.filter((s) => content.sections.some((sec) => sec.sources?.includes(s.id)));
  const date = (d?: string) => (d ? new Intl.DateTimeFormat(localeTag, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(d)) : null);
  return (
    <article className="flex flex-col gap-7 pt-2 text-[15px] leading-relaxed text-fg-2">
      {content.sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`h-${s.id}`}>
          <h2 id={`h-${s.id}`} className="mb-2 text-[17px] font-semibold text-fg">
            {s.heading}
          </h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mb-2.5">
              {p}
            </p>
          ))}
          {s.sources && s.sources.length > 0 && (
            <p className="text-[12px] text-faint">
              {m.landing.sources}:{" "}
              {s.sources.map((id, i) => {
                const src = byId.get(id);
                return src ? (
                  <span key={id}>
                    {i > 0 && ", "}
                    <a href={`#src-${id}`} className="underline decoration-white/20 underline-offset-2 hover:text-fg-2">
                      {src.publisher}
                    </a>
                  </span>
                ) : null;
              })}
            </p>
          )}
        </section>
      ))}

      <section aria-labelledby="h-faq">
        <h2 id="h-faq" className="mb-3 text-[17px] font-semibold text-fg">
          {m.landing.faq}
        </h2>
        <dl className="flex flex-col gap-4">
          {content.faq.map((f) => (
            <div key={f.q}>
              <dt className="font-medium text-fg">{f.q}</dt>
              <dd className="mt-1">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="h-sources">
        <h2 id="h-sources" className="mb-1 text-[17px] font-semibold text-fg">
          {m.landing.sources}
        </h2>
        <p className="mb-3 text-[13px] text-muted">{m.landing.sourcesNote}</p>
        <ol className="flex flex-col gap-2 text-[14px]">
          {used.map((s) => (
            <li key={s.id} id={`src-${s.id}`}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-fg-2 underline decoration-white/20 underline-offset-2 hover:text-fg">
                {s.title}
              </a>
              <span className="text-muted">
                {" "}
                — {s.publisher}
                {s.date ? `, ${date(s.date)}` : ""}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12px] text-faint">{m.landing.notAffiliated}</p>
      </section>
    </article>
  );
}
