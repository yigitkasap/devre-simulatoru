// Telefonda arıza bulma (B2, R5): defterin yerinde. Üstte "Arıza bul · N ölçüm" ve Belirti; büyük
// okuma, kip seçimi, iki uç düğmesi (önce ucu seç, sonra şemada dokun), ölçüm günlüğü; altta sabit
// İpucu ve Arızayı bildir. Kablo bağla bu kipte yok.

import { useState } from 'react';
import { tr } from '../../i18n/tr';
import type { FaultTools } from '../../model/task';
import { Icon } from '../icons';
import { Rich } from '../Rich';
import { LogRow } from './FaultCard';
import type { MeterMode, ProbeColor } from './meter';
import { MeterDisplay, MeterModes, type MeterReading } from './MultimeterPanel';
import type { FaultSession } from './session';

export function PhoneFaultSheet({
  symptom,
  session,
  askExpected,
  mode,
  onMode,
  reading,
  red,
  black,
  placing,
  onPlace,
  tools,
  wrong,
  onExpected,
  onHint,
  onReport,
}: {
  symptom: string;
  session: FaultSession;
  askExpected: boolean;
  mode: MeterMode;
  onMode: (mode: MeterMode) => void;
  reading: MeterReading;
  red: string | null;
  black: string | null;
  placing: ProbeColor | null;
  onPlace: (color: ProbeColor | null) => void;
  tools: FaultTools;
  wrong: boolean;
  onExpected: (key: string, value: number | null) => void;
  onHint: () => void;
  onReport: () => void;
}) {
  const t = tr.fault;
  const [showSymptom, setShowSymptom] = useState(false);
  const probe = (color: ProbeColor, where: string | null) => {
    const on = placing === color;
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={t.meter.place(color === 'red' ? t.meter.red : t.meter.black, where)}
        onClick={() => onPlace(on ? null : color)}
        className={`flex min-h-[60px] min-w-0 flex-1 flex-col items-start justify-center gap-0.5 rounded-xl border-2 px-3 text-left ${on ? (color === 'red' ? 'border-danger bg-danger-soft' : 'border-ink bg-panel-2') : 'border-line bg-panel'}`}
      >
        <span className={`text-[11px] font-semibold tracking-wide uppercase ${color === 'red' ? 'text-danger-ink' : 'text-ink-2'}`}>
          {color === 'red' ? t.meter.redTip : t.meter.blackTip}
          {on ? ` · ${t.phone.tap}` : ''}
        </span>
        <span className="w-full truncate font-mono text-small">{where ?? t.meter.unplaced}</span>
      </button>
    );
  };
  return (
    <section aria-label={t.card.label(t.card.kicker)} className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <Icon name="wrench" className="h-4 w-4 text-warn" />
          <span className="flex-1 text-small font-semibold text-warn">{t.phone.title(session.log.length)}</span>
          <button type="button" aria-expanded={showSymptom} onClick={() => setShowSymptom((s) => !s)} className="min-h-11 px-1 text-small font-semibold text-accent-ink">
            {t.phone.symptom}
          </button>
        </div>
        {showSymptom && (
          <p className="m-0 rounded-lg bg-panel-2 px-3 py-2 text-small leading-snug text-ink-2">
            <Rich text={symptom ? `${symptom} ${t.card.intro}` : t.card.intro} />
          </p>
        )}
        <MeterDisplay reading={reading} big />
        {reading.note && <p className="m-0 -mt-1 text-label text-warn">{reading.note}</p>}
        <MeterModes mode={mode} onMode={onMode} tools={tools} touch />
        <span className="flex gap-2">
          {probe('red', red)}
          {probe('black', black)}
        </span>
        {session.hints > 0 && (
          <ol aria-label={t.hints.label} className="m-0 flex list-none flex-col gap-1.5 rounded-lg bg-accent-soft p-2.5">
            {t.hints.list.slice(0, session.hints).map((hint) => (
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
            {t.report.wrong}
          </p>
        )}
        <span className="text-label font-semibold tracking-wide text-muted uppercase">{t.card.log}</span>
        {session.log.length === 0 ? (
          <p className="m-0 text-small leading-snug text-muted">{t.card.empty}</p>
        ) : (
          <ol aria-label={t.card.log} className="m-0 flex list-none flex-col p-0">
            {session.log.map((entry, i) => (
              <LogRow key={entry.key} n={i + 1} entry={entry} askExpected={askExpected} touch onExpected={(v) => onExpected(entry.key, v)} />
            ))}
          </ol>
        )}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-line bg-panel px-4 pt-2.5" style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={onHint}
          disabled={session.hints >= t.hints.list.length}
          className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-line-2 px-4 text-small font-medium disabled:opacity-50"
        >
          <Icon name="bulb" className="h-4 w-4" />
          {t.hints.button}
        </button>
        <button type="button" onClick={onReport} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-small font-semibold text-white">
          <Icon name="flag" className="h-4 w-4" />
          {t.report.open}
        </button>
      </div>
    </section>
  );
}
