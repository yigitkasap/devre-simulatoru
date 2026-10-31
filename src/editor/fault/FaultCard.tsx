// Arıza bulma kartı (B2, R1): defterin en üstünde, hedefli görevin kartı yerine. Belirti, ölçüm
// günlüğü (kendiliğinden yazılır; hoca istediyse her satırda "Beklenen"), Arızayı bildir ve İpucu.

import { useState } from 'react';
import { tr } from '../../i18n/tr';
import { formatSI } from '../../sim/units';
import { parseTheory } from '../analysis/table';
import { Icon } from '../icons';
import { useTouchUi } from '../touchUi';
import type { FaultSession, LogEntry } from './session';

export function FaultCard({
  title,
  symptom,
  session,
  askExpected,
  hideIndicators,
  onExpected,
  wrong,
  onReport,
  onHint,
}: {
  title: string;
  symptom: string;
  session: FaultSession;
  askExpected: boolean;
  hideIndicators: boolean;
  onExpected: (key: string, value: number | null) => void;
  /** Son bildirim yanlıştı: "Bu değil, ölçmeye devam et." */
  wrong: boolean;
  onReport: () => void;
  onHint: () => void;
}) {
  const t = tr.fault.card;
  const touch = useTouchUi();
  return (
    <section data-notebook="task" aria-label={t.label(title)} className="flex shrink-0 flex-col gap-2.5 rounded-xl border border-warn-line bg-panel p-4">
      <div className="flex items-center gap-2 text-label">
        <Icon name="wrench" className="h-4 w-4 text-warn" />
        <span className="font-semibold text-warn">{t.kicker}</span>
        <span className="flex-1" />
        <span className="font-mono text-ink-2">{t.count(session.log.length)}</span>
      </div>
      <h2 className="m-0 text-[18px] font-semibold">{title}</h2>
      <p className="m-0 text-small leading-snug text-ink-2">
        {symptom ? `${symptom} ` : ''}
        {t.intro}
      </p>
      <div className="flex items-baseline justify-between gap-2 pt-1">
        <span className="text-label font-semibold tracking-wide text-muted uppercase">{t.log}</span>
        {askExpected && <span className="text-label text-muted">{t.expectedHead}</span>}
      </div>
      {session.log.length === 0 ? (
        <p className="m-0 text-small leading-snug text-muted">{t.empty}</p>
      ) : (
        <ol aria-label={t.log} className="m-0 flex list-none flex-col p-0">
          {session.log.map((entry, i) => (
            <LogRow key={entry.key} n={i + 1} entry={entry} askExpected={askExpected} touch={touch} onExpected={(v) => onExpected(entry.key, v)} />
          ))}
        </ol>
      )}
      {session.hints > 0 && (
        <ol aria-label={tr.fault.hints.label} className="m-0 flex list-none flex-col gap-1.5 rounded-lg bg-accent-soft p-2.5">
          {tr.fault.hints.list.slice(0, session.hints).map((hint) => (
            <li key={hint} className="flex gap-2 text-small leading-snug text-accent-ink">
              <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0" />
              {hint}
            </li>
          ))}
        </ol>
      )}
      {wrong && (
        <p role="alert" className="m-0 flex items-center gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-small font-semibold text-warn">
          <Icon name="warning" className="h-4 w-4 shrink-0" />
          {tr.fault.report.wrong}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onReport}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-small font-semibold text-white hover:brightness-110 ${touch ? 'h-11' : 'h-[42px]'}`}
        >
          <Icon name="flag" className="h-4 w-4" />
          {tr.fault.report.open}
        </button>
        <button
          type="button"
          onClick={onHint}
          disabled={session.hints >= tr.fault.hints.list.length}
          title={session.hints >= tr.fault.hints.list.length ? tr.fault.hints.none : undefined}
          className={`flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line-2 px-3 text-small font-medium hover:bg-panel-2 disabled:opacity-50 ${touch ? 'h-11' : 'h-[42px]'}`}
        >
          <Icon name="bulb" className="h-4 w-4" />
          {tr.fault.hints.button}
        </button>
      </div>
      {hideIndicators && (
        <p className="m-0 flex gap-1.5 text-label leading-snug text-muted">
          <Icon name="info" className="mt-px h-3.5 w-3.5 shrink-0" />
          {t.note}
        </p>
      )}
    </section>
  );
}

function LogRow({ n, entry, askExpected, touch, onExpected }: { n: number; entry: LogEntry; askExpected: boolean; touch: boolean; onExpected: (v: number | null) => void }) {
  const t = tr.fault.card;
  const unit = entry.mode === 'ohm' ? 'Ω' : 'V';
  const [invalid, setInvalid] = useState(false);
  return (
    <li className="flex items-center gap-3 border-t border-line py-2">
      <span className="w-5 shrink-0 text-label text-muted tabular">{n}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-small">{entry.name}</span>
      <b className="shrink-0 font-mono text-small font-semibold tabular">{entry.text}</b>
      {askExpected && (
        <input
          key={entry.expected ?? 'bos'}
          aria-label={t.expectedLabel(entry.name)}
          aria-invalid={invalid}
          placeholder={t.expectedPlaceholder}
          inputMode="decimal"
          defaultValue={entry.expected !== undefined ? formatSI(entry.expected, unit, { trim: true }) : ''}
          onBlur={(e) => {
            const text = e.target.value.trim();
            const v = text === '' ? null : parseTheory(text, unit);
            setInvalid(text !== '' && v === null);
            if (text === '' || v !== null) onExpected(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className={`shrink-0 rounded-lg border bg-panel px-2 text-right font-mono ${invalid ? 'border-warn' : 'border-line-2'} ${touch ? 'h-11 w-[100px] text-[16px]' : 'h-8 w-[88px] text-sm'}`}
        />
      )}
    </li>
  );
}
