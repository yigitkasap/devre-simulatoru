// Baraj sahnesi: kesitten bakılan vadi, beton baraj, hazne ve problar, ölçü iskelesi, kontrol
// kulübesi ve üç lambalı ışık kulesi. Su seviyesi ve lambalar simülasyondan gelir: lambalar
// devredeki LED'lerin parlaklığını izler. Doldururken nehirden su gelir, boşaltırken dip savaktan
// akar. Problar ve lambalar numaralıdır (Seviye 1 yeşil, 2 sarı, 3 kırmızı); ölçü iskelesinin solunda
// seviye etiketi ve suyu sürükleyen tutamak (role="slider") durur. Tutamak, çizimle aynı görünüm
// kutusundaki ayrı bir SVG katmanındadır (çizim role="img": içindeki öğeler ekran okuyucuya kapalı).
//
// Çizim 800 × 460'lık bir alanda; görünüm kutusu düzene göre kırpılır (geniş ekran, tablet, telefon,
// yatay telefon), kutusuna sığar. Gökyüzü ve zemin kutunun dışına taşar (boş şerit kalmaz). Yazılar
// sahnenin ekrandaki ölçeğine göre `textPx` piksel boyunda çizilir (projeksiyonda büyür).

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ANION_COLOR, CATION_COLOR, ionsOnLine, jiggle, seeded, type IonView, type PlacedIon } from '../editor/ions';
import { tr } from '../i18n/tr';
import { TANK_PROBE_HEIGHTS, type TankMode } from '../sim/devices/tank';
import { LEVEL_COLORS, type LevelNo } from './seviye';

/** Lambalar yukarıdan aşağı: kırmızı (Seviye 3), sarı (Seviye 2), yeşil (Seviye 1). */
export interface Lamps {
  readonly green: number;
  readonly yellow: number;
  readonly red: number;
}

export type SceneLayout = 'wide' | 'tablet' | 'phone' | 'landscape';

const VIEW_BOXES: Readonly<Record<SceneLayout, readonly [number, number, number, number]>> = {
  wide: [120, 30, 670, 420],
  tablet: [150, -10, 650, 460],
  phone: [240, 40, 552, 400],
  landscape: [262, 40, 530, 400],
};

export interface BarajSahnesiProps {
  /** Gösterilen su seviyesi (%): sürüklerken önizleme. */
  readonly level: number;
  /** Islak problar: ortak, Seviye 1, 2, 3. */
  readonly wet: readonly boolean[];
  /** Lambaların parlaklığı (0..1). */
  readonly lamps: Lamps;
  readonly mode: TankMode;
  /** Simülasyon çalışıyor mu (akış çizimleri). */
  readonly running: boolean;
  readonly layout: SceneLayout;
  /** Yazıların ekrandaki boyu (px). */
  readonly textPx: number;
  /** Lambaların yanında "Seviye n" yazısı (telefonda yok: numara lambanın içinde). */
  readonly lampLabels?: boolean;
  /** Suda akımı taşıyan iyonlar (simülasyon çalışırken). */
  readonly ions?: IonView;
  /** Tutamak sürüklenirken önizleme seviyesi; bırakınca null. */
  readonly onPreview: (level: number | null) => void;
  /** Tutamak bırakıldı ya da tuşla değişti: seviye uygulanır. */
  readonly onCommit: (level: number) => void;
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
/** Görünüm kutusundaki y'nin seviyesi (%). */
const yLevel = (y: number) => Math.min(100, Math.max(0, ((BED_Y - y) / (BED_Y - FULL_Y)) * 100));
/** Sol kıyının verilen y'deki x'i. */
const bankX = (y: number) => BANK.x0 + ((y - BANK.y0) * (BANK.x1 - BANK.x0)) / (BANK.y1 - BANK.y0);

const LAMPS: ReadonlyArray<{ readonly key: keyof Lamps; readonly level: LevelNo; readonly numberInk: string }> = [
  { key: 'red', level: 3, numberInk: '#ffffff' },
  { key: 'yellow', level: 2, numberInk: '#3a2a00' },
  { key: 'green', level: 1, numberInk: '#0b2e17' },
];
const WATER = '#2f7fc4';

/** Uyarı durumu: yanan en üst lamba. */
export function alertOf(lamps: Lamps): 'danger' | 'warning' | 'normal' | 'none' {
  if (lamps.red > 0.3) return 'danger';
  if (lamps.yellow > 0.3) return 'warning';
  if (lamps.green > 0.3) return 'normal';
  return 'none';
}

/** Sahnenin ekrandaki ölçeği (px / görünüm birimi). */
function useScale(viewBox: readonly [number, number, number, number]) {
  const ref = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setScale(Math.min(r.width / viewBox[2], r.height / viewBox[3]));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewBox]);
  return { ref, scale };
}

