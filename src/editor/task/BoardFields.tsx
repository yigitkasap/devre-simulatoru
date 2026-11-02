// Görev oluştur → Tahtada kur (T6): başlangıç tahtası (boş, güç rayları bağlı, seçili parçalar takılı),
// Denetle hakkı (sınırsız, 3 kez, teslimde), ipucu sınırı, Bağlı delikleri göster, Oynat izni. Tahtanın
// boyu devreye göre seçilir (planBreadboard). Seçili parçalar çiplerle seçilir (değiştirilebilir parçalar
// gibi).

import type { BreadboardPlan } from '../../bench3d/breadboard';
import { tr } from '../../i18n/tr';
import type { BoardTask } from '../../model/task';
import type { CircuitDoc } from '../../model/types';
import { Icon } from '../icons';
import { boardParts } from '../tahta/BoardMode';

export function BoardFields({ doc, plan, value, onChange, touch }: { doc: CircuitDoc; plan: BreadboardPlan; value: BoardTask; onChange: (next: BoardTask) => void; touch: boolean }) {
  const t = tr.tahta.gorev;
  const set = (patch: Partial<BoardTask>) => onChange({ ...value, ...patch });
  const h = touch ? 'h-11' : 'h-9';
  const segmented = <K extends string | number>(label: string, options: readonly (readonly [K, string])[], current: K, pick: (k: K) => void) => (
    <span role="radiogroup" aria-label={label} className="flex rounded-xl bg-app p-1">
      {options.map(([k, name]) => (
        <button
          key={String(k)}
          type="button"
          role="radio"
          aria-checked={current === k}
          onClick={() => pick(k)}
          className={`flex flex-1 items-center justify-center rounded-[10px] px-1 text-small ${h} ${current === k ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
        >
          {name}
        </button>
      ))}
    </span>
  );
  const toggle = (on: boolean, title: string, note: string, flip: () => void) => (
    <button type="button" role="switch" aria-checked={on} onClick={flip} className={`flex w-full items-center justify-between gap-3 text-left text-small ${touch ? 'min-h-11' : 'min-h-9'}`}>
      <span className="flex min-w-0 flex-col">
        <span>{title}</span>
        <span className="text-label text-muted">{note}</span>
      </span>
      <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-line-2'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-panel shadow ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
  const parts = boardParts(doc, plan);
  const fits = plan.boards === 1;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-small font-semibold">{t.start}</span>
        {segmented(t.start, [['empty', t.starts.empty], ['rails', t.starts.rails], ['parts', t.starts.parts]] as const, value.start, (start) => set({ start }))}
        {value.start === 'parts' && (
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="text-label text-muted">{t.partsNote}</span>
            <div className="flex flex-wrap gap-1.5">
              {parts.map((p) => {
                const on = value.parts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ parts: on ? value.parts.filter((x) => x !== p.id) : [...value.parts, p.id] })}
                    className={`rounded-full border px-3.5 font-mono text-small ${touch ? 'h-11' : 'h-8'} ${on ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line-2 text-ink hover:bg-panel-2'}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-semibold">{t.checks}</span>
          {segmented(t.checks, [['unlimited', t.checksOptions.unlimited], ['three', t.checksOptions.three], ['submit', t.checksOptions.submit]] as const, value.checks, (checks) => set({ checks }))}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-semibold">{t.maxHint}</span>
          {segmented(t.maxHint, ([1, 2, 3, 4] as const).map((k) => [k, t.hintOptions[k - 1]!] as const), value.maxHint, (maxHint) => set({ maxHint }))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 max-sm:grid-cols-1">
        {toggle(value.showConnected, t.showConnected, t.showConnectedNote(plan.cols > 30 ? 50 : 25), () => set({ showConnected: !value.showConnected }))}
        {toggle(value.allowPlay, t.allowPlay, t.allowPlayNote, () => set({ allowPlay: !value.allowPlay }))}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-app px-3 py-2.5 text-small">
        <span className="text-ink-2">{t.board}</span>
        <span>
          {fits ? (plan.cols > 30 ? t.full : t.half) : t.tooBig} <span className="text-muted">{t.chosen}</span>
        </span>
      </div>
      <p role="note" className="m-0 flex gap-2 rounded-lg border border-accent-soft bg-accent-soft/40 px-3 py-2.5 text-small text-ink-2">
        <Icon name="info" className="mt-px h-4 w-4 shrink-0" />
        {t.submissionNote}
      </p>
    </>
  );
}
