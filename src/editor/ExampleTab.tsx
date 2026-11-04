// Defterin örnek kartının içeriği (tasarım: M05a, M05b; v3): devrenin kurulumu, ne işe yaradığı
// (dayandığı fizik yasasıyla) ve günlük hayatta nerede kullanıldığı; altta önceki/sonraki örnek.
// Föy deneylerinin kartı ayrı düzendedir: amaç, teorik bilgi (katlı), adımlar ("Simülasyonda:"),
// föydeki sorular (cevaplar katlı) ve günlük hayatta; metinleri i18n/foy.ts.

import { useId, useState, type ReactNode } from 'react';
import { EXAMPLE_GROUPS, EXAMPLE_IDS, EXTRA_EXAMPLES, type ExampleId } from '../examples';
import { LAB_EXPERIMENT_TEXTS, labFigure, type LabExperiment, type LabFigure } from '../i18n/foy';
import { tr } from '../i18n/tr';
import { Icon } from './icons';
import { plainText, Rich } from './Rich';
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

/** Föy kartının başlığı ("Deney 1 · Şekil-3"); föy deneyi olmayan ve ek örneklerde null. */
export function labBadge(id: ExampleId): string | null {
  const figure = EXTRA_EXAMPLES.has(id) ? null : labFigure(id);
  return figure ? tr.examples.lab.badge(figure.experiment, figure.figure) : null;
}

/** Başlıklı metin bölümü (Amaç, Ne işe yarar, Günlük hayatta). */
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

/** Kartta gösterilen bir soru: etiketi (hangi adım), föydeki metni, cevabı ve cevabın açtığı örnek. */
interface QuestionItem {
  readonly label: string;
  readonly question: string;
  readonly answer: string;
  readonly link?: ExampleId;
}

/** Föydeki sorular: her sorunun cevabı "Cevabı göster" ile açılır (öğretmen ne zaman açılacağına karar verir). */
function Questions({ items, onOpen }: { items: readonly QuestionItem[]; onOpen: (id: ExampleId) => void }) {
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
            <li key={q.label + i} className="flex flex-col gap-1.5">
              <span className="text-label font-semibold text-muted">{q.label}</span>
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
                <div id={`${base}-${i}`} className="flex flex-col gap-2 rounded-[10px] border border-ok-line bg-ok-soft px-3.5 py-2.5 text-sm leading-[1.55]">
                  <p>
                    <Rich text={q.answer} />
                  </p>
                  {q.link && (
                    <button
                      type="button"
                      onClick={() => onOpen(q.link!)}
                      className={`flex items-center gap-1.5 self-start text-left text-sm font-semibold text-accent-ink underline-offset-2 hover:underline ${touch ? 'min-h-11' : ''}`}
                    >
                      <Icon name="book" className="h-4 w-4 shrink-0" />
                      {tr.examples.lab.openExample(plainText(tr.examples.texts[q.link].title))}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const EVERYDAY_ICON = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9.5L10 3l7 6.5M5 8v9h10V8M8.5 17v-5h3v5" />
  </svg>
);

/** Teorik bilgi: katlı başlar; formüller (föydeki denklem numarasıyla) ve transistörün bacak bağlantısı. */
function Theory({ experiment }: { experiment: LabExperiment }) {
  const touch = useTouchUi();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const { pinout } = experiment;
  return (
    <section className="flex flex-col rounded-lg border border-line bg-panel-2">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center gap-1.5 rounded-lg px-3.5 text-left text-label font-semibold text-accent-ink hover:bg-app ${touch ? 'min-h-11' : 'min-h-10'}`}
        >
          <Icon name="info" className="h-4 w-4" />
          <span className="flex-1">{tr.examples.lab.theory}</span>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4 shrink-0" />
        </button>
      </h3>
      {open && (
        <div id={bodyId} className="flex flex-col gap-2 px-3.5 pb-3 text-sm leading-[1.55]">
          {experiment.theory.map((part, i) =>
            'text' in part ? (
              <p key={i}>
                <Rich text={part.text} />
              </p>
            ) : (
              <p key={i} className="flex items-baseline justify-between gap-3 rounded-md border border-line bg-panel px-3 py-1.5">
                <span>
                  <Rich text={part.formula} />
                </span>
                {part.eq !== undefined && <span className="shrink-0 text-xs text-muted">({part.eq})</span>}
              </p>
            ),
          )}
          {pinout && (
            <div className="mt-1 flex flex-col gap-1.5">
              <h4 className="text-label font-semibold">{tr.examples.lab.pinout(pinout.part, pinout.figure)}</h4>
              <ol className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
                {pinout.legs.map((leg, i) => (
                  <li key={i} className="flex flex-col items-center rounded-md border border-line bg-panel px-1.5 py-1.5 text-center">
                    <span className="text-xs text-muted">{tr.examples.lab.leg(i + 1)}</span>
                    <span className="font-semibold">
                      <Rich text={leg} />
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-small text-ink-2">
                <Rich text={pinout.note} />
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Föydeki adımlar, föydeki numarasıyla; her adımın altında simülasyonda nasıl yapılacağı. */
function Steps({ figure }: { figure: LabFigure }) {
  return (
    <section aria-label={tr.examples.lab.steps} className="flex flex-col gap-2 rounded-lg border border-line bg-panel-2 px-3.5 py-3">
      <h3 className="flex items-center gap-1.5 text-label font-semibold text-accent-ink">
        <Icon name="menu" className="h-4 w-4" />
        {tr.examples.lab.steps}
      </h3>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {figure.steps.map((step) => (
          <li key={step.no} className="flex gap-2.5">
            {step.no !== '' && <span className="w-6 shrink-0 text-sm font-semibold text-accent-ink">{step.no}</span>}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm leading-[1.55]">
                <Rich text={step.text} />
              </p>
              <p className="text-small leading-[1.5] text-ink-2">
                <b className="font-semibold text-ink">{tr.examples.lab.inSim}</b> <Rich text={step.sim} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Föy deneyinin kartı: amaç, teorik bilgi, adımlar, föydeki sorular, günlük hayatta. */
function LabDetails({ id, figure, onOpen }: { id: ExampleId; figure: LabFigure; onOpen: (id: ExampleId) => void }) {
  const experiment = LAB_EXPERIMENT_TEXTS[figure.experiment]!;
  return (
    <>
      <Section title={tr.examples.lab.aim} icon={<Icon name="target" className="h-4 w-4" />}>
        <Rich text={experiment.aim} />
      </Section>
      <Theory key={figure.experiment} experiment={experiment} />
      <Steps figure={figure} />
      <Questions
        key={id}
        items={figure.questions.map((q) => ({ label: tr.examples.lab.step(q.step), question: q.question, answer: q.answer, link: q.link }))}
        onOpen={onOpen}
      />
      <Section title={tr.examples.everyday} icon={EVERYDAY_ICON}>
        <Rich text={tr.examples.texts[id].everyday} />
      </Section>
    </>
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
  const figure = EXTRA_EXAMPLES.has(id) ? null : labFigure(id);
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
      {figure ? (
        <LabDetails id={id} figure={figure} onOpen={onOpen} />
      ) : (
        <>
          <p className="text-sm leading-[1.55] text-ink-2">
            <Rich text={texts.description} />
          </p>

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
          <Section title={tr.examples.everyday} icon={EVERYDAY_ICON}>
            <Rich text={texts.everyday} />
          </Section>
        </>
      )}

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
