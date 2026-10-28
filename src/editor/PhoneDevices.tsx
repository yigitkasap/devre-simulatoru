// Fonksiyon üreteci ve DC güç kaynağının denetimleri (tasarım: P09; v3'te defterin cihaz kartlarında):
// dalga biçimi, frekans, genlik, kayma; iki kanallı güç kaynağının gerilim ve akım sınırı. Dokunmatikte
// düğmeler 44 px. Ayarlar parçanın özelliklerinde saklanır (kaydedilir, paylaşılır, geri alınabilir;
// simülasyonu durdurmaz).

import type { ReactNode } from 'react';
import { tr } from '../i18n/tr';
import { CATALOG, type NumberPropDef } from '../model/catalog';
import type { Part } from '../model/types';
import { WAVEFORMS, type Waveform } from '../sim/devices/acsource';
import type { DeviceStatus } from '../sim/devices';
import { dcsupplySettings } from '../sim/devices/dcsupply';
import { FUNCGEN_LIMITS, funcgenSettings } from '../sim/devices/funcgen';
import type { PropValue } from '../sim/netlist';
import { formatEditable, formatNumber, formatSI } from '../sim/units';
import { validateNumber } from './propertyForm';
import { Jack, Lcd, StatusLamp, Stepper, step125, stepLinear } from './RackControls';
import { HintText } from './HintStrip';

function numberDef(part: Part, key: string): NumberPropDef {
  const def = CATALOG[part.type].propDefs.find((p) => p.key === key);
  if (!def || def.kind !== 'number') throw new Error(`${part.type}.${key} sayı alanı değil`);
  return def;
}

function typed(part: Part, key: string, onChange: (patch: Record<string, PropValue>) => void) {
  return (text: string): boolean => {
    const result = validateNumber(numberDef(part, key), text);
    if ('error' in result) return false;
    onChange({ [key]: result.value });
    return true;
  };
}

function Label({ children, panel }: { children: ReactNode; panel?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 text-label font-semibold text-ink-2">
      {children}
      {panel && <small className="font-mono text-[11px] font-medium text-muted">{panel}</small>}
    </span>
  );
}

/** Açma/kapama satırı (anahtar görünümünde). */
function ToggleRow({ label, note, checked, onChange, touch = true }: { label: ReactNode; note?: string; checked: boolean; onChange: (on: boolean) => void; touch?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-3 text-left ${touch ? 'min-h-11 text-[15px]' : 'min-h-9 text-sm'}`}
    >
      <span>
        {label}
        {note && <span className="block text-[12.5px] text-muted">{note}</span>}
      </span>
      <span className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${checked ? 'bg-ok' : 'bg-line-2'}`} aria-hidden="true">
        <i className={`absolute top-[3px] block h-6 w-6 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[23px]' : 'left-[3px]'}`} />
      </span>
    </button>
  );
}

function Jacks({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{tr.phone.jacks}</Label>
      <div className="flex flex-wrap gap-2 [&>button]:min-h-11 [&>button]:min-w-11">{children}</div>
    </div>
  );
}

// --- Fonksiyon üreteci (P09) ---------------------------------------------------------------

const WAVE_PATHS: Record<Waveform, string> = {
  sine: 'M2 12c2.5-8 5-8 7.5 0s5 8 7.5 0 3-5 5-5',
  square: 'M2 17V7h7v10h7V7h6',
  triangle: 'M2 17l5-10 5 10 5-10 5 10',
};

