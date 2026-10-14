// Fonksiyon üreteci ve DC güç kaynağı ön panelleri (tasarım: M06a, DS-Cihaz). Bütün ayarlar burada;
// değerler parçanın özelliklerinde saklanır (kaydedilir, paylaşılır, geri alınabilir; simülasyonu
// durdurmaz). Kademeli ayarların değerine tıklayınca SI önekli değer yazılabilir.

import type { CSSProperties } from 'react';
import { tr } from '../i18n/tr';
import { CATALOG, type NumberPropDef } from '../model/catalog';
import type { Part } from '../model/types';
import { WAVEFORMS, type Waveform } from '../sim/devices/acsource';
import { dcsupplySettings } from '../sim/devices/dcsupply';
import type { DeviceStatus } from '../sim/devices';
import { FUNCGEN_LIMITS, funcgenSettings } from '../sim/devices/funcgen';
import type { PropValue } from '../sim/netlist';
import { formatEditable, formatNumber, formatSI } from '../sim/units';
import { validateNumber } from './propertyForm';
import { Face, Jack, LampButton, Lcd, PanelLabel, StatusLamp, Stepper, step125, stepLinear } from './RackControls';

/** "1,000 kHz" → ["1,000", "kHz"]. */
function split(text: string): [string, string] {
  const i = text.lastIndexOf(' ');
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1)];
}

/** Katalogdaki sayı alanının tanımı (yazılan değerin doğrulaması için). */
function numberDef(part: Part, key: string): NumberPropDef {
  const def = CATALOG[part.type].propDefs.find((p) => p.key === key);
  if (!def || def.kind !== 'number') throw new Error(`${part.type}.${key} sayı alanı değil`);
  return def;
}

/** Yazılan değeri doğrulayıp uygular; geçersizse false. */
function typed(part: Part, key: string, onChange: (patch: Record<string, PropValue>) => void) {
  return (text: string): boolean => {
    const result = validateNumber(numberDef(part, key), text);
    if ('error' in result) return false;
    onChange({ [key]: result.value });
    return true;
  };
}

const WAVE_PATHS: Record<Waveform, string> = {
  sine: 'M2 12c2.5-8 5-8 7.5 0s5 8 7.5 0 3-5 5-5',
  square: 'M2 17V7h7v10h7V7h6',
  triangle: 'M2 17l5-10 5 10 5-10 5 10',
};

