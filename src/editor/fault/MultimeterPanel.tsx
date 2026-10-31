// Multimetre paneli (B2, R1): tezgâhın sol altında. Kip (V ⎓, V ∿, Ω), büyük okuma, iki ucun yeri
// (satıra tıklayınca uç şemaya koyulur), Ω notu. Telefonda aynı içerik alt sayfada (R5).

import { tr } from '../../i18n/tr';
import type { FaultTools } from '../../model/task';
import { Icon } from '../icons';
import { useTouchUi } from '../touchUi';
import type { MeterMode, ProbeColor } from './meter';

export interface MeterReading {
  /** Sayı ("11,99"; "OL"; "– – –"). */
  readonly value: string;
  /** Birim ("V ⎓", "mV ∿", "kΩ"); okuma yoksa boş. */
  readonly unit: string;
  /** Okunamıyorsa nedeni ("Ω için simülasyonu durdur"). */
  readonly note?: string;
}

export interface MultimeterProps {
  readonly mode: MeterMode;
  readonly onMode: (mode: MeterMode) => void;
  readonly reading: MeterReading;
  readonly red: string | null;
  readonly black: string | null;
  readonly placing: ProbeColor | null;
  readonly onPlace: (color: ProbeColor | null) => void;
  readonly tools: FaultTools;
}

export function MeterModes({ mode, onMode, tools, touch }: Pick<MultimeterProps, 'mode' | 'onMode' | 'tools'> & { touch: boolean }) {
  const t = tr.fault.meter;
  return (
    <span role="radiogroup" aria-label={t.modeLabel} className="flex rounded-[10px] bg-app p-0.5">
      {(['dc', 'ac', 'ohm'] as const).map((m) => {
        const allowed = m === 'ohm' ? tools.resistance : tools.voltage;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            aria-label={t.modeNames[m]}
            disabled={!allowed}
            onClick={() => onMode(m)}
            className={`flex-1 rounded-lg font-mono text-small disabled:opacity-40 ${touch ? 'h-11' : 'h-9'} ${mode === m ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
          >
            {t.modes[m]}
          </button>
        );
      })}
    </span>
  );
}

export function MeterDisplay({ reading, big = false }: { reading: MeterReading; big?: boolean }) {
  return (
    <span
      role="img"
      aria-label={tr.fault.meter.readingLabel(reading.unit ? `${reading.value} ${reading.unit}` : reading.value)}
      className={`flex items-baseline justify-end gap-2 rounded-xl bg-lcd-bg px-4 font-mono text-lcd-fg tabular ${big ? 'py-3' : 'py-2.5'}`}
    >
      <span className={`leading-none font-medium tracking-tight text-white ${big ? 'text-[44px]' : 'text-[40px]'}`}>{reading.value}</span>
      <span className="w-12 shrink-0 text-small text-lcd-fg">{reading.unit}</span>
    </span>
  );
}

export function MultimeterPanel(props: MultimeterProps) {
  const t = tr.fault.meter;
  const touch = useTouchUi();
  const row = (color: ProbeColor, where: string | null) => {
    const placing = props.placing === color;
    return (
      <button
        type="button"
        aria-pressed={placing}
        aria-label={t.place(color === 'red' ? t.red : t.black, where)}
        onClick={() => props.onPlace(placing ? null : color)}
        className={`flex items-center gap-2 rounded-lg px-1.5 text-left text-small hover:bg-panel-2 ${touch ? 'min-h-11' : 'min-h-7'} ${placing ? 'bg-accent-soft' : ''}`}
      >
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${color === 'red' ? 'bg-danger' : 'bg-ink'}`} />
        <span className="w-14 shrink-0 text-ink-2">{color === 'red' ? t.red : t.black}</span>
        <span className={`min-w-0 flex-1 truncate font-mono ${placing ? 'text-accent-ink' : where ? 'text-ink' : 'text-muted'}`}>{placing ? t.choose : (where ?? t.unplaced)}</span>
      </button>
    );
  };
  return (
    <section aria-label={t.title} className="flex w-[300px] flex-col gap-2.5 rounded-xl border border-line bg-panel p-3.5 shadow-lg">
      <span className="flex items-center gap-2">
        <Icon name="multimeter" className="h-4 w-4 text-ink" />
        <span className="flex-1 text-small font-semibold">{t.title}</span>
        <span className="text-label text-muted">{t.internal}</span>
      </span>
      <MeterModes mode={props.mode} onMode={props.onMode} tools={props.tools} touch={touch} />
      <MeterDisplay reading={props.reading} />
      <span className="flex flex-col">
        {row('red', props.red)}
        {row('black', props.black)}
      </span>
      <p className={`m-0 text-label leading-snug ${props.reading.note ? 'text-warn' : 'text-muted'}`}>{props.reading.note ?? t.ohmNote}</p>
    </section>
  );
}
