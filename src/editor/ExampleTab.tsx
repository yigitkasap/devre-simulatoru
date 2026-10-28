// İnceleme paneli → Örnek sekmesi (tasarım: M05a, M05b). Devrenin kurulumu, ne işe yaradığı (dayandığı
// fizik yasasıyla) ve günlük hayatta nerede kullanıldığı; altta önceki/sonraki örnek.

import type { ReactNode } from 'react';
import { EXAMPLE_GROUPS, EXAMPLE_IDS, type ExampleId } from '../examples';
import { tr } from '../i18n/tr';
import { Icon } from './icons';
import { Rich } from './Rich';
import { useTouchUi } from './touchUi';

export interface ExampleTabProps {
  readonly id: ExampleId | null;
  readonly onOpen: (id: ExampleId) => void;
  readonly onClose: () => void;
  readonly onBrowse: () => void;
}

export function groupOf(id: ExampleId): string {
  const group = EXAMPLE_GROUPS.find((g) => (g.ids as readonly ExampleId[]).includes(id));
  return group ? tr.examples.groups[group.id] : '';
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

export function ExampleTab({ id, onOpen, onClose, onBrowse }: ExampleTabProps) {
  // Telefonda dokunma hedefleri 44 px.
  const touch = useTouchUi();
  const h9 = touch ? 'h-11' : 'h-9';
  if (!id) {
    return (
      <div className="flex flex-col items-start gap-3 px-5 pt-5">
        <b className="text-heading font-semibold">{tr.examples.noneTitle}</b>
        <p className="text-small text-muted">{tr.examples.noneText}</p>
        <button
          type="button"
          onClick={onBrowse}
          className={`flex ${h9} items-center gap-1.5 rounded-md border border-line-2 bg-panel px-3 text-sm font-medium hover:bg-panel-2`}
        >
          <Icon name="book" />
          {tr.examples.browse}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain pb-5 ${touch ? 'px-4 pt-2' : 'px-5 pt-4'}`}>
      <div className="flex flex-col gap-1.5">
        <span className="self-start rounded-xs bg-accent-soft px-2 py-0.5 text-label font-semibold text-accent-ink">
          {tr.examples.tabBadge(groupOf(id))}
        </span>
        <h2 className="text-title leading-tight font-semibold">{tr.examples.texts[id].title}</h2>
      </div>
      <ExampleDetails id={id} onOpen={onOpen} onClose={onClose} />
    </div>
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
