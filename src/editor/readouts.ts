// Simülasyon sırasında bir parçanın üzerine gelince gösterilen bilgi kutusunun içeriği
// (gerilim, akım, güç ve türe özel ek bilgiler). Saf fonksiyon; arayüzden bağımsız test edilir.

import { tr } from '../i18n/tr';
import type { Part } from '../model/types';
import type { DeviceStatus, Measurement } from '../sim/devices';
import { LED_MODELS, type LedColor } from '../sim/devices/led';
import { SWITCH_ON_RESISTANCE } from '../sim/constants';
import { boolProp, numProp, strProp } from '../sim/netlist';
import { formatNumber, formatSI } from '../sim/units';

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
const v = (x: number) => formatSI(x, 'V');
const a = (x: number) => formatSI(x, 'A');
const w = (x: number) => formatSI(x, 'W');
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
        note: `V = I · R → ${v(V)} = ${a(I)} × ${ohm(R)}`,
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
        ...(r > 0 ? { note: `V = E − I · R_iç → ${v(m.voltage)} = ${v(emf)} − ${a(out)} × ${ohm(r)}` } : {}),
      };
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
    case 'voltmeter': {
      const ideal = boolProp(p, 'ideal', false);
      const R = numProp(p, 'resistance', 10e6);
      return {
        title,
        rows: [
          { label: t.reading, value: formatSI(m.voltage, 'V', { digits: 4 }) },
          { label: t.drawnCurrent, value: a(I) },
        ],
        note: ideal ? t.idealVoltmeter : t.realVoltmeter(ohmValue(R), a(I)),
      };
    }
    case 'ammeter': {
      const ideal = boolProp(p, 'ideal', false);
      const R = numProp(p, 'resistance', 0.1);
      return {
        title,
        rows: [
          { label: t.reading, value: formatSI(m.current, 'A', { digits: 4 }) },
          { label: t.voltageDrop, value: v(V) },
        ],
        note: ideal ? t.idealAmmeter : t.realAmmeter(ohmValue(R), v(V)),
      };
    }
  }
}

/** Ölçü aletinin ekranındaki metin: otomatik ölçekli, 4 anlamlı basamak. */
export function meterText(part: Part, m: Measurement): string | null {
  if (part.type === 'voltmeter') return formatSI(m.voltage, 'V', { digits: 4 });
  if (part.type === 'ammeter') return formatSI(m.current, 'A', { digits: 4 });
  return null;
}