export interface FuncGenFaceProps {
  readonly part: Part;
  readonly onChange: (patch: Record<string, PropValue>) => void;
  /** Jak: tuvalde ilgili ucu göster (0 = OUT, 1 = TTL, 2 = COM). */
  readonly onJack: (pin: number) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function FuncGenFace({ part, onChange, onJack, className, style }: FuncGenFaceProps) {
  const s = funcgenSettings(part.props);
  const L = FUNCGEN_LIMITS;
  const [freqValue, freqUnit] = split(formatSI(s.frequency, 'Hz', { digits: 4 }));
  const duty = Math.round(s.duty * 100);
  const amplitudeStep = (direction: 1 | -1) => (s.amplitude < 1 || (s.amplitude === 1 && direction < 0) ? 0.1 : 0.5);

  return (
    <Face title={tr.rack.funcgen} label={part.label} ariaLabel={`${tr.rack.funcgen} ${part.label}`} className={className} style={style}>
      <div className="flex shrink-0 flex-col gap-2 px-3 py-2.5">
        <Lcd value={freqValue} unit={freqUnit} size="lg" label={`${tr.rack.frequency}: ${freqValue} ${freqUnit}`} />
        <div className="flex justify-between gap-2">
          {WAVEFORMS.map((w) => (
            <LampButton key={w} label={tr.properties.optionLabel('waveform', w)} pressed={s.waveform === w} onClick={() => onChange({ waveform: w })}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={WAVE_PATHS[w]} />
              </svg>
            </LampButton>
          ))}
          <LampButton label={tr.rack.attenuator} pressed={s.attenuate} lamp="amber" wide onClick={() => onChange({ attenuate: !s.attenuate })}>
            −20dB
          </LampButton>
        </div>
        <PanelLabel panel="FREQ">{tr.rack.frequency}</PanelLabel>
        <Stepper
          label={tr.rack.frequency}
          text={formatSI(s.frequency, 'Hz', { digits: 4 })}
          canDown={s.frequency > L.minFrequency}
          canUp={s.frequency < L.maxFrequency}
          onStep={(d) => onChange({ frequency: step125(s.frequency, d, L.minFrequency, L.maxFrequency) })}
          editText={formatEditable(s.frequency)}
          onType={typed(part, 'frequency', onChange)}
        />
        <PanelLabel panel={tr.rack.amplitudePanel}>{tr.rack.amplitude}</PanelLabel>
        <Stepper
          label={tr.rack.amplitude}
          text={formatSI(s.amplitude, 'V', { digits: 3 })}
          canDown={s.amplitude > 0}
          canUp={s.amplitude < L.maxAmplitude}
          onStep={(d) => onChange({ amplitude: stepLinear(s.amplitude, d, amplitudeStep(d), 0, L.maxAmplitude) })}
          editText={formatEditable(s.amplitude)}
          onType={typed(part, 'amplitude', onChange)}
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <PanelLabel panel="OFFSET">{tr.rack.offset}</PanelLabel>
            <Stepper
              label={tr.rack.offset}
              text={`${s.offset > 0 ? '+' : ''}${formatNumber(s.offset, 1)} V`}
              canDown={s.offset > -L.maxOffset}
              canUp={s.offset < L.maxOffset}
              onStep={(d) => onChange({ offset: stepLinear(s.offset, d, 0.5, -L.maxOffset, L.maxOffset) })}
              editText={formatEditable(s.offset)}
              onType={typed(part, 'offset', onChange)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <PanelLabel panel="DUTY">{tr.rack.duty}</PanelLabel>
            <Stepper
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
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1">
          <div className="flex items-end gap-2">
            <Jack color="var(--color-danger)" name="OUT" label={tr.rack.jack(`${part.label} OUT`)} onClick={() => onJack(0)} />
            <Jack color="#2c3846" name="TTL" label={tr.rack.jack(`${part.label} TTL`)} onClick={() => onJack(1)} />
            <Jack color="#2c3846" ring={s.earthed} name="COM" earthed={s.earthed} label={tr.rack.jack(`${part.label} COM`)} onClick={() => onJack(2)} />
          </div>
          <span className="font-mono text-label text-muted">50 Ω</span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-label font-semibold">
          <input
            type="checkbox"
            checked={s.earthed}
            onChange={(e) => onChange({ earthed: e.target.checked })}
            className="h-[18px] w-[18px] accent-earth"
          />
          {tr.rack.earthed}
        </label>
      </div>
    </Face>
  );
}

export interface DcSupplyFaceProps {
  readonly part: Part;
  /** Simülasyon çalışmıyorsa boş. */
  readonly status: DeviceStatus;
  readonly running: boolean;
  /** Çıkışın uçlarından biri devreye bağlı mı (1. ve 2. çıkış). */
  readonly connected: readonly [boolean, boolean];
  readonly onChange: (patch: Record<string, PropValue>) => void;
  /** Jak: tuvalde ilgili ucu göster (0 = 1+, 1 = 1−, 2 = 2+, 3 = 2−). */
  readonly onJack: (pin: number) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function DcSupplyFace({ part, status, running, connected, onChange, onJack, className, style }: DcSupplyFaceProps) {
  const s = dcsupplySettings(part.props);
  return (
    <Face title={tr.rack.dcsupply} label={part.label} ariaLabel={`${tr.rack.dcsupply} ${part.label}`} className={className} style={style}>
      <div className="flex shrink-0 flex-col gap-2.5 px-3 py-2.5">
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
            <section key={i} className={`flex flex-col gap-1.5 ${i === 1 ? 'border-t border-line-2 pt-2' : ''}`} aria-label={tr.rack.output(n)}>
              <div className="flex items-center justify-between">
                <b className="text-[12.5px] font-semibold">{tr.rack.output(n)}</b>
                <span className="flex gap-2.5">
                  <StatusLamp on={running && connected[i] && !cc} tone="green">
                    CV
                  </StatusLamp>
                  <StatusLamp on={running && cc} tone="red">
                    CC
                  </StatusLamp>
                </span>
              </div>
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <Lcd value={formatNumber(Math.abs(voltage), 2)} unit="V" label={`${tr.rack.output(n)}: ${formatNumber(Math.abs(voltage), 2)} V`} />
                </div>
                <div className="flex-1">
                  <Lcd value={formatNumber(Math.abs(current), 3)} unit="A" label={`${tr.rack.output(n)}: ${formatNumber(Math.abs(current), 3)} A`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex flex-col gap-1">
                  <PanelLabel>{tr.rack.voltage}</PanelLabel>
                  <Stepper
                    label={`${tr.rack.output(n)} ${tr.rack.voltage.toLocaleLowerCase('tr-TR')}`}
                    text={formatNumber(setVoltage, 2)}
                    canDown={setVoltage > 0}
                    canUp={setVoltage < 30}
                    onStep={(d) => onChange({ [voltageKey]: stepLinear(setVoltage, d, 0.5, 0, 30) })}
                    editText={formatEditable(setVoltage)}
                    onType={typed(part, voltageKey, onChange)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <PanelLabel>{tr.rack.currentLimit}</PanelLabel>
                  <Stepper
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
                <p role="status" className="rounded-sm border border-danger-line bg-danger-soft px-2 py-1 text-[11.5px] leading-snug text-danger-ink">
                  {tr.rack.ccNote(formatSI(setVoltage, 'V', { digits: 3 }), formatSI(Math.abs(voltage), 'V', { digits: 3 }))}
                </p>
              )}
              {!connected[i] && <span className="text-[11.5px] text-muted">{tr.rack.notConnected}</span>}
              <div className="flex gap-1.5">
                <Jack color="var(--color-danger)" name={`${n}+`} label={tr.rack.jack(`${part.label} ${n}+`)} onClick={() => onJack(i * 2)} />
                <Jack color="#2c3846" name={`${n}−`} label={tr.rack.jack(`${part.label} ${n}−`)} onClick={() => onJack(i * 2 + 1)} />
              </div>
            </section>
          );
        })}
      </div>
    </Face>
  );
}
