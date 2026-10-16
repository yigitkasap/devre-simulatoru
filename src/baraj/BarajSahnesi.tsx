// Baraj sahnesi: kesitten bakılan vadi, beton baraj, hazne ve problar, ölçü iskelesi, kontrol
// kulübesi ve üç lambalı ışık kulesi. Su seviyesi ve lambalar simülasyondan gelir: lambalar
// devredeki LED'lerin parlaklığını izler. Doldururken nehirden su gelir, boşaltırken dip savaktan
// akar. Çizim 800 × 460'lık bir alanda; görünüm kutusu haznenin, barajın ve ışık kulesinin olduğu
// kısma kırpılır (sol yamacın ve mansabın boş kenarları dışarıda kalır), kutusuna sığar. Gökyüzü ve
// zemin kutunun dışına taşar (oranı farklı kutuda boş şerit kalmaz). Dar ekranda (compact) daha sıkı
// kırpılır, yazılar büyür. Seviye sağdaki Kontroller panelinde gösterilir.

import { useId } from 'react';
import { tr } from '../i18n/tr';
import { TANK_PROBE_HEIGHTS, type TankMode } from '../sim/devices/tank';

/** Lambalar yukarıdan aşağı: kırmızı (Seviye 3), sarı (Seviye 2), yeşil (Seviye 1). */
export interface Lamps {
  readonly green: number;
  readonly yellow: number;
  readonly red: number;
}

export interface BarajSahnesiProps {
  /** Su seviyesi (%). */
  readonly level: number;
  /** Islak problar: ortak, Seviye 1, 2, 3. */
  readonly wet: readonly boolean[];
  /** Lambaların parlaklığı (0..1). */
  readonly lamps: Lamps;
  readonly mode: TankMode;
  readonly running: boolean;
  /** Dar ekran: sol yamaç kırpılır, yazılar büyür. */
  readonly compact?: boolean;
  readonly className?: string;
}

const CREST_Y = 110;
const BED_Y = 400;
const FULL_Y = 124;
const FACE_X = 480;
const BANK = { x0: 36, y0: 112, x1: 150, y1: BED_Y };
const STAFF_X = 404;

/** Seviyenin (%) görünüm kutusundaki y'si. */
const levelY = (level: number) => BED_Y - (Math.min(100, Math.max(0, level)) / 100) * (BED_Y - FULL_Y);
/** Sol kıyının verilen y'deki x'i. */
const bankX = (y: number) => BANK.x0 + ((y - BANK.y0) * (BANK.x1 - BANK.x0)) / (BANK.y1 - BANK.y0);

const LAMP_COLORS = { red: '#ff3b30', yellow: '#ffc107', green: '#34c759' } as const;

/** Uyarı durumu: yanan en üst lamba. */
export function alertOf(lamps: Lamps): 'danger' | 'warning' | 'normal' | 'none' {
  if (lamps.red > 0.3) return 'danger';
  if (lamps.yellow > 0.3) return 'warning';
  if (lamps.green > 0.3) return 'normal';
  return 'none';
}

