// Tuvaldeki bir parça: döndürülmüş sembol, dik duran ad/değer yazıları, seçim çerçevesi.

import { memo } from 'react';
import { CATALOG } from '../model/catalog';
import { rotatedBox } from '../model/geometry';
import { GRID, type Part } from '../model/types';
import { tr } from '../i18n/tr';
import { funcgenSettings } from '../sim/devices/funcgen';
import { LED_COLORS } from '../sim/devices/led';
import { numProp, strProp } from '../sim/netlist';
import { formatNumber, formatSI } from '../sim/units';
import type { ResistorStyle } from './settings';
import { PartSymbol, type LiveVisual } from './symbols';

/** Seçilen parça modelinin adı (ör. "1N4001"); eski genel modelde boş (tuvalde eskisi gibi). */
function modelName(part: Part): string {
  const model = part.props.model;
  const def = CATALOG[part.type];
  return typeof model === 'string' && model !== def.legacyProps?.model ? model : '';
}

/** Parçanın tuvalde adının altında görünen değeri (ör. "4,7 kΩ"). */
export function partValueText(part: Part): string {
  const p = part.props;
  switch (part.type) {
    case 'battery':
      return formatSI(numProp(p, 'voltage', 0), 'V', { trim: true, digits: 4 });
    case 'acsource': {
      const peak = formatSI(numProp(p, 'amplitude', 0), 'V', { trim: true, digits: 4 });
      const offset = numProp(p, 'offset', 0);
      const frequency = formatSI(numProp(p, 'frequency', 0), 'Hz', { trim: true, digits: 4 });
      return offset === 0
        ? `${peak} · ${frequency}`
        : `${peak} ${formatSI(offset, 'V', { trim: true, digits: 4, plusSign: true })} · ${frequency}`;
    }
    case 'resistor':
      return formatSI(numProp(p, 'resistance', 0), 'Ω', { trim: true, digits: 4 });
    case 'capacitor':
      return formatSI(numProp(p, 'capacitance', 0), 'F', { trim: true, digits: 4 });
    case 'inductor': {
      const L = formatSI(numProp(p, 'inductance', 0), 'H', { trim: true, digits: 4 });
      const r = numProp(p, 'dcResistance', 0);
      return r > 0 ? `${L} · ${formatSI(r, 'Ω', { trim: true, digits: 3 })}` : L;
    }
    case 'transformer':
      return `${formatNumber(numProp(p, 'turnsRatio', 16), 2)} : 1`;
    case 'relay':
      return formatSI(numProp(p, 'coilResistance', 275), 'Ω', { trim: true, digits: 4 });
    case 'potentiometer':
      return `${formatSI(numProp(p, 'resistance', 10e3), 'Ω', { trim: true, digits: 4 })} · %${formatNumber(numProp(p, 'position', 50), 0)}`;
    case 'ldr':
      return tr.properties.luxShort(formatNumber(numProp(p, 'illuminance', 100), numProp(p, 'illuminance', 100) < 10 ? 1 : 0));
    case 'ntc':
      return `${formatSI(numProp(p, 'resistance25', 10e3), 'Ω', { trim: true, digits: 4 })} · ${formatNumber(numProp(p, 'temperature', 25), 0)} °C`;
    case 'opamp':
    case 'timer555':
      // Sembolün içinde "741" / "555" yazar.
      return '';
    case 'arduino':
      return tr.properties.optionLabel('program', String(p.program ?? ''));
    case 'speaker':
      return '8 Ω · 5 W';
    case 'buzzer':
      return '5 V · 2,4 kHz';
    case 'fuse':
      return tr.properties.fuseShort(formatSI(numProp(p, 'rating', 1), 'A', { trim: true, digits: 3 }));
    case 'lamp':
      return `${formatSI(numProp(p, 'ratedVoltage', 12), 'V', { trim: true, digits: 3 })} · ${formatSI(numProp(p, 'ratedPower', 1.2), 'W', { trim: true, digits: 3 })}`;
    case 'motor': {
      const load = numProp(p, 'loadTorque', 0);
      return load > 0 ? tr.properties.motorLoadShort(formatNumber(load, 3)) : tr.properties.motorNoLoad;
    }
    case 'led':
      return tr.devices.ledColors[strProp(p, 'color', LED_COLORS, 'red')] ?? '';
    case 'zener':
      return formatSI(numProp(p, 'zenerVoltage', 5.1), 'V', { trim: true, digits: 4 });
    case 'diode':
    case 'njfet':
    case 'nmos':
      return modelName(part);
    case 'npn': {
      const beta = `β = ${formatNumber(numProp(p, 'beta', 200), 0)}`;
      const model = modelName(part);
      return model ? `${model} · ${beta}` : beta;
    }
    case 'pnp':
      return `β = ${formatNumber(numProp(p, 'beta', 200), 0)}`;
    case 'funcgen': {
      const s = funcgenSettings(p);
      const amplitude = formatSI(s.amplitude * (s.attenuate ? 0.1 : 1), 'V', { trim: true, digits: 3 });
      return `${formatSI(s.frequency, 'Hz', { trim: true, digits: 4 })} · ${amplitude} t-t`;
    }
    default:
      return '';
  }
}

