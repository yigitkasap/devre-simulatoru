// Multimetre parçasının defter kartı (Parça Dalga 1, Y3): arıza bulmadaki multimetreyle (B2) aynı
// gösterge. Kip (V ⎓, V ∿, A, Ω), büyük okuma, iki ucun bağlı olduğu düğüm, not ve iç direnç.

import { tr } from '../i18n/tr';
import { withProp } from '../model/catalog';
import type { Part } from '../model/types';
import { AMMETER_DEFAULTS, MULTIMETER_MODES, multimeterMode, VOLTMETER_DEFAULTS, type MultimeterMode } from '../sim/devices';
import { formatNumber, formatSI } from '../sim/units';
import { OHM_TEST_VOLTAGE } from './fault/meter';
import { MeterDisplay, type MeterReading } from './fault/MultimeterPanel';
import { useTouchUi } from './touchUi';
import type { SimFrame, SimStatus } from './useSimulation';

const t = tr.fault.meter;

/** Gösterge metnini ("5,000 V", "≈ 1,08 mA", "230,0 V~") sayı ve birime ayırır; kip işareti birimin yanında. */
function split(text: string, mode: MultimeterMode): MeterReading {
  const clean = text.replace(/^≈ /, '').replace(/~$/, '');
  const cut = clean.lastIndexOf(' ');
  const unit = clean.slice(cut + 1);
  return { value: clean.slice(0, cut), unit: mode === 'ohm' ? unit : `${unit} ${t.units[mode]}` };
}

/** Kartın okuması: V ve A çalışırken, Ω durmuşken (B2'deki multimetreyle aynı kurallar). */
export function multimeterReading(part: Part, frame: SimFrame | null, status: SimStatus, ohm: string | undefined): MeterReading {
  const mode = multimeterMode(part.props);
  if (mode === 'ohm') {
    if (status !== 'stopped') return { value: t.empty, unit: 'Ω', note: t.ohmRunning };
    return ohm ? split(ohm, mode) : { value: t.empty, unit: 'Ω', note: t.ohmFailed };
  }
  const text = status === 'stopped' ? undefined : frame?.meterTexts.get(part.id);
  const unit = mode === 'a' ? 'A' : 'V';
  return text ? split(text, mode) : { value: t.empty, unit: `${unit} ${t.units[mode]}`, ...(status === 'stopped' ? { note: t.needPlay } : {}) };
}

export function MultimeterCardBody({
  part,
  frame,
  status,
  ohm,
  pinNode,
  onMode,
}: {
  part: Part;
  frame: SimFrame | null;
  status: SimStatus;
  ohm: string | undefined;
  /** Ucun bağlı olduğu düğümün adı ("U2 OUT", "GND1"). */
  pinNode: ((partId: string, pin: number) => string) | undefined;
  onMode: (props: Part['props']) => void;
}) {
  const touch = useTouchUi();
  const mode = multimeterMode(part.props);
  const reading = multimeterReading(part, frame, status, ohm);
  const m = tr.multimeter;
  const internal =
    mode === 'a'
      ? m.internalA(`${formatNumber(AMMETER_DEFAULTS.resistance, 1)} Ω`)
      : mode === 'ohm'
        ? m.testVoltage(`${formatNumber(OHM_TEST_VOLTAGE, 1)} V`)
        : m.internalV(formatSI(VOLTMETER_DEFAULTS.resistance, 'Ω', { trim: true }));
  const probe = (pin: number, label: string) => (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg bg-app px-3 py-2">
      <span className="text-label text-muted">{label}</span>
      <span className="truncate font-mono text-[15px]">{pinNode?.(part.id, pin) ?? '–'}</span>
    </span>
  );
  return (
    <>
      <span role="radiogroup" aria-label={t.modeLabel} className="flex rounded-lg bg-app p-0.5">
        {MULTIMETER_MODES.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={mode === k}
            aria-label={m.modeNames[k]}
            onClick={() => onMode(withProp(part.type, part.props, 'mode', k))}
            className={`flex-1 rounded-lg font-mono text-small ${touch ? 'h-11' : 'h-9'} ${mode === k ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
          >
            {m.modes[k]}
          </button>
        ))}
      </span>
      <MeterDisplay reading={reading} big />
      <span className="flex gap-2">
        {probe(0, m.red)}
        {probe(1, m.black)}
      </span>
      <p className={`m-0 rounded-lg px-3 py-2 text-label leading-snug ${reading.note ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-ink-2'}`}>{reading.note ?? m.note}</p>
      <span className="flex items-baseline justify-between text-small">
        <span className="text-muted">{internal.label}</span>
        <span className="font-mono">{internal.value}</span>
      </span>
    </>
  );
}
