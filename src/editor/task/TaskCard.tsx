// Öğrenci görünümünde görev kartı (C1, N5): defterin en üstünde. Hedef satırları canlı kontrol edilir
// (tutunca yeşil tik, ölçülen değer); ölçülemeyen hedefte kısa yol ("Bode ile ölç", "Oynat").
// Kart "not vermez" diye yazar; "Teslim dosyası (.json)" devreyi indirir.

import { tr } from '../../i18n/tr';
import type { TaskDef } from '../../model/task';
import { Icon } from '../icons';
import { Rich } from '../Rich';
import { useTouchUi } from '../touchUi';
import { valueText } from './targets';

export interface TargetStatus {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly goal: string;
  readonly measured: number | null;
  readonly met: boolean;
  /** Ölçülemiyorsa kısa yol. */
  readonly shortcut: 'bode' | 'play' | null;
}

export function TaskCard({
  task,
  statuses,
  onBode,
  onPlay,
  onSubmit,
  onExit,
}: {
  task: TaskDef;
  statuses: readonly TargetStatus[];
  onBode: () => void;
  onPlay: () => void;
  onSubmit: () => void;
  onExit: () => void;
}) {
  const t = tr.task.card;
  const touch = useTouchUi();
  const met = statuses.filter((s) => s.met).length;
  return (
    <section data-notebook="task" aria-label={t.label(task.name)} className="flex shrink-0 flex-col gap-2.5 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-2 text-label">
        <Icon name="target" className="h-4 w-4 text-accent-ink" />
        <span className="font-semibold text-accent-ink">{t.kicker}</span>
        <span className="flex-1" />
        {statuses.length > 0 && (
          <span className="font-mono text-muted" aria-label={t.progress(met, statuses.length)}>
            {`${met} / ${statuses.length}`}
          </span>
        )}
      </div>
      <h2 className="m-0 text-[17px] font-semibold">{task.name}</h2>
      {task.instruction && (
        <p className="m-0 text-small leading-snug whitespace-pre-line text-ink-2">
          <Rich text={task.instruction} />
        </p>
      )}
      {statuses.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {statuses.map((s) => (
            <li key={s.id} className="flex items-center gap-3 border-t border-line py-2.5">
              <span
                aria-label={s.met ? t.met : t.notMet}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.met ? 'bg-ok-soft text-ok' : 'border-2 border-line-2'}`}
              >
                {s.met && <Icon name="check" className="h-3.5 w-3.5" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-small font-semibold">
                  <Rich text={s.name} />
                </span>
                <span className="font-mono text-label text-muted">{s.goal}</span>
              </span>
              {s.measured !== null ? (
                <b className={`shrink-0 font-mono text-small font-semibold tabular ${s.met ? 'text-ok-ink' : 'text-warn'}`}>{valueText(s.measured, s.unit)}</b>
              ) : s.shortcut ? (
                <button
                  type="button"
                  onClick={s.shortcut === 'bode' ? onBode : onPlay}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-label font-semibold text-accent-ink hover:brightness-95 ${touch ? 'h-11' : 'h-8'}`}
                >
                  <Icon name={s.shortcut === 'bode' ? 'bode' : 'play'} className="h-3.5 w-3.5" />
                  {s.shortcut === 'bode' ? t.measureBode : t.play}
                </button>
              ) : (
                <span className="shrink-0 text-label text-muted">—</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onSubmit} className={`flex items-center justify-center gap-2 rounded-xl border border-line-2 text-small font-semibold hover:bg-panel-2 ${touch ? 'h-11' : 'h-10'}`}>
        <Icon name="download" className="h-4 w-4" />
        {t.submit}
      </button>
      <p className="m-0 flex gap-1.5 text-label leading-snug text-muted">
        <Icon name="info" className="mt-px h-3.5 w-3.5 shrink-0" />
        {t.note}
      </p>
      <button type="button" onClick={onExit} className={`self-start text-label font-medium text-accent-ink hover:underline ${touch ? 'min-h-11' : ''}`}>
        {t.exit}
      </button>
    </section>
  );
}