export type PartTone = 'normal' | 'selected' | 'hover' | 'error' | 'warning';

const TONE_COLORS: Record<PartTone, string> = {
  normal: 'var(--color-symbol)',
  selected: 'var(--color-select)',
  hover: '#3d63b8',
  error: 'var(--color-danger)',
  warning: 'var(--color-warn)',
};

export interface PartViewProps {
  readonly part: Part;
  readonly tone: PartTone;
  readonly resistorStyle: ResistorStyle;
  readonly live?: LiveVisual;
  /** Ölçü aletlerinin ekranındaki metin; null ise boş ekran gösterilir. */
  readonly meterText?: string | null;
  /** Kırmızı yanıp sönen çerçeve (ör. kısa devre). */
  readonly alarm?: boolean;
  /** Ölçü aleti ekranı öbür tarafa açılsın (yanında başka bir parça varsa). */
  readonly displayFlip?: boolean;
  /** Değer yazısı gizlensin (telefonda uzaklaşınca; tasarım: P04). */
  readonly hideValue?: boolean;
}

const LABEL_STYLE = { fontFamily: 'var(--font-sans)', fontSize: 11 } as const;

export const PartView = memo(function PartView({
  part,
  tone,
  resistorStyle,
  live,
  meterText,
  alarm,
  displayFlip = false,
  hideValue = false,
}: PartViewProps) {
  const def = CATALOG[part.type];
  const box = rotatedBox(def.bounds, part.rotation, { x: 0, y: 0 });
  const left = box.x * GRID;
  const top = box.y * GRID;
  const right = (box.x + box.w) * GRID;
  const bottom = (box.y + box.h) * GRID;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const horizontal = part.rotation % 180 === 0;
  const isMeter = part.type === 'voltmeter' || part.type === 'ammeter';
  const value = partValueText(part);
  const color = TONE_COLORS[tone];

  // Yazıların konumu: yatay parçada ad üstte, değer altta; dikey parçada ikisi de sağda.
  // Ölçü aletinde ekran üstte (dikeyde sağda), ad karşı tarafta; displayFlip ile yer değiştirir.
  const display = isMeter ? meterDisplay(part.type === 'voltmeter' ? 'V' : 'A', meterText ?? null) : null;
  const displayRect = meterDisplayRect(part, displayFlip);
  const displayX = displayRect.x * GRID - part.x * GRID;
  const displayY = displayRect.y * GRID - part.y * GRID;
  let nameX: number;
  let nameY: number;
  let valueY: number;
  let anchor: 'middle' | 'start' | 'end';
  if (part.type === 'opamp' && part.rotation === 0) {
    // İşlemsel yükselteç: üstte V+, sağda çıkış kablosu var; ad üçgenin sağ üst köşesinde.
    anchor = 'start';
    nameX = 8;
    nameY = -16;
    valueY = -16;
  } else if (def.labelRight && part.rotation === 0) {
    // Transistör: üst ve alt uçlar kablolu olduğu için yazılar sağda (dönmüşse eski kurallar).
    anchor = 'start';
    nameX = right + 4;
    nameY = cy - 3;
    valueY = cy + 11;
  } else if (horizontal) {
    anchor = 'middle';
    nameX = cx;
    nameY = isMeter && !displayFlip ? bottom + 13 : top - 5;
    valueY = bottom + 13;
  } else {
    anchor = isMeter && displayFlip ? 'end' : 'start';
    nameX = anchor === 'end' ? left - 6 : right + 6;
    nameY = isMeter ? cy + DISPLAY_H / 2 + 14 : cy - 3;
    valueY = cy + 11;
  }

  return (
    <g transform={`translate(${part.x * GRID} ${part.y * GRID})`} style={{ color }}>
      {(tone === 'selected' || tone === 'error' || tone === 'warning') && (
        <rect
          x={left - 4}
          y={top - 4}
          width={right - left + 8}
          height={bottom - top + 8}
          rx={3}
          // Hata: kesintisiz kırmızı çerçeve; uyarı: kesikli amber çerçeve (renk tek başına değil).
          fill={tone === 'selected' ? 'var(--color-accent-soft)' : tone === 'error' ? 'var(--color-danger-soft)' : 'var(--color-warn-soft)'}
          fillOpacity={tone === 'selected' ? 0.55 : tone === 'error' ? 0.75 : 0.6}
          stroke={color}
          strokeWidth={tone === 'selected' ? 1 : tone === 'error' ? 2 : 1.5}
          strokeDasharray={tone === 'selected' || tone === 'warning' ? '4 3' : undefined}
        />
      )}
      {alarm && (
        <rect
          x={left - 6}
          y={top - 6}
          width={right - left + 12}
          height={bottom - top + 12}
          rx={4}
          fill="none"
          stroke="var(--color-danger)"
          strokeWidth={2.5}
          className="alarm-blink"
        />
      )}
      <g transform={part.rotation ? `rotate(${part.rotation})` : undefined}>
        <PartSymbol
          type={part.type}
          props={part.props}
          resistorStyle={resistorStyle}
          rotation={part.rotation}
          {...(live ? { live } : {})}
        />
      </g>
      {display && <g transform={`translate(${displayX} ${displayY})`}>{display}</g>}
      {live?.charge !== undefined &&
        (horizontal ? (
          <ChargeBar charge={live.charge} x={cx - CHARGE_LENGTH / 2} y={valueY + 5} vertical={false} />
        ) : (
          <ChargeBar charge={live.charge} x={left - 10} y={cy - CHARGE_LENGTH / 2} vertical />
        ))}
      {def.showLabel && (
        <text x={nameX} y={nameY} textAnchor={anchor} style={LABEL_STYLE} fontWeight={600} fill="var(--color-ink)">
          {part.label}
        </text>
      )}
      {value && !isMeter && !hideValue && (
        <text x={nameX} y={valueY} textAnchor={anchor} style={LABEL_STYLE} fill="var(--color-muted)" className="tabular">
          {value}
        </text>
      )}
    </g>
  );
});