/** Probun ucu (sahnede): problar barajın yüzünden suya uzanır, uçları x = 452'de. */
const TIP_X = 452;

/** Bir iyon: renkli daire, içinde + (katyon) ya da − (anyon). */
function SceneIon({ ion, r, opacity = 1 }: { ion: PlacedIon; r: number; opacity?: number }) {
  const g = r * 0.5;
  return (
    <g opacity={opacity}>
      <circle cx={ion.x} cy={ion.y} r={r} fill={ion.cation ? CATION_COLOR : ANION_COLOR} stroke="#ffffff" strokeWidth={r * 0.22} />
      <path
        d={ion.cation ? `M${ion.x - g} ${ion.y}H${ion.x + g}M${ion.x} ${ion.y - g}V${ion.y + g}` : `M${ion.x - g} ${ion.y}H${ion.x + g}`}
        stroke="#ffffff"
        strokeWidth={r * 0.32}
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Haznedeki iyonlar ve gaz kabarcıkları. Su iyon doludur: akım yokken iyonlar yerinde kıpırdar.
 * Akım taşıyan her anot → katot kanalında, uçlar arasında sola doğru kavisli üç alan çizgisi
 * boyunca katyonlar akım yönünde (anottan katoda), anyonlar ters yönde sürüklenir. Akım taşıyan
 * probun ucunda elektroliz gazı çıkar: katotta H₂, anotta (aynı yük için yarısı kadar) O₂.
 */
function SceneIons({ ions, surface, r }: { ions: IonView; surface: number; r: number }) {
  const tipY = TANK_PROBE_HEIGHTS.map((h) => levelY(h));
  const placed: PlacedIon[] = [];
  for (const ch of ions.channels) {
    const y0 = tipY[ch.from]!;
    const y1 = tipY[ch.to]!;
    const dir = Math.sign(y1 - y0);
    for (let c = 0; c < 3; c++) {
      const p0 = { x: TIP_X - 4 - 3 * c, y: y0 + 6 * dir };
      const p1 = { x: TIP_X - 4 - 3 * c, y: y1 - 6 * dir };
      // Kavis, ölçü iskelesinin (x = 404–416) sağında kalır; aradaki probun ucunun solundan geçer.
      const between = tipY.some((y, k) => k !== ch.from && k !== ch.to && y > Math.min(y0, y1) && y < Math.max(y0, y1));
      const control = { x: TIP_X - (between ? 34 : 14) - 9 * c, y: (y0 + y1) / 2 };
      const perSign = Math.max(2, Math.round(Math.abs(y1 - y0) / 55));
      placed.push(...ionsOnLine(`${ch.from}-${ch.to}-${c}`, p0, control, p1, ch.phase, perSign, ch.from * 7 + ch.to * 3 + c, ions.clock, 2.2));
    }
  }
  const still: PlacedIon[] = [];
  const depth = BED_Y - 8 - (surface + 10);
  if (depth > 6) {
    for (let n = 0; n < 24; n++) {
      const y = surface + 10 + seeded(200 + n) * depth;
      const x0 = bankX(y) + 14;
      const j = jiggle(300 + n, ions.clock, 2.4);
      still.push({ key: `s${n}`, x: x0 + seeded(400 + n) * (TIP_X - 30 - x0) + j.dx, y: y + j.dy, cation: n % 2 === 0 });
    }
  }
  const bubbles = ions.probeCurrents.flatMap((current, k) => {
    const abs = Math.abs(current);
    if (abs < 2e-6) return [];
    const cathode = current < 0;
    const streams = Math.min(4, 1 + Math.floor(abs / 0.15e-3));
    const count = cathode ? streams : Math.max(1, Math.ceil(streams / 2));
    return Array.from({ length: count }, (_, m) => {
      const age = (ions.clock * (0.55 + 0.15 * m) + seeded(k * 9 + m)) % 1;
      const x = TIP_X - 6 - 7 * m + 2 * Math.sin(ions.clock * 5 + 2 * m);
      return { key: `b${k}-${m}`, x, y: tipY[k]! - 7 - 46 * age, opacity: 0.95 * (1 - age), r: cathode ? 2.4 : 3.1 };
    });
  });
  return (
    <g>
      {still.map((ion) => (
        <SceneIon key={ion.key} ion={ion} r={r * 0.8} opacity={0.55} />
      ))}
      {placed.map((ion) => (
        <SceneIon key={ion.key} ion={ion} r={r} />
      ))}
      {bubbles
        .filter((b) => b.y > surface + 3)
        .map((b) => (
          <circle key={b.key} cx={b.x} cy={b.y} r={b.r} fill="#e9f6ff" fillOpacity={0.45} stroke="#ffffff" strokeWidth={1} opacity={b.opacity} />
        ))}
    </g>
  );
}

/**
 * Sahnenin en altında, su yatağının altındaki toprak şeridinde tek satırlık iyon açıklaması:
 * katyon, anyon ve gaz kabarcığı. Prob yazılarına ve ölçü iskelesine binmez; yer darsa yazı küçülür.
 */
function IonLegend({ viewBox, fs }: { viewBox: readonly [number, number, number, number]; fs: number }) {
  const items = [
    { kind: 'cation' as const, text: tr.baraj.ions.cation },
    { kind: 'anion' as const, text: tr.baraj.ions.anion },
    { kind: 'gas' as const, text: tr.baraj.ions.gas },
  ];
  const chars = items.reduce((n, item) => n + item.text.length, 0);
  // Genişlik ≈ boyut · (iki kenar boşluğu + üç simge ve aralığı + iki öğe arası + harfler).
  const units = 1.2 + items.length * 1.7 + (items.length - 1) * 1.1 + chars * 0.5;
  const size = Math.min(fs * 0.72, (viewBox[2] - 16) / units);
  const pad = size * 0.6;
  const h = size * 1.7;
  const x = viewBox[0] + 8;
  const y = viewBox[1] + viewBox[3] - h - 6;
  const r = size * 0.5;
  let cursor = x + pad;
  const placed = items.map((item) => {
    const cx = cursor + r;
    cursor = cx + r + size * 0.45 + item.text.length * size * 0.5 + size * 1.1;
    return { ...item, cx };
  });
  const w = cursor - size * 1.1 + pad - x;
  const cy = y + h / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#ffffff" fillOpacity={0.9} stroke="#c3cad2" strokeWidth={1} />
      {placed.map((item) => (
        <g key={item.kind}>
          {item.kind === 'gas' ? (
            <circle cx={item.cx} cy={cy} r={r * 0.8} fill="#e9f6ff" stroke="#5f8fb8" strokeWidth={1.2} />
          ) : (
            <SceneIon ion={{ key: item.kind, x: item.cx, y: cy, cation: item.kind === 'cation' }} r={r} />
          )}
          <text x={item.cx + r + size * 0.45} y={cy + size * 0.36} fontSize={size} fill="#1d2733" style={{ fontFamily: 'var(--font-sans)' }}>
            {item.text}
          </text>
        </g>
      ))}
    </g>
  );
}

export function BarajSahnesi({ level, wet, lamps, mode, running, layout, textPx, lampLabels = true, ions, onPreview, onCommit, className = '' }: BarajSahnesiProps) {
  const id = useId().replace(/:/g, '');
  const viewBox = VIEW_BOXES[layout];
  const { ref, scale } = useScale(viewBox);
  /** Yazı boyu (görünüm birimi). */
  const fs = textPx / scale;
  const halo = { stroke: '#ffffff', strokeWidth: fs * 0.29, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };
  const sans = { fontFamily: 'var(--font-sans)' };
  const mono = { fontFamily: 'var(--font-mono)' };
  const surface = levelY(level);
  const left = bankX(surface);
  const filling = running && mode === 'fill' && level < 100;
  const draining = running && mode === 'drain' && level > 0;
  const lampText = LAMPS.map(({ key }) => `${tr.baraj.lampNames[key]} ${lamps[key] > 0.3 ? tr.baraj.lampOn : tr.baraj.lampOff}`).join(', ');

  // --- Tutamak: sürükleme ve tuşlar ------------------------------------------------------
  const drag = useRef<{ pointer: number; offset: number; level: number } | null>(null);
  const [focusRing, setFocusRing] = useState(false);
  const toLevel = (clientX: number, clientY: number, offset: number) => {
    const svg = ref.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return level;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return yLevel(p.y + offset);
  };
  const onPointerDown = (e: ReactPointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const svg = ref.current;
    const ctm = svg?.getScreenCTM();
    const y = ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()).y : surface;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointer: e.pointerId, offset: surface - y, level };
    onPreview(level);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    d.level = toLevel(e.clientX, e.clientY, d.offset);
    onPreview(d.level);
  };
  const endDrag = (e: ReactPointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    onCommit(Math.round(d.level));
    onPreview(null);
  };
  const onKeyDown = (e: ReactKeyboardEvent<SVGGElement>) => {
    const steps: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    let next: number | null = null;
    if (e.key in steps) next = Math.round(level) + steps[e.key]!;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onCommit(Math.min(100, Math.max(0, next)));
  };

  // Etiket ve tutamak ölçüleri (yazı boyuna bağlı).
  const tagFont = fs * 1.1;
  const tagText = tr.baraj.handleText(Math.round(level));
  const tagH = fs * 1.85;
  const tagW = tagText.length * 0.6 * tagFont + 1.15 * tagFont;
  const tagX = STAFF_X - 7 - tagW;
  const handleW = fs * 2.9;
  const handleX = tagX - fs * 0.57 - handleW;
  const tagTop = Math.min(BED_Y - tagH / 2, Math.max(FULL_Y - tagH / 2, surface - tagH / 2));
  const minHit = 44 / scale;
  const hitW = Math.max(minHit, tagX + tagW - handleX + 6);
  const hitH = Math.max(minHit, tagH + 8);
  const hitX = (handleX + tagX + tagW) / 2 - hitW / 2;
  const hitY = tagTop + tagH / 2 - hitH / 2;
  const tri = tagH * 0.21;
  const hcx = handleX + handleW / 2;
  const hcy = tagTop + tagH / 2;

  const badgeR = fs * 0.76;
  const badgeX = FACE_X + 26 + badgeR * 1.38;

  return (
    <div className={`relative ${className}`}>
    <svg
      ref={ref}
      viewBox={viewBox.join(' ')}
      role="img"
      aria-label={tr.baraj.sceneLabel(Math.round(level), lampText) + (ions && ions.channels.length > 0 ? ` ${tr.baraj.ions.sceneLabel}` : '')}
      className="absolute inset-0 h-full w-full"
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

      {/* Sudaki iyonlar ve elektroliz kabarcıkları (simülasyon çalışırken) */}
      {level > 0.2 && ions && <SceneIons ions={ions} surface={surface} r={Math.max(4.5, fs * 0.38)} />}

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
              <text x={STAFF_X - 4} y={levelY(p) + fs * 0.34} textAnchor="end" fontSize={fs} fill="#1d2733" {...halo} style={mono}>
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

      {/* Problar ve eşik çizgileri: numaralı rozet ve "Seviye n"; ortak prob "+" rozeti */}
      {TANK_PROBE_HEIGHTS.map((h, k) => {
        const y = levelY(h);
        const on = wet[k] === true;
        const colors = k > 0 ? LEVEL_COLORS[k as LevelNo] : null;
        return (
          <g key={h}>
            {k > 0 && <line x1={STAFF_X + 12} x2={452} y1={y} y2={y} stroke="#ffffff" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.8} />}
            <line x1={452} x2={FACE_X + 14 + k * 4} y1={y} y2={y} stroke="#2c3846" strokeWidth={3} strokeLinecap="round" />
            <line x1={FACE_X + 14 + k * 4} x2={FACE_X + 14 + k * 4} y1={y} y2={CREST_Y - 6} stroke="#2c3846" strokeWidth={1.4} />
            {on && <circle cx={452} cy={y} r={9} fill="#9fe0ff" opacity={0.7} filter={`url(#${id}glow)`} />}
            <circle cx={452} cy={y} r={5} fill={on ? '#bff0ff' : '#9aa3ad'} stroke="#2c3846" strokeWidth={1.5} />
            {colors ? (
              <>
                <circle cx={badgeX} cy={y} r={badgeR} fill={colors.badge} stroke="#ffffff" strokeWidth={badgeR * 0.15} />
                <text x={badgeX} y={y + badgeR * 0.42} textAnchor="middle" fontSize={badgeR * 1.25} fontWeight={700} fill={colors.badgeInk} style={sans}>
                  {k}
                </text>
              </>
            ) : (
              <>
                <rect x={badgeX - badgeR} y={y - badgeR} width={badgeR * 2} height={badgeR * 2} rx={badgeR * 0.35} fill="#2c3846" />
                <path
                  d={`M${badgeX} ${y - badgeR * 0.5}V${y + badgeR * 0.5}M${badgeX - badgeR * 0.5} ${y}H${badgeX + badgeR * 0.5}`}
                  stroke="#ffffff"
                  strokeWidth={badgeR * 0.2}
                  strokeLinecap="round"
                />
              </>
            )}
            <text x={badgeX + badgeR + fs * 0.38} y={y + fs * 0.38} fontSize={fs} fontWeight={600} fill="#1d2733" {...halo} style={sans}>
              {k === 0 ? tr.baraj.common : tr.baraj.level(k)}
            </text>
          </g>
        );
      })}

      {/* Kontrol kulübesi ve ışık kulesi: numaralı lambalar */}
      <rect x={486} y={78} width={34} height={26} fill="#eef1f4" stroke="#59636e" strokeWidth={1.5} />
      <path d="M482 80L503 64L524 80" fill="#c45b4a" stroke="#59636e" strokeWidth={1.5} strokeLinejoin="round" />
      <rect x={498} y={88} width={10} height={16} fill="#6c7782" />
      <path d="M520 92L646 92" fill="none" stroke="#2c3846" strokeWidth={1.4} />
      <line x1={668} x2={668} y1={214} y2={424} stroke="#59636e" strokeWidth={6} />
      <rect x={644} y={70} width={48} height={146} rx={10} fill="#232a31" stroke="#11161b" strokeWidth={2} />
      {LAMPS.map(({ key, level: n, numberInk }, i) => {
        const b = Math.min(1, Math.max(0, lamps[key]));
        const lit = b > 0.05;
        const color = LEVEL_COLORS[n].lamp;
        const cy = 96 + i * 46;
        return (
          <g key={key}>
            {lit && <circle cx={668} cy={cy} r={30} fill={color} opacity={0.6 * b} filter={`url(#${id}glow)`} />}
            <circle cx={668} cy={cy} r={17} fill={lit ? color : '#3b434c'} opacity={lit ? 0.4 + 0.6 * b : 1} stroke={color} strokeWidth={2.5} />
            <text x={668} y={cy + 6} textAnchor="middle" fontSize={17} fontWeight={700} fill={lit && b > 0.3 ? numberInk : '#aeb6bf'} style={sans}>
              {n}
            </text>
            {lampLabels && (
              <text x={698} y={cy + fs * 0.38} fontSize={fs * 1.045} fontWeight={600} fill="#1d2733" {...halo} style={sans}>
                {tr.baraj.level(n)}
              </text>
            )}
          </g>
        );
      })}

      {ions && level > TANK_PROBE_HEIGHTS[0] && <IonLegend viewBox={viewBox} fs={fs} />}
    </svg>
    {/* Seviye etiketi ve sürükleme tutamağı (ayrı katman) */}
    <svg
      viewBox={viewBox.join(' ')}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ touchAction: 'none' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        role="slider"
        tabIndex={0}
        aria-label={tr.baraj.handle}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level)}
        aria-valuetext={tagText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onFocus={(e) => setFocusRing(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocusRing(false)}
        style={{ cursor: 'ns-resize', touchAction: 'none', outline: 'none', pointerEvents: 'auto' }}
      >
        <rect x={hitX} y={hitY} width={hitW} height={hitH} fill="transparent" />
        {focusRing && (
          <rect x={hitX - 2} y={hitY - 2} width={hitW + 4} height={hitH + 4} rx={hitH / 2} fill="none" stroke="#1f6feb" strokeWidth={3 / scale} />
        )}
        <rect x={tagX} y={tagTop} width={tagW} height={tagH} rx={tagH / 2} fill={WATER} stroke="#ffffff" strokeWidth={tagH * 0.073} />
        <text x={tagX + tagW / 2} y={tagTop + tagH / 2 + tagFont * 0.35} textAnchor="middle" fontSize={tagFont} fontWeight={600} fill="#ffffff" style={mono}>
          {tagText}
        </text>
        <rect x={handleX} y={tagTop} width={handleW} height={tagH} rx={tagH / 2} fill="#ffffff" stroke={WATER} strokeWidth={tagH * 0.094} />
        <path
          d={`M${hcx - tri} ${hcy - tri * 0.25}L${hcx} ${hcy - tri * 1.25}L${hcx + tri} ${hcy - tri * 0.25}ZM${hcx - tri} ${hcy + tri * 0.25}L${hcx} ${hcy + tri * 1.25}L${hcx + tri} ${hcy + tri * 0.25}Z`}
          fill={WATER}
        />
      </g>
    </svg>
    </div>
  );
}