export function BarajSahnesi({ level, wet, lamps, mode, running, compact = false, className = '' }: BarajSahnesiProps) {
  const id = useId().replace(/:/g, '');
  const fs = compact ? 1.55 : 1.15;
  /** Yazının arkasında beyaz kenar: koyu zeminde de okunsun. */
  const halo = { stroke: '#ffffff', strokeWidth: 3 * fs, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };
  const surface = levelY(level);
  const left = bankX(surface);
  const filling = running && mode === 'fill' && level < 100;
  const draining = running && mode === 'drain' && level > 0;
  const lampText = (['red', 'yellow', 'green'] as const)
    .map((c) => `${tr.baraj.lampNames[c]} ${lamps[c] > 0.3 ? tr.baraj.lampOn : tr.baraj.lampOff}`)
    .join(', ');

  return (
    <svg
      viewBox={compact ? '150 -10 650 460' : '120 30 670 420'}
      role="img"
      aria-label={tr.baraj.sceneLabel(Math.round(level), lampText)}
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7e6f5" />
          <stop offset="1" stopColor="#f3f6f9" />
        </linearGradient>
        <linearGradient id={`${id}water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fb0ea" />
          <stop offset="1" stopColor="#2a6aa8" />
        </linearGradient>
        <linearGradient id={`${id}concrete`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9ced4" />
          <stop offset="1" stopColor="#a9b0b8" />
        </linearGradient>
        <filter id={`${id}glow`} x="-1" y="-1" width="3" height="3">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <clipPath id={`${id}surface`}>
          <rect x={left} y={surface - 8} width={FACE_X - left} height={16} />
        </clipPath>
      </defs>

      {/* Gökyüzü ve dağlar (kutunun dışına taşar) */}
      <rect x={-800} y={-600} width={2400} height={1200} fill="#d7e6f5" />
      <rect x={-800} y={0} width={2400} height={460} fill={`url(#${id}sky)`} />
      <path d="M-800 230L-500 120L-200 220L0 210L120 70L250 190L370 50L540 180L680 80L800 170L1000 90L1300 200L1600 120V600H-800Z" fill="#c9d4df" />
      <path d="M-800 260L-400 200L0 250L90 160L210 240L330 150L470 250L620 170L800 240L1100 180L1600 250V600H-800Z" fill="#b7c6b3" opacity={0.7} />

      {/* Sol yamaç, hazne tabanı ve mansap (zemin kutunun altına taşar) */}
      <path d={`M-800 80L0 96L${BANK.x0} ${BANK.y0}L${BANK.x1} ${BED_Y}L${FACE_X} ${BED_Y}V1000H-800Z`} fill="#8a7a5f" />
      <path d={`M0 96L${BANK.x0} ${BANK.y0}L${BANK.x1} ${BED_Y}`} fill="none" stroke="#6f6149" strokeWidth={3} />
      <path d="M600 418L1600 440V1000H600Z" fill="#8a7a5f" />
      {/* Barajın altındaki temel (kutu uzadığında boş şerit kalmasın) */}
      <rect x={470} y={416} width={150} height={600} fill="#8a7a5f" />
      <path d="M612 424L1600 446V460L612 438Z" fill="#4f8fc8" />

      {/* Hazne suyu ve dalgalı yüzey */}
      {level > 0.2 && (
        <g>
          <path d={`M${left} ${surface}L${FACE_X} ${surface}L${FACE_X} ${BED_Y}L${BANK.x1} ${BED_Y}Z`} fill={`url(#${id}water)`} opacity={0.92} />
          <g clipPath={`url(#${id}surface)`}>
            <path
              className="baraj-dalga"
              d={`M${left - 40} ${surface}${Array.from({ length: Math.ceil((FACE_X - left) / 20) + 4 }, () => ' q5 -3 10 0 t10 0').join('')}`}
              fill="none"
              stroke="#d6eeff"
              strokeWidth={2}
              opacity={0.85}
            />
          </g>
        </g>
      )}

      {/* Doldururken nehir */}
      <path
        d={`M0 92L${BANK.x0} ${BANK.y0 - 4}L${left + 6} ${Math.max(BANK.y0, surface - 2)}`}
        fill="none"
        stroke="#4f8fc8"
        strokeWidth={filling ? 7 : 4}
        strokeLinecap="round"
        strokeDasharray={filling ? '12 8' : undefined}
        className={filling ? 'baraj-akis' : undefined}
        opacity={filling ? 1 : 0.5}
      />

      {/* Ölçü iskelesi */}
      <g>
        <rect x={STAFF_X} y={FULL_Y} width={12} height={BED_Y - FULL_Y} fill="#fdfdfd" stroke="#59636e" strokeWidth={1} />
        {Array.from({ length: 11 }, (_, i) => i * 10).map((p) => (
          <g key={p}>
            <line x1={STAFF_X} x2={STAFF_X + (p % 50 === 0 ? 12 : 7)} y1={levelY(p)} y2={levelY(p)} stroke="#2c3846" strokeWidth={p % 50 === 0 ? 1.6 : 1} />
            {p % 20 === 0 && (
              <text
                x={STAFF_X - 4}
                y={levelY(p) + 3.5 * fs}
                textAnchor="end"
                fontSize={10.5 * fs}
                fill="#1d2733"
                {...halo}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {`%${p}`}
              </text>
            )}
          </g>
        ))}
      </g>

      {/* Baraj gövdesi */}
      <path d={`M${FACE_X} ${CREST_Y}H524L610 420H${FACE_X}Z`} fill={`url(#${id}concrete)`} stroke="#7d858e" strokeWidth={2} strokeLinejoin="round" />
      {[160, 220, 280, 340, 400].map((y) => (
        <line key={y} x1={FACE_X} x2={524 + ((y - CREST_Y) * 86) / 310} y1={y} y2={y} stroke="#9aa2ab" strokeWidth={1} />
      ))}

      {/* Dip savak: boşaltırken su akar */}
      <line x1={FACE_X} x2={606} y1={396} y2={396} stroke="#4a5562" strokeWidth={6} />
      {draining && (
        <path d="M606 396q24 4 30 30" fill="none" stroke="#5fb0ea" strokeWidth={6} strokeLinecap="round" strokeDasharray="10 7" className="baraj-akis" />
      )}

      {/* Problar ve eşik çizgileri */}
      {TANK_PROBE_HEIGHTS.map((h, k) => {
        const y = levelY(h);
        const on = wet[k] === true;
        return (
          <g key={h}>
            {k > 0 && <line x1={STAFF_X + 12} x2={452} y1={y} y2={y} stroke="#ffffff" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.75} />}
            <line x1={452} x2={FACE_X + 14 + k * 4} y1={y} y2={y} stroke="#2c3846" strokeWidth={3} strokeLinecap="round" />
            <line x1={FACE_X + 14 + k * 4} x2={FACE_X + 14 + k * 4} y1={y} y2={CREST_Y - 6} stroke="#2c3846" strokeWidth={1.4} />
            {on && <circle cx={452} cy={y} r={9} fill="#9fe0ff" opacity={0.7} filter={`url(#${id}glow)`} />}
            <circle cx={452} cy={y} r={5} fill={on ? '#bff0ff' : '#9aa3ad'} stroke="#2c3846" strokeWidth={1.5} />
            <text x={FACE_X + 32} y={y + 4 * fs} fontSize={10.5 * fs} fontWeight={600} fill="#1d2733" {...halo} style={{ fontFamily: 'var(--font-sans)' }}>
              {k === 0 ? tr.baraj.probeCommon : tr.baraj.probe(k)}
            </text>
          </g>
        );
      })}

      {/* Kontrol kulübesi ve ışık kulesi */}
      <rect x={486} y={78} width={34} height={26} fill="#eef1f4" stroke="#59636e" strokeWidth={1.5} />
      <path d="M482 80L503 64L524 80" fill="#c45b4a" stroke="#59636e" strokeWidth={1.5} strokeLinejoin="round" />
      <rect x={498} y={88} width={10} height={16} fill="#6c7782" />
      <path d={`M520 92L646 92`} fill="none" stroke="#2c3846" strokeWidth={1.4} />
      <line x1={668} x2={668} y1={214} y2={424} stroke="#59636e" strokeWidth={6} />
      <rect x={644} y={70} width={48} height={146} rx={10} fill="#232a31" stroke="#11161b" strokeWidth={2} />
      {(['red', 'yellow', 'green'] as const).map((c, i) => {
        const b = Math.min(1, Math.max(0, lamps[c]));
        const cy = 96 + i * 46;
        return (
          <g key={c}>
            {b > 0.05 && <circle cx={668} cy={cy} r={30} fill={LAMP_COLORS[c]} opacity={0.55 * b} filter={`url(#${id}glow)`} />}
            <circle cx={668} cy={cy} r={17} fill={b > 0.05 ? LAMP_COLORS[c] : '#3b434c'} opacity={b > 0.05 ? 0.4 + 0.6 * b : 1} stroke={LAMP_COLORS[c]} strokeWidth={2.5} />
            <text x={698} y={cy + 4 * fs} fontSize={11 * fs} fontWeight={600} fill="#1d2733" {...halo} style={{ fontFamily: 'var(--font-sans)' }}>
              {tr.baraj.lampLevel[c]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