const CHARGE_LENGTH = 30;

/**
 * Kondansatörün dolma oranı: |V| / (devredeki en büyük kaynak gerilimi). Kırmızı: + ucu daha
 * yüksek gerilimde; mavi: ters yönde dolu. Dikey parçada aşağıdan yukarı dolar.
 */
function ChargeBar({ charge, x, y, vertical }: { charge: number; x: number; y: number; vertical: boolean }) {
  const ratio = Math.min(1, Math.abs(charge));
  const fill = charge >= 0 ? '#e5484d' : '#3e7bfa';
  const filled = CHARGE_LENGTH * ratio;
  return vertical ? (
    <g transform={`translate(${x} ${y})`}>
      <rect width={4} height={CHARGE_LENGTH} rx={2} fill="#d9dde3" />
      <rect y={CHARGE_LENGTH - filled} width={4} height={filled} rx={2} fill={fill} />
    </g>
  ) : (
    <g transform={`translate(${x} ${y})`}>
      <rect width={CHARGE_LENGTH} height={4} rx={2} fill="#d9dde3" />
      <rect width={filled} height={4} rx={2} fill={fill} />
    </g>
  );
}

const DISPLAY_W = 70;
const DISPLAY_H = 19;

/**
 * Ölçü aleti ekranının dünya konumu (ızgara birimi). Yatay alette ekran üstte (flip: altta),
 * dikey alette sağda (flip: solda).
 */
export function meterDisplayRect(part: Part, flip: boolean): { x: number; y: number; w: number; h: number } {
  const b = rotatedBox(CATALOG[part.type].bounds, part.rotation, part);
  const w = DISPLAY_W / GRID;
  const h = DISPLAY_H / GRID;
  const gap = 0.6;
  if (part.rotation % 180 === 0) {
    const x = b.x + b.w / 2 - w / 2;
    return { x, y: flip ? b.y + b.h + gap : b.y - h - gap, w, h };
  }
  const y = b.y + b.h / 2 - h / 2;
  return { x: flip ? b.x - gap - w : b.x + b.w + gap, y, w, h };
}

/** Ölçü aletinin küçük ekranı. */
function meterDisplay(unit: string, text: string | null) {
  return (
    <g>
      <rect width={DISPLAY_W} height={DISPLAY_H} rx={3} fill="#1e2a25" stroke="#0f1512" strokeWidth={1} />
      <text
        x={DISPLAY_W - 6}
        y={DISPLAY_H / 2 + 0.5}
        textAnchor="end"
        dominantBaseline="central"
        fill={text ? '#a6f4bd' : '#5e7a68'}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
        className="tabular"
      >
        {text ?? `– – – ${unit}`}
      </text>
    </g>
  );
}
