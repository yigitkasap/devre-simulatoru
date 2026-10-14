// Simülasyon sırasında bir parçanın üzerine gelince gösterilen bilgi kutusunun içeriği
// (gerilim, akım, güç ve türe özel ek bilgiler). Saf fonksiyon; arayüzden bağımsız test edilir.

import { tr } from '../i18n/tr';
import type { Part } from '../model/types';
import { METER_MODES } from '../sim/averager';
import {
  acRms,
  AC_SOURCE_DEFAULTS,
  dcsupplySettings,
  funcgenSettings,
  scopeSettings,
  WAVEFORMS,
  type DeviceStatus,
  type Measurement,
} from '../sim/devices';
import { LED_MODELS, type LedColor } from '../sim/devices/led';
import { SWITCH_ON_RESISTANCE } from '../sim/constants';
import { boolProp, numProp, strProp, type Props } from '../sim/netlist';
import { formatNumber, formatSI } from '../sim/units';

/** Ölçü aletinin kipi ve gösterdiği değer (durum yoksa anlık değer). */
function meterValue(props: Props, instantaneous: number, status: DeviceStatus): { ac: boolean; value: number } {
  const ac = strProp(props, 'mode', METER_MODES, 'dc') === 'ac';
  return { ac, value: status.reading ?? (ac ? Math.abs(instantaneous) : instantaneous) };
}

export interface ReadoutRow {
  readonly label: string;
  readonly value: string;
}

export interface Readout {
  readonly title: string;
  readonly rows: readonly ReadoutRow[];
  /** Ek açıklama satırı (ör. Ohm yasası kontrolü). */
  readonly note?: string;
}

const t = tr.readout;
// Satırlardaki değerler 4 anlamlı basamakla (ölçü aletlerinin ekranıyla aynı: 14,46 mA); formül
// notlarındakiler 3 basamakla (okunur kalsın diye).
const v = (x: number) => formatSI(x, 'V', { digits: 4 });
const a = (x: number) => formatSI(x, 'A', { digits: 4 });
const w = (x: number) => formatSI(x, 'W', { digits: 4 });
const vn = (x: number) => formatSI(x, 'V');
const an = (x: number) => formatSI(x, 'A');
const ohm = (x: number) => formatSI(x, 'Ω');
/** Parça değerleri (iç direnç vb.) tuvaldeki etiketlerle aynı biçimde: "1 MΩ", "0,1 Ω". */
const ohmValue = (x: number) => formatSI(x, 'Ω', { trim: true, digits: 4 });

/**
 * Pasif bileşenlerde akım ve gerilim büyüklük olarak gösterilir (yönü akım noktaları gösterir);
 * kaynakta ve ölçü aletlerinde işaret anlamlı olduğu için korunur.
 */
