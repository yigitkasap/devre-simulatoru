// Defterin örnek kartının içeriği (tasarım: M05a, M05b; v3): devrenin kurulumu, ne işe yaradığı
// (dayandığı fizik yasasıyla) ve günlük hayatta nerede kullanıldığı; altta önceki/sonraki örnek.

import { useId, useState, type ReactNode } from 'react';
import { EXAMPLE_GROUPS, EXAMPLE_IDS, EXTRA_EXAMPLES, type ExampleId } from '../examples';
import { tr, type ExampleQuestion } from '../i18n/tr';
import { Icon } from './icons';
import { Rich } from './Rich';
import { useTouchUi } from './touchUi';

export function groupOf(id: ExampleId): string {
  const group = EXAMPLE_GROUPS.find((g) => (g.ids as readonly ExampleId[]).includes(id));
  return group ? tr.examples.groups[group.id] : '';
}

/** Föyde olmayan ek örneğin etiketi ("Föyde yok · ek"); öbür örneklerde yok. */
export function ExtraTag({ id, className = '' }: { id: ExampleId; className?: string }) {
  if (!EXTRA_EXAMPLES.has(id)) return null;
  return <span className={`inline-block rounded-xs border border-line-2 px-1.5 py-px align-[2px] text-[11px] font-semibold whitespace-nowrap text-ink-2 ${className}`}>{tr.examples.extra}</span>;
}

/** Başlıklı metin bölümü (Ne işe yarar, Günlük hayatta). */
function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel-2 px-3.5 py-3">
      <h3 className="flex items-center gap-1.5 text-label font-semibold text-accent-ink">
        {icon}
        {title}
      </h3>
      <p className="text-sm leading-[1.55]">{children}</p>
    </section>
  );
}

/** Föydeki sorular: her sorunun cevabı "Cevabı göster" ile açılır (öğretmen ne zaman açılacağına karar verir). */
function Questions({ items }: { items: readonly ExampleQuestion[] }) {
  const touch = useTouchUi();
  const base = useId();
  const [shown, setShown] = useState<ReadonlySet<number>>(new Set());
  const toggle = (i: number) =>
    setShown((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <section aria-label={tr.examples.questionsTitle} className="flex flex-col gap-3 rounded-lg border border-line bg-panel-2 px-3.5 py-3">
      <h3 className="flex items-center gap-1.5 text-label font-semibold text-accent-ink">
        <Icon name="help" className="h-4 w-4" />
        {tr.examples.questionsTitle}
      </h3>
      <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
        {items.map((q, i) => {
          const open = shown.has(i);
          return (
            <li key={q.step + i} className="flex flex-col gap-1.5">
              <span className="text-label font-semibold text-muted">{q.step}</span>
              <p className="text-sm leading-[1.55]">
                <Rich text={q.question} />
              </p>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`${base}-${i}`}
                onClick={() => toggle(i)}
                className={`self-start rounded-md border border-line-2 bg-panel px-2.5 text-small font-medium hover:bg-app ${touch ? 'h-11' : 'h-8'}`}
              >
                {open ? tr.examples.hideAnswer : tr.examples.showAnswer}
              </button>
              {open && (
                <div id={`${base}-${i}`} className="rounded-[10px] border border-ok-line bg-ok-soft px-3.5 py-2.5 text-sm leading-[1.55]">
                  <Rich text={q.answer} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Örneğin metinleri ve gezinme: baraj sayfası bağlantısı, kurulum açıklaması, "Ne işe yarar?",
 * "Günlük hayatta", altta önceki / örneği kapat / sonraki. Örnek sekmesi ve defterin örnek kartı.
 */
export function ExampleDetails({ id, onOpen, onClose }: { id: ExampleId; onOpen: (id: ExampleId) => void; onClose: () => void }) {
  const touch = useTouchUi();
  const h9 = touch ? 'h-11' : 'h-9';
  const texts = tr.examples.texts[id];
  const index = EXAMPLE_IDS.indexOf(id);
  const previous = index > 0 ? EXAMPLE_IDS[index - 1] : undefined;
  const next = index < EXAMPLE_IDS.length - 1 ? EXAMPLE_IDS[index + 1] : undefined;
  return (
    <>
      {(id === 'baraj-cubuk' || id === 'baraj-tek-isik') && (
        <a
          href={`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}baraj/`}
          className={`flex items-center gap-1.5 self-start text-sm font-semibold text-accent-ink underline-offset-2 hover:underline ${touch ? 'min-h-11' : ''}`}
        >
          <Icon name="external" className="h-[18px] w-[18px]" />
          {tr.baraj.exampleTabLink}
        </a>
      )}
      <p className="text-sm leading-[1.55] text-ink-2">
        <Rich text={texts.description} />
      </p>
      {texts.questions && <Questions key={id} items={texts.questions} />}

      <Section
        title={tr.examples.purpose}
        icon={
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 2L4 11h5l-1 7 7-9h-5l1-7z" />
          </svg>
        }
      >
        <Rich text={texts.purpose} />
      </Section>
      <Section
        title={tr.examples.everyday}
        icon={
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9.5L10 3l7 6.5M5 8v9h10V8M8.5 17v-5h3v5" />
          </svg>
        }
      >
        <Rich text={texts.everyday} />
      </Section>

      <div className="mt-auto flex items-center justify-between border-t border-app pt-3">
        <button
          type="button"
          disabled={!previous}
          onClick={() => previous && onOpen(previous)}
          aria-label={tr.examples.previousLabel}
          className={`${h9} rounded-md px-2.5 text-small font-medium text-ink enabled:hover:bg-panel-2 disabled:text-stopped`}
        >
          {tr.examples.previous}
        </button>
        <button type="button" onClick={onClose} className={`${h9} rounded-md px-2.5 text-small font-medium text-muted hover:bg-panel-2`}>
          {tr.examples.closeExample}
        </button>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && onOpen(next)}
          aria-label={tr.examples.nextLabel}
          className={`${h9} rounded-md px-2.5 text-small font-medium text-ink enabled:hover:bg-panel-2 disabled:text-stopped`}
        >
          {tr.examples.next}
        </button>
      </div>
    </>
  );
}
