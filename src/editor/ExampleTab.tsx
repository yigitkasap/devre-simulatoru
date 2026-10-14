// İnceleme paneli → Örnek sekmesi (tasarım: M05a, M05b). Açıklama, tahmin sorusu (isteğe bağlı
// tahmin alanıyla) ve Oynat'a basılınca açılan cevap; altta önceki/sonraki örnek.

import { useId } from 'react';
import { EXAMPLE_GROUPS, EXAMPLE_IDS, type ExampleId } from '../examples';
import { tr } from '../i18n/tr';
import { Icon } from './icons';
import { Rich } from './Rich';
import { useTouchUi } from './touchUi';

export interface ExampleTabProps {
  readonly id: ExampleId | null;
  readonly revealed: boolean;
  /** Öğrencinin yazdığı tahmin (yalnızca bu oturumda tutulur). */
  readonly prediction: string;
  readonly onPrediction: (text: string) => void;
  readonly onPlay: () => void;
  readonly onOpen: (id: ExampleId) => void;
  readonly onClose: () => void;
  readonly onBrowse: () => void;
}

function groupOf(id: ExampleId): string {
  const group = EXAMPLE_GROUPS.find((g) => (g.ids as readonly ExampleId[]).includes(id));
  return group ? tr.examples.groups[group.id] : '';
}

export function ExampleTab({ id, revealed, prediction, onPrediction, onPlay, onOpen, onClose, onBrowse }: ExampleTabProps) {
  const inputId = useId();
  // Telefonda dokunma hedefleri 44 px, yazı alanı 16 px.
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

  const texts = tr.examples.texts[id];
  const index = EXAMPLE_IDS.indexOf(id);
  const previous = index > 0 ? EXAMPLE_IDS[index - 1] : undefined;
  const next = index < EXAMPLE_IDS.length - 1 ? EXAMPLE_IDS[index + 1] : undefined;
  const guess = prediction.trim();

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain pb-5 ${touch ? 'px-4 pt-2' : 'px-5 pt-4'}`}>
      <div className="flex flex-col gap-1.5">
        <span className="self-start rounded-xs bg-accent-soft px-2 py-0.5 text-label font-semibold text-accent-ink">
          {tr.examples.tabBadge(groupOf(id))}
        </span>
        <h2 className="text-title leading-tight font-semibold">{texts.title}</h2>
      </div>
      {!revealed && (
        <p className="text-sm leading-[1.55] text-ink-2">
          <Rich text={texts.description} />
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-warn-line bg-warn-soft px-3.5 py-3">
        <span className="flex items-center gap-1.5 text-label font-semibold text-warn">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M7 14h6M8 17h4M10 2a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" />
          </svg>
          {tr.examples.predict}
        </span>
        <span className={revealed ? 'text-sm leading-normal' : 'text-[15px] leading-normal'}>
          <Rich text={texts.question} />
        </span>
        {revealed ? (
          guess && (
            <span className="text-small text-muted">
              {tr.examples.predictionShown} <b className="font-mono text-ink">{guess}</b>
            </span>
          )
        ) : (
          <>
            <label htmlFor={inputId} className="pt-0.5 text-label text-muted">
              {tr.examples.predictionLabel}
            </label>
            <input
              id={inputId}
              value={prediction}
              onChange={(e) => onPrediction(e.target.value)}
              autoComplete="off"
              className={`rounded-md border border-warn-line bg-panel px-2.5 font-mono font-medium ${touch ? 'h-12 text-base' : 'h-10 text-[15px]'} outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft`}
            />
          </>
        )}
      </div>

      {revealed ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-ok-line bg-ok-soft px-3.5 py-3">
          <span className="flex items-center gap-1.5 text-label font-semibold text-ok">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10l4 4 8-8" />
            </svg>
            {tr.examples.answer}
          </span>
          <span className="text-[15px] leading-[1.55]">
            <Rich text={texts.answer} />
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2.5 rounded-lg border border-dashed border-line-2 bg-panel-2 p-3.5">
          <span className="flex items-center gap-2 text-sm text-muted">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <rect x="4" y="9" width="12" height="8" rx="2" />
              <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
            </svg>
            {tr.examples.answerHidden}
          </span>
          <button
            type="button"
            onClick={onPlay}
            className={`flex ${h9} items-center gap-1.5 rounded-md bg-ok px-3.5 text-sm font-semibold text-white hover:brightness-110`}
          >
            <Icon name="play" />
            {tr.sim.play}
          </button>
        </div>
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
    </div>
  );
}