export function FuncGenControls({
  part,
  output,
  onChange,
  onJack,
  touch = true,
}: {
  part: Part;
  output: number | null;
  onChange: (patch: Record<string, PropValue>) => void;
  onJack: (pin: number) => void;
  /** Telefon: 44 px dokunma hedefleri; defter kartında (masaüstü) sıkı. */
  touch?: boolean;
}) {
  const s = funcgenSettings(part.props);
  const L = FUNCGEN_LIMITS;
  const freq = formatSI(s.frequency, 'Hz', { digits: 4 });
  const [freqValue, freqUnit] = [freq.slice(0, freq.lastIndexOf(' ')), freq.slice(freq.lastIndexOf(' ') + 1)];
  const duty = Math.round(s.duty * 100);
  const amplitudeStep = (direction: 1 | -1) => (s.amplitude < 1 || (s.amplitude === 1 && direction < 0) ? 0.1 : 0.5);
  const clampFreq = (f: number) => Math.min(L.maxFrequency, Math.max(L.minFrequency, Number(f.toPrecision(6))));
  return (
    <>
      <div
        role="img"
        aria-label={`${tr.rack.frequency}: ${freq}`}
        className="flex items-baseline justify-between rounded-[10px] bg-lcd-bg px-3.5 py-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)]"
      >
        <span className="text-label text-lcd-dim">{tr.rack.frequency}</span>
        <span className="font-mono text-lcd-fg tabular">
          <span className="text-[30px] leading-9">{freqValue}</span>
          <span className="text-[15px]"> {freqUnit}</span>
        </span>
      </div>
      <div role="radiogroup" aria-label={tr.phone.waveform} className="flex gap-2">
        {WAVEFORMS.map((w) => {
          const checked = s.waveform === w;
          return (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => !checked && onChange({ waveform: w })}
              className={`flex min-w-0 flex-1 ${touch ? 'h-14' : 'h-12'} flex-col items-center justify-center gap-0.5 rounded-[10px] text-[13px] ${
                checked ? 'border-2 border-ink bg-panel font-semibold' : 'border border-rack-line bg-key font-medium'
              }`}
            >
              <svg width="24" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={WAVE_PATHS[w]} />
              </svg>
              {tr.properties.optionLabel('waveform', w)}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        <Label panel={`FREQ · ${tr.phone.freqRange}`}>{tr.rack.frequency}</Label>
        <Stepper
          touch={touch}
          label={tr.rack.frequency}
          text={freq}
          canDown={s.frequency > L.minFrequency}
          canUp={s.frequency < L.maxFrequency}
          onStep={(d) => onChange({ frequency: step125(s.frequency, d, L.minFrequency, L.maxFrequency) })}
          editText={formatEditable(s.frequency)}
          onType={typed(part, 'frequency', onChange)}
          outer={{
            down: { glyph: '÷10', label: tr.phone.freqDiv10, disabled: s.frequency <= L.minFrequency, onClick: () => onChange({ frequency: clampFreq(s.frequency / 10) }) },
            up: { glyph: '×10', label: tr.phone.freqTimes10, disabled: s.frequency >= L.maxFrequency, onClick: () => onChange({ frequency: clampFreq(s.frequency * 10) }) },
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label panel={`${tr.rack.amplitudePanel} · ${tr.phone.amplitudeNote}`}>{tr.rack.amplitude}</Label>
        <Stepper
          touch={touch}
          label={tr.rack.amplitude}
          text={formatSI(s.amplitude, 'V', { digits: 3 })}
          canDown={s.amplitude > 0}
          canUp={s.amplitude < L.maxAmplitude}
          onStep={(d) => onChange({ amplitude: stepLinear(s.amplitude, d, amplitudeStep(d), 0, L.maxAmplitude) })}
          editText={formatEditable(s.amplitude)}
          onType={typed(part, 'amplitude', onChange)}
        />
      </div>
      <div className="flex gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label panel="OFFSET">{tr.rack.offset}</Label>
          <Stepper
            touch={touch}
            label={tr.rack.offset}
            text={`${s.offset > 0 ? '+' : ''}${formatNumber(s.offset, 1)} V`}
            canDown={s.offset > -L.maxOffset}
            canUp={s.offset < L.maxOffset}
            onStep={(d) => onChange({ offset: stepLinear(s.offset, d, 0.5, -L.maxOffset, L.maxOffset) })}
            editText={formatEditable(s.offset)}
            onType={typed(part, 'offset', onChange)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label panel="DUTY">{tr.rack.duty}</Label>
          <Stepper
            touch={touch}
            label={tr.rack.duty}
            text={`%${duty}`}
            canDown={duty > L.minDuty}
            canUp={duty < L.maxDuty}
            onStep={(d) => onChange({ duty: stepLinear(duty, d, 5, L.minDuty, L.maxDuty) })}
            editText={String(duty)}
            onType={typed(part, 'duty', onChange)}
          />
        </div>
      </div>
      <ToggleRow
        label={
          <>
            {tr.phone.attenuator} <span className="text-[12.5px] text-muted">{tr.phone.attenuatorNote}</span>
          </>
        }
        checked={s.attenuate}
        onChange={(attenuate) => onChange({ attenuate })}
        touch={touch}
      />
      <ToggleRow label={tr.rack.earthed} note={tr.phone.earthedNote} checked={s.earthed} onChange={(earthed) => onChange({ earthed })} touch={touch} />
      <p className="rounded-[10px] bg-panel px-3 py-2.5 text-[13px] leading-normal text-ink-2">
        <HintText text={output === null ? tr.phone.outputStopped : tr.phone.output(formatSI(output, 'V', { digits: 3 }))} />
      </p>
      <Jacks>
        <Jack color="var(--color-danger)" name="OUT" label={tr.rack.jack(`${part.label} OUT`)} onClick={() => onJack(0)} />
        <Jack color="#2c3846" name="TTL" label={tr.rack.jack(`${part.label} TTL`)} onClick={() => onJack(1)} />
        <Jack color="#2c3846" ring={s.earthed} name="COM" earthed={s.earthed} label={tr.rack.jack(`${part.label} COM`)} onClick={() => onJack(2)} />
      </Jacks>
    </>
  );
}

// --- DC güç kaynağı ------------------------------------------------------------------------

export function DcSupplyControls({
  part,
  status,
  running,
  connected,
  onChange,
  onJack,
  touch = true,
}: {
  part: Part;
  status: DeviceStatus;
  running: boolean;
  connected: readonly [boolean, boolean];
  onChange: (patch: Record<string, PropValue>) => void;
  onJack: (pin: number) => void;
  /** Telefon: 44 px dokunma hedefleri; defter kartında (masaüstü) sıkı. */
  touch?: boolean;
}) {
  const s = dcsupplySettings(part.props);
  return (
    <>
      {([0, 1] as const).map((i) => {
        const n = i + 1;
        const out = status.outputs?.[i];
        const cc = status.currentLimited?.[i] === true;
        const voltage = running && out ? out.voltage : s.voltage[i];
        const current = running && out ? out.current : 0;
        const setVoltage = s.voltage[i];
        const limit = s.currentLimit[i];
        const voltageKey = `voltage${n}`;
        const limitKey = `currentLimit${n}`;
        return (
          <section key={i} className={`flex flex-col gap-2 ${i === 1 ? 'border-t border-rack-line pt-3' : ''}`} aria-label={tr.rack.output(n)}>
            <div className="flex items-center justify-between">
              <b className="text-sm font-semibold">{tr.rack.output(n)}</b>
              <span className="flex gap-3">
                <StatusLamp on={running && connected[i] && !cc} tone="green">
                  CV
                </StatusLamp>
                <StatusLamp on={running && cc} tone="red">
                  CC
                </StatusLamp>
              </span>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Lcd value={formatNumber(Math.abs(voltage), 2)} unit="V" label={`${tr.rack.output(n)}: ${formatNumber(Math.abs(voltage), 2)} V`} />
              </div>
              <div className="flex-1">
                <Lcd value={formatNumber(Math.abs(current), 3)} unit="A" label={`${tr.rack.output(n)}: ${formatNumber(Math.abs(current), 3)} A`} />
              </div>
            </div>
            <div className="flex gap-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label>{tr.rack.voltage}</Label>
                <Stepper
                  touch={touch}
                  label={`${tr.rack.output(n)} ${tr.rack.voltage.toLocaleLowerCase('tr-TR')}`}
                  text={formatNumber(setVoltage, 2)}
                  canDown={setVoltage > 0}
                  canUp={setVoltage < 30}
                  onStep={(d) => onChange({ [voltageKey]: stepLinear(setVoltage, d, 0.5, 0, 30) })}
                  editText={formatEditable(setVoltage)}
                  onType={typed(part, voltageKey, onChange)}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label>{tr.rack.currentLimit}</Label>
                <Stepper
                  touch={touch}
                  label={`${tr.rack.output(n)} ${tr.rack.currentLimit.toLocaleLowerCase('tr-TR')}`}
                  text={formatSI(limit, 'A', { trim: true })}
                  canDown={limit > 1e-3}
                  canUp={limit < 5}
                  onStep={(d) => onChange({ [limitKey]: step125(limit, d, 1e-3, 5) })}
                  editText={formatEditable(limit)}
                  onType={typed(part, limitKey, onChange)}
                />
              </div>
            </div>
            {running && cc && (
              <p role="status" className="rounded-md border border-danger-line bg-danger-soft px-2.5 py-1.5 text-[13px] leading-snug text-danger-ink">
                {tr.rack.ccNote(formatSI(setVoltage, 'V', { digits: 3 }), formatSI(Math.abs(voltage), 'V', { digits: 3 }))}
              </p>
            )}
            {!connected[i] && <span className="text-[13px] text-muted">{tr.rack.notConnected}</span>}
            <div className="flex gap-2">
              <Jack color="var(--color-danger)" name={`${n}+`} label={tr.rack.jack(`${part.label} ${n}+`)} onClick={() => onJack(i * 2)} />
              <Jack color="#2c3846" name={`${n}−`} label={tr.rack.jack(`${part.label} ${n}−`)} onClick={() => onJack(i * 2 + 1)} />
            </div>
          </section>
        );
      })}
    </>
  );
}