export function partReadout(part: Part, m: Measurement, status: DeviceStatus = {}): Readout | null {
  const title = `${part.label} · ${tr.devices.names[part.type]}`;
  const p = part.props;
  const V = Math.abs(m.voltage);
  const I = Math.abs(m.current);
  const P = Math.abs(m.power);
  switch (part.type) {
    case 'ground':
      return null;
    case 'resistor': {
      const R = numProp(p, 'resistance', 1000);
      return {
        title,
        rows: [
          { label: t.voltage, value: v(V) },
          { label: t.current, value: a(I) },
          { label: t.powerUsed, value: w(P) },
        ],
        // Ohm yasası: hesaplanan V ile I·R aynı çıkmalı.
        note: `V = I · R → ${vn(V)} = ${an(I)} × ${ohm(R)}`,
      };
    }
    case 'battery': {
      const emf = numProp(p, 'voltage', 9);
      const r = numProp(p, 'internalResistance', 0);
      const out = -m.current; // + uçtan dış devreye verilen akım
      const rows: ReadoutRow[] = [
        { label: t.terminalVoltage, value: v(m.voltage) },
        { label: t.outputCurrent, value: a(out) },
        { label: t.powerDelivered, value: w(m.voltage * out) },
      ];
      if (r > 0) rows.push({ label: t.internalLoss, value: w(out * out * r) });
      return {
        title,
        rows,
        ...(r > 0 ? { note: `V = E − I · R_{iç} → ${vn(m.voltage)} = ${vn(emf)} − ${an(out)} × ${ohm(r)}` } : {}),
      };
    }
    case 'acsource': {
      const waveform = strProp(p, 'waveform', WAVEFORMS, AC_SOURCE_DEFAULTS.waveform);
      const peak = numProp(p, 'amplitude', AC_SOURCE_DEFAULTS.amplitude);
      const offset = numProp(p, 'offset', AC_SOURCE_DEFAULTS.offset);
      const f = numProp(p, 'frequency', AC_SOURCE_DEFAULTS.frequency);
      const out = -m.current;
      const formula = t.acFormula[waveform] ?? '';
      return {
        title,
        rows: [
          { label: t.instantVoltage, value: v(m.voltage) },
          { label: t.outputCurrent, value: a(out) },
          { label: t.peakVoltage, value: formatSI(peak, 'V', { trim: true, digits: 4 }) },
          { label: t.rmsVoltage, value: v(acRms(waveform, peak, offset)) },
          { label: t.frequency, value: formatSI(f, 'Hz', { trim: true, digits: 4 }) },
          { label: t.period, value: formatSI(1 / f, 's', { trim: true, digits: 4 }) },
        ],
        note: offset === 0 ? formula : `${formula} ${t.withOffset(vn(offset))}`,
      };
    }
    case 'oscilloscope': {
      const s = scopeSettings(p);
      return {
        title,
        rows: [
          { label: t.channel('A'), value: v(m.voltage) },
          { label: t.channel('B'), value: v(status.reading ?? 0) },
        ],
        note: `${t.scopeInput(s.input === 'real', s.earthed)} ${t.scopeNote}`,
      };
    }
    case 'funcgen': {
      const s = funcgenSettings(p);
      const gain = s.attenuate ? 0.1 : 1;
      return {
        title,
        rows: [
          { label: t.outputVoltage, value: v(m.voltage) },
          { label: t.outputCurrent, value: a(-m.current) },
          { label: t.openCircuit, value: `${formatSI(s.amplitude * gain, 'V', { trim: true, digits: 4 })} tepe-tepe` },
          { label: t.frequency, value: formatSI(s.frequency, 'Hz', { trim: true, digits: 4 }) },
          { label: t.period, value: formatSI(1 / s.frequency, 's', { trim: true, digits: 4 }) },
        ],
        note: `${t.funcgenNote}${s.earthed ? t.funcgenEarthed : ''}`,
      };
    }
    case 'dcsupply': {
      const s = dcsupplySettings(p);
      const outputs = status.outputs ?? [];
      const rows: ReadoutRow[] = outputs.map((o, k) => ({
        label: t.output(k + 1),
        value: `${v(o.voltage)} · ${a(o.current)} · ${status.currentLimited?.[k] ? t.cc : t.cv}`,
      }));
      rows.push(
        ...s.currentLimit.map((limit, k) => ({
          label: `${t.output(k + 1)} · sınır`,
          value: `${formatSI(s.voltage[k]!, 'V', { trim: true })} / ${formatSI(limit, 'A', { trim: true })}`,
        })),
      );
      return { title, rows, note: t.dcsupplyNote };
    }
    case 'capacitor': {
      const C = numProp(p, 'capacitance', 100e-6);
      return {
        title,
        rows: [
          { label: t.voltage, value: v(m.voltage) },
          { label: t.current, value: a(I) },
          { label: t.power, value: w(P) },
          { label: t.energy, value: formatSI(0.5 * C * m.voltage * m.voltage, 'J') },
        ],
        note: m.current > 1e-9 ? t.charging : m.current < -1e-9 ? t.discharging : t.steady,
      };
    }
    case 'diode':
    case 'led': {
      const rows: ReadoutRow[] = [
        { label: t.forwardVoltage, value: v(m.voltage) },
        { label: t.current, value: a(m.current) },
        { label: t.powerUsed, value: w(P) },
      ];
      if (part.type === 'led') {
        const color = strProp(p, 'color', ['red', 'green', 'blue'] as const, 'red') as LedColor;
        const model = LED_MODELS[color];
        if (status.burned) {
          return { title, rows: [{ label: t.state, value: t.burned }], note: t.burnedNote };
        }
        rows.push({ label: t.brightness, value: `%${formatNumber((status.brightness ?? 0) * 100, 0)}` });
        return {
          title,
          rows,
          note: t.ledLimits(formatSI(model.forwardVoltage, 'V', { trim: true }), formatSI(model.maxCurrent, 'A', { trim: true })),
        };
      }
      return { title, rows, note: m.voltage < 0 ? t.reverseBiased : t.forwardBiased };
    }
    case 'zener': {
      const Vz = numProp(p, 'zenerVoltage', 5.1);
      return {
        title,
        rows: [
          { label: t.forwardVoltage, value: v(m.voltage) },
          { label: t.current, value: a(m.current) },
          { label: t.powerUsed, value: w(P) },
        ],
        note: status.breakdown
          ? `${t.zenerBreakdown} (V_{Z} = ${formatSI(Vz, 'V', { trim: true })})`
          : m.voltage < 0
            ? t.zenerOff
            : t.forwardBiased,
      };
    }
    case 'npn':
    case 'pnp': {
      const region = status.region ?? 'active';
      const ib = status.control?.current ?? 0;
      const rows: ReadoutRow[] = [
        { label: t.collectorCurrent, value: a(m.current) },
        { label: t.baseCurrent, value: a(ib) },
        { label: t.vce, value: v(m.voltage) },
        { label: t.vbe, value: v(status.control?.voltage ?? 0) },
      ];
      if (region === 'active' && Math.abs(ib) > 1e-12) rows.push({ label: t.gain, value: formatNumber(m.current / ib, 0) });
      rows.push({ label: t.region, value: t.regions[region] ?? region });
      return { title, rows, note: t.bjtNotes[region] ?? '' };
    }
    case 'njfet':
    case 'pjfet':
    case 'nmos':
    case 'pmos': {
      const region = status.region ?? 'saturation';
      return {
        title,
        rows: [
          { label: t.drainCurrent, value: a(m.current) },
          { label: t.vds, value: v(m.voltage) },
          { label: t.vgs, value: v(status.control?.voltage ?? 0) },
          { label: t.region, value: region === 'saturation' ? `${t.regions.saturation}` : (t.regions[region] ?? region) },
        ],
        note: t.fetNotes[region] ?? '',
      };
    }
    case 'switch': {
      const closed = boolProp(p, 'closed', false);
      return {
        title,
        rows: [
          { label: t.state, value: closed ? t.closed : t.open },
          { label: t.voltageAcross, value: v(V) },
          { label: t.current, value: a(I) },
        ],
        note: closed ? t.switchClosedNote(ohmValue(SWITCH_ON_RESISTANCE)) : t.switchOpenNote,
      };
    }
    case 'voltmeter':
    case 'ammeter': {
      const voltmeter = part.type === 'voltmeter';
      const ideal = boolProp(p, 'ideal', false);
      const R = numProp(p, 'resistance', voltmeter ? 10e6 : 0.1);
      const instantaneous = voltmeter ? m.voltage : m.current;
      const { ac, value } = meterValue(p, instantaneous, status);
      // Gösterge anlık değerden ayrıysa (AC kaynaklı devre ya da AC kipi) ikisi de gösterilir.
      const averaged = ac || Math.abs(value - instantaneous) > 1e-12 + 1e-9 * Math.abs(instantaneous);
      const rows: ReadoutRow[] = [{ label: t.reading, value: meterText(part, m, status) ?? '' }];
      if (averaged) rows.push({ label: t.instant, value: formatSI(instantaneous, voltmeter ? 'V' : 'A', { digits: 4 }) });
      rows.push(voltmeter ? { label: t.drawnCurrent, value: a(I) } : { label: t.voltageDrop, value: v(V) });
      const base = voltmeter
        ? ideal
          ? t.idealVoltmeter
          : t.realVoltmeter(ohmValue(R), a(I))
        : ideal
          ? t.idealAmmeter
          : t.realAmmeter(ohmValue(R), v(V));
      return { title, rows, note: averaged ? `${ac ? t.acMode : t.dcMode} ${base}` : base };
    }
  }
}

/**
 * Ölçü aletinin ekranındaki metin: otomatik ölçekli, 4 anlamlı basamak. AC kipinde değerin
 * sonuna "~" eklenir (230 V~ gibi).
 */
export function meterText(part: Part, m: Measurement, status: DeviceStatus = {}): string | null {
  if (part.type !== 'voltmeter' && part.type !== 'ammeter') return null;
  const voltmeter = part.type === 'voltmeter';
  const { ac, value } = meterValue(part.props, voltmeter ? m.voltage : m.current, status);
  const text = formatSI(value, voltmeter ? 'V' : 'A', { digits: 4 });
  return ac ? `${text}~` : text;
}
