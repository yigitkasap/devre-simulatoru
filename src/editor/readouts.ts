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
import { LED_COLORS, LED_MODELS, type LedColor } from '../sim/devices/led';
import { relaySettings } from '../sim/devices/relay';
import { lampParameters } from '../sim/devices/sensors';
import { tankSettings } from '../sim/devices/tank';
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
    case 'tank': {
      const s = tankSettings(p);
      const level = status.level ?? s.level;
      const wet = status.wetProbes ?? [];
      const wetNames = wet.map((on, k) => (on ? tr.rack.probe(k) : null)).filter((n): n is string => n !== null);
      return {
        title,
        rows: [
          { label: tr.rack.level, value: `%${formatNumber(level, 1)}` },
          { label: tr.rack.probes, value: wetNames.length > 0 ? wetNames.join(', ') : t.none },
          { label: t.current, value: a(I) },
          { label: t.polarization, value: v(status.polarization ?? 0) },
          { label: tr.rack.waterResistance, value: ohmValue(s.waterResistance) },
        ],
        note: t.tankNote,
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
    case 'transformer': {
      const [w1, w2] = status.windings ?? [
        { voltage: m.voltage, current: m.current },
        { voltage: 0, current: 0 },
      ];
      const n = numProp(p, 'turnsRatio', 16);
      return {
        title,
        rows: [
          { label: t.turnsRatio, value: `${formatNumber(n, 2)} : 1` },
          { label: t.primary, value: `${v(w1!.voltage)} · ${a(w1!.current)}` },
          { label: t.secondary, value: `${v(w2!.voltage)} · ${a(w2!.current)}` },
          { label: t.powerInOut, value: `${formatSI(w1!.voltage * w1!.current, 'W', { digits: 3 })} / ${formatSI(w2!.voltage * w2!.current, 'W', { digits: 3 })}` },
        ],
        note: t.transformerNote,
      };
    }
    case 'timer555': {
      const tm = status.timer ?? { high: false, output: 0, threshold: 0, trigger: 0, upper: 0, lower: 0 };
      return {
        title,
        rows: [
          { label: t.timerOutput, value: `${tm.high ? t.timerHigh : t.timerLow} · ${v(tm.output)}` },
          { label: t.timerThreshold, value: `${v(tm.threshold)} / ${v(tm.upper)}` },
          { label: t.timerTrigger, value: `${v(tm.trigger)} / ${v(tm.lower)}` },
          { label: t.timerDischarge, value: tm.high ? t.open : t.closed },
        ],
        note: t.timerNote,
      };
    }
    case 'arduino': {
      const ard = status.arduino;
      const rows: ReadoutRow[] = [
        { label: t.arduinoProgram, value: tr.properties.optionLabel('program', String(p.program ?? '')) },
        { label: t.arduinoBoard, value: `${v(m.voltage)} · ${a(m.current)}` },
      ];
      if (!ard?.running) return { title, rows: [...rows, { label: t.state, value: t.arduinoIdle }] };
      // Kullanılan pinler: çıkışlar, çekme dirençli girişler ve gerilim gelen analog girişler.
      for (const pin of ard.pins) {
        const used = pin.mode !== 0 || (pin.pin >= 14 && Math.abs(pin.voltage) > 1e-3);
        if (!used || rows.length >= 8) continue;
        const name = pin.pin >= 14 ? `A${pin.pin - 14}` : `D${pin.pin}`;
        const current = pin.mode >= 2 ? ` · ${a(pin.current)}` : '';
        rows.push({ label: `${name}: ${t.arduinoModes[pin.mode] ?? ''}`, value: `${v(pin.voltage)}${current}` });
      }
      const line = ard.serial.trimEnd().split('\n').pop()?.trim();
      if (line) rows.push({ label: t.arduinoSerial, value: line });
      return { title, rows, note: t.arduinoNote };
    }
    case 'opamp': {
      const o = status.opamp ?? { differential: 0, output: 0, current: 0, mode: 'linear' as const };
      return {
        title,
        rows: [
          { label: t.opampDifferential, value: v(o.differential) },
          { label: t.opampOutput, value: v(o.output) },
          { label: t.opampCurrent, value: a(o.current) },
          { label: t.state, value: t.opampModes[o.mode] },
        ],
        note: t.opampNotes[o.mode],
      };
    }
    case 'speaker': {
      const power = status.averagePower ?? 0;
      return {
        title,
        rows: [
          { label: t.voltage, value: v(m.voltage) },
          { label: t.current, value: a(m.current) },
          { label: t.averagePower, value: w(power) },
          { label: t.spl1m, value: status.spl !== undefined ? `${formatNumber(status.spl, 0)} dB` : t.none },
        ],
        note: t.speakerNote,
      };
    }
    case 'buzzer':
      return {
        title,
        rows: [
          { label: t.voltage, value: v(m.voltage) },
          { label: t.current, value: a(m.current) },
          { label: t.state, value: status.sounding ? t.buzzerOn : t.buzzerOff },
          { label: t.spl10cm, value: status.spl !== undefined ? `${formatNumber(status.spl, 0)} dB` : t.none },
        ],
        note: t.buzzerNote,
      };
    case 'fuse':
      if (status.burned) return { title, rows: [{ label: t.state, value: t.fuseBlown }], note: t.fuseBlownNote };
      return {
        title,
        rows: [
          { label: t.current, value: a(I) },
          { label: t.voltageDrop, value: v(V) },
          { label: t.fuseHeat, value: `%${formatNumber(Math.min(100, (status.heating ?? 0) * 100), 0)}` },
        ],
        note: t.fuseNote,
      };
    case 'potentiometer': {
      const wiper = status.wiper ?? { voltage: 0, r12: 0, r23: 0 };
      return {
        title,
        rows: [
          { label: t.potPosition, value: `%${formatNumber(numProp(p, 'position', 50), 0)}` },
          { label: t.potHalves, value: `${ohm(wiper.r12)} / ${ohm(wiper.r23)}` },
          { label: t.potWiper, value: v(wiper.voltage) },
          { label: t.current, value: a(m.current) },
        ],
        note: t.potNote,
      };
    }
    case 'ldr': {
      const lux = numProp(p, 'illuminance', 100);
      return {
        title,
        rows: [
          { label: t.ldrIlluminance, value: tr.properties.luxShort(formatNumber(lux, lux < 10 ? 1 : 0)) },
          { label: t.resistanceNow, value: ohm(status.resistance ?? 0) },
          { label: t.voltage, value: v(V) },
          { label: t.current, value: a(I) },
        ],
        note: t.ldrNote,
      };
    }
    case 'ntc': {
      const T = (status.temperature ?? 298.15) - 273.15;
      const rise = (status.temperature ?? 0) - (status.ambient ?? status.temperature ?? 0);
      return {
        title,
        rows: [
          { label: t.temperature, value: `${formatNumber(T, 1)} °C` },
          { label: t.resistanceNow, value: ohm(status.resistance ?? 0) },
          { label: t.voltage, value: v(V) },
          { label: t.current, value: a(I) },
          { label: t.selfHeating, value: `+${formatNumber(rise, rise < 0.1 ? 3 : 2)} K` },
        ],
        note: t.ntcNote,
      };
    }
    case 'lamp': {
      if (status.burned) return { title, rows: [{ label: t.state, value: t.burned }], note: t.lampBurnedNote };
      const lamp = lampParameters(p);
      return {
        title,
        rows: [
          { label: t.filament, value: `${formatNumber(status.temperature ?? 293, 0)} K` },
          { label: t.resistanceNow, value: ohm(status.resistance ?? lamp.cold) },
          { label: t.voltage, value: v(V) },
          { label: t.current, value: a(I) },
          { label: t.power, value: w(P) },
          { label: t.lampLight, value: `%${formatNumber(Math.min(999, (status.glow ?? 0) * 100), 0)}` },
        ],
        note: t.lampNote(ohm(lamp.cold)),
      };
    }
    case 'motor': {
      const motor = status.motor ?? { speed: 0, backEmf: 0, torque: 0, loadPower: 0, heating: 0 };
      const rpm = (motor.speed * 60) / (2 * Math.PI);
      const stalled = Math.abs(rpm) < 10 && Math.abs(m.current) > 0.2;
      return {
        title,
        rows: [
          { label: t.motorSpeed, value: t.motorRpm(formatNumber(rpm, 0)) },
          { label: t.motorEmf, value: v(motor.backEmf) },
          { label: t.current, value: a(m.current) },
          { label: t.motorTorque, value: `${formatNumber(motor.torque * 1e3, 3)} mN·m` },
          { label: t.motorLoadPower, value: w(motor.loadPower) },
        ],
        note: stalled ? t.motorStalled : m.current * motor.speed < 0 ? t.motorGenerating : t.motorRunning,
      };
    }
    case 'relay': {
      const s = relaySettings(p);
      const coil = status.coil ?? { voltage: m.voltage, current: m.current };
      return {
        title,
        rows: [
          { label: t.state, value: status.energized ? t.relayEnergized : t.relayReleased },
          { label: t.relayCoil, value: `${v(coil.voltage)} · ${a(coil.current)}` },
          { label: t.relayThresholds, value: `${an(s.pullInCurrent)} / ${an(s.dropOutCurrent)}` },
          { label: t.relayContact, value: a(Math.abs(status.contactCurrent ?? 0)) },
        ],
        note: t.relayNote,
      };
    }
    case 'inductor': {
      const L = numProp(p, 'inductance', 10e-3);
      // L'nin kendi gerilimi (uç geriliminden sargı direncinin payı çıkınca): işareti akımın arttığını ya da azaldığını söyler.
      const coil = m.voltage - numProp(p, 'dcResistance', 12) * m.current;
      return {
        title,
        rows: [
          { label: t.inductance, value: formatSI(L, 'H', { trim: true }) },
          { label: t.current, value: a(I) },
          { label: t.terminalVoltage, value: v(m.voltage) },
          { label: t.coilEnergy, value: formatSI(0.5 * L * I * I, 'J') },
        ],
        note: Math.abs(coil) < 1e-6 + 1e-3 * Math.abs(m.voltage) ? t.inductorSteady : coil * m.current > 0 ? t.inductorRising : t.inductorFalling,
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
        const color = strProp(p, 'color', LED_COLORS, 'red') as LedColor;
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
