// Arızayı bildir (R2) ve Arıza bulundu (R3) kartları: defterin en üstünde, arıza kartının yerinde.
// Bildir: 1 Nerede? (şemadan seçilir), 2 Ne tür?, 3 Hangi ölçümler? (günlükten). Bulundu: açıklama,
// belirleyici ölçüm, ölçüm / bildirim / ipucu / gerekçe sayısı, Onar ve çalıştır, Rapor, Yeni arıza dene.

import type { ReactNode } from 'react';
import { tr } from '../../i18n/tr';
import { FAULT_KINDS, type FaultKind } from '../../model/faults';
import { Icon } from '../icons';
import { useTouchUi } from '../touchUi';
import type { LogEntry } from './session';

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-small font-semibold">
        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] text-panel">
          {n}
        </span>
        {title}
      </span>
      {children}
    </div>
  );
}

export function ReportCard({
  where,
  kind,
  evidence,
  log,
  onKind,
  onEvidence,
  onSubmit,
  onCancel,
}: {
  /** Şemada seçilen yerin adı; seçilmediyse null. */
  where: string | null;
  kind: FaultKind | null;
  evidence: readonly string[];
  log: readonly LogEntry[];
  onKind: (kind: FaultKind) => void;
  onEvidence: (key: string, on: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const t = tr.fault.report;
  const touch = useTouchUi();
  return (
    <section data-notebook="task" aria-label={t.title} className="flex shrink-0 flex-col gap-3.5 rounded-xl border border-accent-line bg-panel p-4">
      <span className="flex items-center gap-2 text-label font-semibold text-accent-ink">
        <Icon name="flag" className="h-4 w-4" />
        {t.title}
      </span>
      <Step n={1} title={t.where}>
        <span className={`flex items-center gap-2 rounded-lg bg-panel-2 px-3 text-small ${touch ? 'min-h-11' : 'min-h-9'}`}>
          {where ? (
            <>
              <b className="min-w-0 flex-1 font-semibold">{where}</b>
              <span className="shrink-0 text-label text-muted">{t.fromSchematic}</span>
            </>
          ) : (
            <span className="text-muted">{t.notChosen}</span>
          )}
        </span>
      </Step>
      <Step n={2} title={t.kind}>
        <span role="radiogroup" aria-label={t.kind} className="flex flex-col">
          {FAULT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => onKind(k)}
              className={`flex items-center gap-2.5 rounded-lg px-3 text-left text-small ${touch ? 'min-h-11' : 'min-h-9'} ${kind === k ? 'bg-accent-soft font-medium text-accent-ink' : 'hover:bg-panel-2'}`}
            >
              <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${kind === k ? 'border-accent' : 'border-line-2'}`}>
                {kind === k && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              {tr.fault.kinds[k]}
            </button>
          ))}
        </span>
      </Step>
      <Step n={3} title={t.evidence}>
        {log.length === 0 ? (
          <span className="text-small text-muted">{t.noLog}</span>
        ) : (
          <span className="flex flex-col">
            {log.map((e, i) => (
              <label key={e.key} className={`flex cursor-pointer items-center gap-2.5 border-t border-line text-small ${touch ? 'min-h-11' : 'min-h-8'}`}>
                <input type="checkbox" checked={evidence.includes(e.key)} onChange={(ev) => onEvidence(e.key, ev.target.checked)} className="h-4 w-4 accent-accent" />
                <span className="w-4 shrink-0 text-label text-muted tabular">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono">{e.name}</span>
                <b className="shrink-0 font-mono font-semibold tabular">{e.text}</b>
              </label>
            ))}
          </span>
        )}
      </Step>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!where || !kind}
          onClick={onSubmit}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-small font-semibold text-white hover:brightness-110 disabled:opacity-50 ${touch ? 'h-11' : 'h-[42px]'}`}
        >
          <Icon name="flag" className="h-4 w-4" />
          {t.submit}
        </button>
        <button type="button" onClick={onCancel} className={`shrink-0 rounded-xl border border-line-2 px-3.5 text-small font-medium hover:bg-panel-2 ${touch ? 'h-11' : 'h-[42px]'}`}>
          {t.cancel}
        </button>
      </div>
      <p className="m-0 text-label leading-snug text-muted">{t.note}</p>
    </section>
  );
}

export function FoundCard({
  title,
  text,
  decisive,
  counts,
  repaired,
  onRepair,
  onReport,
  onAgain,
}: {
  title: string;
  text: string;
  /** "Belirleyici ölçüm: …" ya da öğrencinin gerekçesi. */
  decisive: string | null;
  counts: { log: number; reports: number; hints: number; evidence: number };
  repaired: boolean;
  onRepair: () => void;
  onReport: () => void;
  onAgain: (() => void) | null;
}) {
  const t = tr.fault.found;
  const touch = useTouchUi();
  const tile = (label: string, value: string) => (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg bg-panel-2 px-2.5 py-2">
      <span className="truncate text-[11px] text-muted">{label}</span>
      <b className="font-mono text-small font-semibold tabular">{value}</b>
    </span>
  );
  return (
    <section data-notebook="task" aria-label={t.kicker} className="flex shrink-0 flex-col gap-3 rounded-xl border border-ok-line bg-panel p-4">
      <span className="flex items-center gap-1.5 text-label font-semibold text-ok-ink">
        <Icon name="check" className="h-4 w-4" />
        {t.kicker}
      </span>
      <h2 className="m-0 text-[18px] leading-snug font-semibold">{title}</h2>
      <p className="m-0 text-small leading-relaxed text-ink-2">{text}</p>
      {decisive && <p className="m-0 text-small leading-relaxed text-ink-2">{decisive}</p>}
      <span className="flex gap-2">
        {tile(t.stats.log, String(counts.log))}
        {tile(t.stats.reports, String(counts.reports))}
        {tile(t.stats.hints, String(counts.hints))}
        {tile(t.stats.evidence, t.evidenceCount(counts.evidence))}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onRepair}
          disabled={repaired}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl text-small font-semibold ${touch ? 'h-11' : 'h-[42px]'} ${repaired ? 'bg-ok-soft text-ok-ink' : 'bg-accent text-white hover:brightness-110'}`}
        >
          <Icon name="check" className="h-4 w-4" />
          {repaired ? t.repaired : t.repair}
        </button>
        <button type="button" onClick={onReport} className={`flex shrink-0 items-center gap-1.5 rounded-xl border border-line-2 px-3 text-small font-medium hover:bg-panel-2 ${touch ? 'h-11' : 'h-[42px]'}`}>
          <Icon name="download" className="h-4 w-4" />
          {t.report}
        </button>
      </span>
      {onAgain && (
        <button type="button" onClick={onAgain} className={`self-start text-small font-medium text-accent-ink hover:underline ${touch ? 'min-h-11' : ''}`}>
          {t.again}
        </button>
      )}
    </section>
  );
}
