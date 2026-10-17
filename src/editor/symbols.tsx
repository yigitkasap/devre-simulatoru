// Bileşen sembolleri. Yerel koordinatlarda (piksel, GRID = 10) çizilir; iki uçlu bileşenlerin
// pinleri (−40, 0) ve (40, 0) noktalarındadır. Çizgiler `currentColor` ile çizilir, böylece
// seçim ve vurgu rengi kapsayıcı grubun `color` değeriyle değişir.

import { CATALOG, partProp } from '../model/catalog';
import { GRID } from '../model/types';
import { WAVEFORMS, type Waveform } from '../sim/devices/acsource';
import { LED_COLORS, LED_MODELS, type LedColor } from '../sim/devices/led';
import type { Rotation } from '../model/types';
import { boolProp, numProp, strProp, type DeviceType, type Props } from '../sim/netlist';
import { formatSI } from '../sim/units';
import { ANION_COLOR, CATION_COLOR, ionsOnLine, jiggle, seeded, type IonView, type PlacedIon } from './ions';
import type { ResistorStyle } from './settings';

/** Simülasyon sırasında sembolün görünümünü değiştiren değerler (Aşama 3-4). */
export interface LiveVisual {
  /** LED: 0..1 parlaklık. */
  readonly brightness?: number;
  readonly burned?: boolean;
  readonly overCurrent?: boolean;
  /** Kondansatör: dolma oranı (−1..1). */
  readonly charge?: number;
  /** DC güç kaynağı: akım sınırındaki (CC) çıkışlar. */
  readonly currentLimited?: readonly boolean[];
  /** Su haznesi: su seviyesi (%). */
  readonly level?: number;
  /** Su haznesi: suda akımı taşıyan iyonlar. */
  readonly ions?: IonView;
  /** Direnç: harcanan gücün güç sınırına oranı (1'i aşınca ısınıyormuş gibi çizilir). */
  readonly powerRatio?: number;
  /** Röle: palet çekili mi? */
  readonly energized?: boolean;
  /** DC motor: milin (görsel olarak yavaşlatılmış) dönme açısı (radyan). */
  readonly angle?: number;
}

export interface SymbolProps {
  readonly type: DeviceType;
  readonly props: Props;
  readonly resistorStyle: ResistorStyle;
  /** Parçanın dönüşü: sembol içindeki yazılar (V, A, +, −) bunun tersine döndürülüp dik tutulur. */
  readonly rotation?: Rotation;
  readonly live?: LiveVisual;
}

const PAPER = { fill: 'var(--color-paper)' } as const;

const line = {
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
} as const;

function Lead({ from, to }: { from: number; to: number }) {
  return <line x1={from} y1={0} x2={to} y2={0} {...line} />;
}

/** Küçük "+" işareti (kutup göstermek için). */
function Plus({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
      <line x1={x - 3.5} y1={y} x2={x + 3.5} y2={y} />
      <line x1={x} y1={y - 3.5} x2={x} y2={y + 3.5} />
    </g>
  );
}

/** Küçük "−" işareti; parça dönse de yatay kalır. */
function Minus({ x, y, rotation }: { x: number; y: number; rotation: Rotation }) {
  return (
    <line
      x1={x - 3.5}
      y1={y}
      x2={x + 3.5}
      y2={y}
      transform={rotation ? `rotate(${-rotation} ${x} ${y})` : undefined}
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  );
}

function Battery({ rotation }: { rotation: Rotation }) {
  return (
    <g>
      <Lead from={-40} to={-5} />
      <Lead from={5} to={40} />
      {/* Uzun ince levha: + kutup; kısa kalın levha: − kutup */}
      <line x1={-5} y1={-16} x2={-5} y2={16} stroke="currentColor" strokeWidth={2.2} />
      <line x1={5} y1={-8} x2={5} y2={8} stroke="currentColor" strokeWidth={5} />
      <Plus x={-16} y={-11} />
      <Minus x={16} y={-11} rotation={rotation} />
    </g>
  );
}

function Ground() {
  return (
    <g {...line}>
      <line x1={0} y1={0} x2={0} y2={10} />
      <line x1={-12} y1={10} x2={12} y2={10} />
      <line x1={-7.5} y1={15} x2={7.5} y2={15} />
      <line x1={-3} y1={20} x2={3} y2={20} />
    </g>
  );
}

/**
 * Güç sınırını aşan direncin rengi: sınırda turuncu, iki katında ve ötesinde kırmızı (ısınıyor).
 * Sınırın altında null (normal çizim).
 */
export function heatColor(powerRatio: number | undefined): string | null {
  if (powerRatio === undefined || !(powerRatio > 1)) return null;
  const t = Math.min(1, powerRatio - 1);
  // turuncu #f08c00 → kırmızı #e03131
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(0xf0, 0xe0)}, ${mix(0x8c, 0x31)}, ${mix(0x00, 0x31)})`;
}

function Resistor({ style, powerRatio }: { style: ResistorStyle; powerRatio?: number }) {
  const heat = heatColor(powerRatio);
  // Isınan direncin çevresinde yumuşak bir kızıllık; gövde turuncu-kırmızı.
  const glow = heat ? <ellipse cx={0} cy={0} rx={26} ry={13} fill={heat} opacity={0.28} style={{ filter: 'blur(5px)' }} /> : null;
  if (style === 'iec') {
    return (
      <g>
        {glow}
        <Lead from={-40} to={-22} />
        <Lead from={22} to={40} />
        <rect
          x={-22}
          y={-7}
          width={44}
          height={14}
          style={heat ? { fill: heat, fillOpacity: 0.35 } : PAPER}
          stroke={heat ?? 'currentColor'}
          strokeWidth={heat ? 2.6 : 2}
        />
      </g>
    );
  }
  const zigzag = '-40,0 -24,0 -21,-7 -15,7 -9,-7 -3,7 3,-7 9,7 15,-7 21,7 24,0 40,0';
  if (!heat) {
    return <polyline points={zigzag} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
  }
  return (
    <g>
      {glow}
      <polyline points={zigzag} fill="none" stroke={heat} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
}

/** Bobin: dört sarım (yarım daire), uçlar dirençteki gibi ±24 px'ten başlar. */
function Inductor() {
  return (
    <g>
      <Lead from={-40} to={-24} />
      <Lead from={24} to={40} />
      <path d="M-24,0 a6,6 0 0 1 12,0 a6,6 0 0 1 12,0 a6,6 0 0 1 12,0 a6,6 0 0 1 12,0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

/**
 * Transformatör: solda birincil, sağda ikincil sargı (dört sarım), ortada demir çekirdek (iki
 * çizgi). Noktalar, aynı anda aynı işaretli gerilimde olan uçları gösterir.
 */
function Transformer() {
  const coil = (x: number, dir: 1 | -1) =>
    `M${x},-24 ${Array.from({ length: 4 }, () => `a6,6 0 0 ${dir === 1 ? 1 : 0} 0,12`).join(' ')}`;
  return (
    <g>
      <path d="M-40,-30H-20V-24M-40,30H-20V24M40,-30H20V-24M40,30H20V24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={coil(-20, 1)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d={coil(20, -1)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={-4} y1={-28} x2={-4} y2={28} stroke="currentColor" strokeWidth={2} />
      <line x1={4} y1={-28} x2={4} y2={28} stroke="currentColor" strokeWidth={2} />
      <circle cx={-27} cy={-21} r={2.6} fill="currentColor" />
      <circle cx={27} cy={-21} r={2.6} fill="currentColor" />
    </g>
  );
}

/** Kondansatör: elektrolitikte + ucu işaretli (kutuplu), seramik/filmde işaretsiz. */
function Capacitor({ polarized }: { polarized: boolean }) {
  return (
    <g>
      <Lead from={-40} to={-4} />
      <Lead from={4} to={40} />
      <line x1={-4} y1={-13} x2={-4} y2={13} stroke="currentColor" strokeWidth={2.6} />
      <line x1={4} y1={-13} x2={4} y2={13} stroke="currentColor" strokeWidth={2.6} />
      {polarized && <Plus x={-13} y={-10} />}
    </g>
  );
}

function DiodeBody({ fill }: { fill: string }) {
  return (
    <g>
      <Lead from={-40} to={-9} />
      <Lead from={9} to={40} />
      <path d="M-9,-10 L-9,10 L9,0 Z" fill={fill} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <line x1={9} y1={-10} x2={9} y2={10} stroke="currentColor" strokeWidth={2.4} />
    </g>
  );
}

function Arrow({ x, y }: { x: number; y: number }) {
  // (x, y)'den sağ üste doğru ok
  return (
    <g stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="currentColor">
      <line x1={x} y1={y} x2={x + 7} y2={y - 7} />
      <path d={`M${x + 8.5},${y - 8.5} l-5,1 l4,4 Z`} strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
}

function Led({ color, live }: { color: LedColor; live: LiveVisual | undefined }) {
  const light = LED_MODELS[color].lightColor;
  const brightness = live?.burned ? 0 : (live?.brightness ?? 0);
  return (
    <g>
      {brightness > 0.01 && (
        <circle cx={0} cy={0} r={14 + 16 * brightness} fill={light} opacity={0.18 + 0.5 * brightness} style={{ filter: 'blur(6px)' }} />
      )}
      {live?.overCurrent && !live.burned && (
        <circle cx={0} cy={0} r={20} fill="none" stroke="#f5b400" strokeWidth={3} strokeDasharray="5 4" />
      )}
      <DiodeBody fill={live?.burned ? '#4a4a4a' : brightness > 0.01 ? light : `${light}33`} />
      <Arrow x={-1} y={-13} />
      <Arrow x={6} y={-9} />
      {live?.burned && <BurnMark />}
    </g>
  );
}

/** Yanmış LED: çatlak ve küçük duman. */
function BurnMark() {
  return (
    <g>
      <path d="M-6,-7 L-1,-1 L-5,2 L1,8" fill="none" stroke="#f2f2f2" strokeWidth={1.5} strokeLinejoin="round" />
      <g fill="#8a8f98" opacity={0.75}>
        <circle cx={-4} cy={-22} r={4} />
        <circle cx={2} cy={-27} r={5} />
        <circle cx={-1} cy={-34} r={3.5} />
      </g>
    </g>
  );
}

function Switch({ closed }: { closed: boolean }) {
  return (
    <g>
      <Lead from={-40} to={-14} />
      <Lead from={14} to={40} />
      {closed ? (
        <line x1={-14} y1={0} x2={14} y2={0} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      ) : (
        <line x1={-14} y1={0} x2={12} y2={-15} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      )}
      <circle cx={-14} cy={0} r={2.8} style={PAPER} stroke="currentColor" strokeWidth={1.6} />
      <circle cx={14} cy={0} r={2.8} style={PAPER} stroke="currentColor" strokeWidth={1.6} />
    </g>
  );
}

/**
 * Röle: solda sargı (IEC röle sargısı: dikdörtgen), sağda değiştirme kontağı; kesikli çizgi
 * sargının paleti (kontak dilini) çektiğini gösterir. Sargı uçları (−40, ∓20); kontak: NK (40, −30),
 * NA (40, −20), C (40, 20). Dil C'nin ucunda döner: bırakılmışken NK'ya, çekiliyken NA'ya değer.
 */
function Relay({ energized, rotation }: { energized: boolean; rotation: Rotation }) {
  const tipX = energized ? 23 : 5;
  // Dilin y = 2'deki konumu (kesikli çizgi oraya kadar).
  const linkX = 14 + ((tipX - 14) * 14) / 27;
  return (
    <g>
      <path
        d="M-40,-20H-22V-16M-40,20H-22V16M40,-30H4V-15M40,-20H24V-15M40,20H14V16"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x={-30} y={-16} width={16} height={32} rx={1.5} style={PAPER} stroke="currentColor" strokeWidth={2} />
      {energized && <rect x={-30} y={-16} width={16} height={32} rx={1.5} fill="currentColor" opacity={0.18} />}
      <line x1={-14} y1={2} x2={linkX - 1.5} y2={2} stroke="currentColor" strokeWidth={1.4} strokeDasharray="3 3" />
      <line x1={14} y1={16} x2={tipX} y2={-11} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={14} cy={16} r={2.8} style={PAPER} stroke="currentColor" strokeWidth={1.6} />
      <circle cx={4} cy={-12} r={2.8} style={PAPER} stroke="currentColor" strokeWidth={1.6} />
      <circle cx={24} cy={-12} r={2.8} style={PAPER} stroke="currentColor" strokeWidth={1.6} />
      <DeviceText x={32} y={-35} rotation={rotation} size={7}>
        NK
      </DeviceText>
      <DeviceText x={32} y={-25} rotation={rotation} size={7}>
        NA
      </DeviceText>
      <DeviceText x={30} y={14} rotation={rotation} size={7}>
        C
      </DeviceText>
    </g>
  );
}

/**
 * DC motor (IEC: daire içinde M). Dairenin içindeki nokta milin dönüşünü gösterir (görsel olarak
 * yavaşlatılmış); + uç solda.
 */
function Motor({ angle, rotation }: { angle: number; rotation: Rotation }) {
  const r = 12.5;
  return (
    <g>
      <Lead from={-40} to={-17} />
      <Lead from={17} to={40} />
      <circle cx={0} cy={0} r={17} style={PAPER} stroke="currentColor" strokeWidth={2} />
      <circle cx={r * Math.cos(angle - Math.PI / 2)} cy={r * Math.sin(angle - Math.PI / 2)} r={2.2} fill="currentColor" />
      <DeviceText x={0} y={0} rotation={rotation} size={13}>
        M
      </DeviceText>
      <Plus x={-26} y={-8} />
    </g>
  );
}

function Meter({ letter, rotation }: { letter: string; rotation: Rotation }) {
  return (
    <g>
      <Lead from={-40} to={-15} />
      <Lead from={15} to={40} />
      <circle cx={0} cy={0} r={15} style={PAPER} stroke="currentColor" strokeWidth={2} />
      <text
        x={0}
        y={0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={16}
        fontWeight={700}
        fill="currentColor"
        transform={rotation ? `rotate(${-rotation})` : undefined}
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {letter}
      </text>
      <Plus x={-27} y={-8} />
    </g>
  );
}

/** Dalga biçiminin küçük çizimi: (cx, cy) merkezli, genişliği 2·w, yüksekliği 2·h. */
export function wavePath(waveform: Waveform, w: number, h: number, cx = 0, cy = 0): string {
  const p = (x: number, y: number) => `${(cx + x).toFixed(2)},${(cy + y).toFixed(2)}`;
  switch (waveform) {
    case 'sine': {
      const points: string[] = [];
      for (let i = 0; i <= 24; i++) points.push(p(-w + (2 * w * i) / 24, -h * Math.sin((Math.PI * 2 * i) / 24)));
      return `M${points.join(' L')}`;
    }
    case 'square':
      return `M${p(-w, 0)} L${p(-w, -h)} L${p(0, -h)} L${p(0, h)} L${p(w, h)} L${p(w, 0)}`;
    case 'triangle':
      return `M${p(-w, 0)} L${p(-w / 2, -h)} L${p(w / 2, h)} L${p(w, 0)}`;
  }
}

function AcSource({ waveform, rotation }: { waveform: Waveform; rotation: Rotation }) {
  return (
    <g>
      <Lead from={-40} to={-15} />
      <Lead from={15} to={40} />
      <circle cx={0} cy={0} r={15} style={PAPER} stroke="currentColor" strokeWidth={2} />
      {/* Dalga, parça dönse de yatay kalır. */}
      <path
        d={wavePath(waveform, 8.5, 6)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        transform={rotation ? `rotate(${-rotation})` : undefined}
      />
      <Plus x={-27} y={-8} />
    </g>
  );
}

/** Osiloskop: küçük ekranlı bir kutu; girişler sol kenarda (A, B ve ortak uç). */
function Oscilloscope({ rotation, earthed }: { rotation: Rotation; earthed: boolean }) {
  const upright = (x: number, y: number) => (rotation ? `rotate(${-rotation} ${x} ${y})` : undefined);
  const pinLabel = (text: string, y: number) => (
    <text
      x={-23}
      y={y + 0.5}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={9}
      fontWeight={700}
      fill="currentColor"
      transform={upright(-23, y)}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {text}
    </text>
  );
  return (
    <g>
      <line x1={-50} y1={-20} x2={-30} y2={-20} {...line} />
      <line x1={-50} y1={0} x2={-30} y2={0} {...line} />
      <line x1={-50} y1={20} x2={-30} y2={20} {...line} />
      <rect x={-30} y={-28} width={68} height={56} rx={4} style={PAPER} stroke="currentColor" strokeWidth={2} />
      <g transform={upright(10, -3)}>
        <rect x={-12} y={-20} width={44} height={34} rx={2} fill="#1e2a25" />
        <path d={wavePath('sine', 17, 9, 10, -3)} fill="none" stroke="#e8c547" strokeWidth={1.6} strokeLinecap="round" />
      </g>
      {pinLabel('A', -20)}
      {pinLabel('B', 0)}
      {/* Ortak uç: küçük toprak işareti (şebeke toprağına bağlıysa yeşil) */}
      <g stroke={earthed ? 'var(--color-earth)' : 'currentColor'} strokeWidth={1.4} strokeLinecap="round" transform={upright(-23, 20)}>
        <line x1={-23} y1={15} x2={-23} y2={19} />
        <line x1={-28} y1={19} x2={-18} y2={19} />
        <line x1={-26} y1={22} x2={-20} y2={22} />
        <line x1={-24} y1={25} x2={-22} y2={25} />
      </g>
      <circle cx={0} cy={20} r={2} fill="currentColor" />
      <circle cx={10} cy={20} r={2} fill="currentColor" />
      <circle cx={20} cy={20} r={2} fill="currentColor" />
    </g>
  );
}

/** Zener diyot: katot çizgisinin uçları kıvrık (Z biçimi). */
function Zener() {
  return (
    <g>
      <Lead from={-40} to={-9} />
      <Lead from={9} to={40} />
      <path d="M-9,-10 L-9,10 L9,0 Z" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <path d="M14,-14 L9,-10 L9,10 L4,14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" />
    </g>
  );
}

/** (tipX, tipY) ucunda, (dx, dy) yönünü gösteren dolu ok başı. */
function arrowHead(tipX: number, tipY: number, dx: number, dy: number, length = 9, half = 4.2): string {
  const n = Math.hypot(dx, dy);
  const ux = dx / n;
  const uy = dy / n;
  const bx = tipX - ux * length;
  const by = tipY - uy * length;
  return `M${tipX.toFixed(2)},${tipY.toFixed(2)} L${(bx - uy * half).toFixed(2)},${(by + ux * half).toFixed(2)} L${(bx + uy * half).toFixed(2)},${(by - ux * half).toFixed(2)} Z`;
}

/** Transistör gövdesi: çevresindeki daire. Uçlar (−40, 0), (20, −40), (20, 40). */
function Envelope() {
  return <circle cx={6} cy={0} r={25} style={PAPER} stroke="currentColor" strokeWidth={1.4} />;
}

/** Bipolar transistör: baz çubuğu, kollektör ve emetör eğik çizgileri; ok emetörde (NPN dışa, PNP içe). */
function Bjt({ pnp }: { pnp: boolean }) {
  // Emetör çizgisi (−10, 7) → (20, 24)
  const dx = 30;
  const dy = 17;
  const arrow = pnp ? arrowHead(-10 + dx * 0.35, 7 + dy * 0.35, -dx, -dy) : arrowHead(-10 + dx * 0.85, 7 + dy * 0.85, dx, dy);
  return (
    <g>
      <Envelope />
      <g {...line}>
        <line x1={-40} y1={0} x2={-10} y2={0} />
        <line x1={-10} y1={-7} x2={20} y2={-24} />
        <line x1={20} y1={-24} x2={20} y2={-40} />
        <line x1={-10} y1={7} x2={20} y2={24} />
        <line x1={20} y1={24} x2={20} y2={40} />
      </g>
      <line x1={-10} y1={-14} x2={-10} y2={14} stroke="currentColor" strokeWidth={3.4} />
      <path d={arrow} fill="currentColor" stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
}

/** JFET: kanal çubuğu; kapı ucundaki ok N kanalda kanala doğru, P kanalda dışa doğru. */
function Jfet({ p }: { p: boolean }) {
  const arrow = p ? arrowHead(-26, 0, -1, 0) : arrowHead(-10, 0, 1, 0);
  return (
    <g>
      <Envelope />
      <g {...line}>
        <line x1={-40} y1={0} x2={-10} y2={0} />
        <polyline points="-8,-12 20,-12 20,-40" fill="none" strokeLinejoin="round" />
        <polyline points="-8,12 20,12 20,40" fill="none" strokeLinejoin="round" />
      </g>
      <line x1={-8} y1={-18} x2={-8} y2={18} stroke="currentColor" strokeWidth={3.4} />
      <path d={arrow} fill="currentColor" stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
}

/**
 * Kanal oluşturmalı MOSFET: yalıtılmış kapı plakası, kesik kanal (kanal ancak V_GS > V_T iken
 * oluşur); gövde source'a bağlı, gövde okunun yönü N kanalda kanala doğru, P kanalda dışa doğru.
 */
function Mosfet({ p }: { p: boolean }) {
  const arrow = p ? arrowHead(16, 0, 1, 0) : arrowHead(-4, 0, -1, 0);
  return (
    <g>
      <Envelope />
      <g {...line}>
        <line x1={-40} y1={0} x2={-15} y2={0} />
        <line x1={-15} y1={-14} x2={-15} y2={14} />
        <polyline points="-7,-12 20,-12 20,-40" fill="none" strokeLinejoin="round" />
        <polyline points="-7,12 20,12 20,40" fill="none" strokeLinejoin="round" />
        <polyline points="-7,0 20,0 20,12" fill="none" strokeLinejoin="round" />
      </g>
      <g stroke="currentColor" strokeWidth={3.4}>
        <line x1={-7} y1={-17} x2={-7} y2={-7} />
        <line x1={-7} y1={-4} x2={-7} y2={4} />
        <line x1={-7} y1={7} x2={-7} y2={17} />
      </g>
      <path d={arrow} fill="currentColor" stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round" />
    </g>
  );
}

/** Cihaz üzerindeki küçük yazı (parça dönse de dik kalır). */
function DeviceText({
  x,
  y,
  rotation,
  children,
  size = 8.5,
  anchor = 'middle',
  color = 'currentColor',
  weight = 700,
}: {
  x: number;
  y: number;
  rotation: Rotation;
  children: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  color?: string;
  weight?: number;
}) {
  return (
    <text
      x={x}
      y={y + 0.5}
      textAnchor={anchor}
      dominantBaseline="central"
      fontSize={size}
      fontWeight={weight}
      fill={color}
      transform={rotation ? `rotate(${-rotation} ${x} ${y})` : undefined}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {children}
    </text>
  );
}

/** Şebeke toprağı işareti (topraklı cihazın COM ucunda yeşil). */
function EarthGlyph({ x, y, rotation, earthed }: { x: number; y: number; rotation: Rotation; earthed: boolean }) {
  return (
    <g
      stroke={earthed ? 'var(--color-earth)' : 'currentColor'}
      strokeWidth={1.4}
      strokeLinecap="round"
      transform={rotation ? `rotate(${-rotation} ${x} ${y})` : undefined}
    >
      <line x1={x} y1={y - 5} x2={x} y2={y - 1} />
      <line x1={x - 5} y1={y - 1} x2={x + 5} y2={y - 1} />
      <line x1={x - 3} y1={y + 2} x2={x + 3} y2={y + 2} />
      <line x1={x - 1} y1={y + 5} x2={x + 1} y2={y + 5} />
    </g>
  );
}

/** Fonksiyon üreteci: çıkışlar sağ kenarda (OUT, TTL, COM); ön yüzde frekans göstergesi. */
function FunctionGenerator({ props, rotation }: { props: Props; rotation: Rotation }) {
  const waveform = strProp(props, 'waveform', WAVEFORMS, 'sine');
  const earthed = boolProp(props, 'earthed', true);
  const frequency = formatSI(Math.max(0, Number(props.frequency ?? 1000)), 'Hz', { trim: true, digits: 4 });
  return (
    <g>
      <line x1={30} y1={-20} x2={50} y2={-20} {...line} />
      <line x1={30} y1={0} x2={50} y2={0} {...line} />
      <line x1={30} y1={20} x2={50} y2={20} {...line} />
      <rect x={-40} y={-28} width={70} height={56} rx={4} style={PAPER} stroke="currentColor" strokeWidth={2} />
      <g transform={rotation ? `rotate(${-rotation} -14 -8)` : undefined}>
        <rect x={-34} y={-20} width={40} height={24} rx={2} fill="#1e2a25" />
        <path d={wavePath(waveform, 6.5, 5, -26.5, -8)} fill="none" stroke="#a6f4bd" strokeWidth={1.4} strokeLinecap="round" />
        <text x={2} y={-8.5} textAnchor="end" dominantBaseline="central" fontSize={6.5} fill="#a6f4bd" style={{ fontFamily: 'var(--font-mono)' }}>
          {frequency}
        </text>
      </g>
      <DeviceText x={21} y={-20} rotation={rotation} size={7}>
        OUT
      </DeviceText>
      <DeviceText x={21} y={0} rotation={rotation} size={7}>
        TTL
      </DeviceText>
      <EarthGlyph x={21} y={20} rotation={rotation} earthed={earthed} />
      <circle cx={-26} cy={16} r={4} fill="none" stroke="currentColor" strokeWidth={1.2} />
      <circle cx={-12} cy={16} r={4} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </g>
  );
}

/** DC güç kaynağı: iki çıkış (+/−) sağ kenarda; her çıkışın ayar gerilimi ve CC lambası. */
function DcSupply({ props, rotation, live }: { props: Props; rotation: Rotation; live: LiveVisual | undefined }) {
  const volts = (key: string) => formatSI(Math.max(0, Number(props[key] ?? 0)), 'V', { digits: 3 });
  const outputs = [
    { y: -20, text: volts('voltage1'), cc: live?.currentLimited?.[0] ?? false },
    { y: 20, text: volts('voltage2'), cc: live?.currentLimited?.[1] ?? false },
  ];
  return (
    <g>
      {[-30, -10, 10, 30].map((y) => (
        <line key={y} x1={30} y1={y} x2={50} y2={y} {...line} />
      ))}
      <rect x={-40} y={-38} width={70} height={76} rx={4} style={PAPER} stroke="currentColor" strokeWidth={2} />
      <line x1={-40} y1={0} x2={30} y2={0} stroke="currentColor" strokeWidth={1} opacity={0.4} />
      {outputs.map(({ y, text, cc }) => (
        <g key={y}>
          <g transform={rotation ? `rotate(${-rotation} -12 ${y - 6})` : undefined}>
            <rect x={-34} y={y - 15} width={44} height={17} rx={2} fill="#1e2a25" />
            <text
              x={6}
              y={y - 6}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={8}
              fill="#a6f4bd"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {text}
            </text>
          </g>
          <circle cx={-28} cy={y + 9} r={3.2} fill={cc ? '#e5484d' : '#d0d5db'} stroke="currentColor" strokeWidth={0.8} />
          <DeviceText x={-20} y={y + 9} rotation={rotation} size={6.5} anchor="start" color={cc ? '#e5484d' : 'currentColor'}>
            CC
          </DeviceText>
        </g>
      ))}
      {[
        { y: -30, sign: '+' },
        { y: -10, sign: '−' },
        { y: 10, sign: '+' },
        { y: 30, sign: '−' },
      ].map(({ y, sign }) => (
        <DeviceText key={y} x={22} y={y} rotation={rotation} size={10}>
          {sign}
        </DeviceText>
      ))}
    </g>
  );
}

/**
 * Su haznesi (baraj): üstü açık kap, problar sağ kenardan girer (ortak prob dipte, Seviye 1–3
 * yukarı doğru); uçların yüksekliği probun ıslandığı yüksekliktir. Su canlı yükselir.
 */
/** Hazne sembolündeki problar: çubuğun yüksekliği ve suyun içindeki ucu (yerel piksel). */
const TANK_PROBES = [
  { y: 30, tip: -30, name: 'COM' },
  { y: 10, tip: -6, name: '1' },
  { y: -10, tip: -6, name: '2' },
  { y: -30, tip: -6, name: '3' },
] as const;

/** Bir iyon: renkli daire ve içinde + (katyon) ya da − (anyon). */
function Ion({ ion, r, opacity = 1 }: { ion: PlacedIon; r: number; opacity?: number }) {
  const g = r * 0.5;
  return (
    <g opacity={opacity}>
      <circle cx={ion.x} cy={ion.y} r={r} fill={ion.cation ? CATION_COLOR : ANION_COLOR} stroke="#ffffff" strokeWidth={r * 0.25} />
      <path
        d={ion.cation ? `M${ion.x - g} ${ion.y}H${ion.x + g}M${ion.x} ${ion.y - g}V${ion.y + g}` : `M${ion.x - g} ${ion.y}H${ion.x + g}`}
        stroke="#ffffff"
        strokeWidth={r * 0.36}
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Hazne sembolünde suyun içindeki iyonlar. Akım taşıyan her anot → katot kanalında üç alan çizgisi
 * boyunca katyonlar akım yönünde, anyonlar ters yönde sürüklenir; aradaki prob çubuğunun
 * üstünden geçmesin diye arada başka prob varsa çizgi sola doğru kavis yapar. Akım taşımayan
 * suda birkaç iyon yerinde kıpırdar. Akım taşıyan probun çubuğunda gaz kabarcıkları çıkar
 * (elektroliz: katotta H₂, anotta O₂).
 */
function TankIons({ ions, surface }: { ions: IonView; surface: number }) {
  const placed: PlacedIon[] = [];
  const endpoint = (k: number, other: number, c: number) => {
    const probe = TANK_PROBES[k]!;
    const xs = k === 0 ? [-20, -6, 8] : [-3, 7, 17];
    return { x: xs[c]!, y: probe.y + 2.8 * Math.sign(TANK_PROBES[other]!.y - probe.y) };
  };
  for (const ch of ions.channels) {
    const y0 = TANK_PROBES[ch.from]!.y;
    const y1 = TANK_PROBES[ch.to]!.y;
    const between = TANK_PROBES.some((p, k) => k !== ch.from && k !== ch.to && p.y > Math.min(y0, y1) && p.y < Math.max(y0, y1));
    for (let c = 0; c < 3; c++) {
      const p0 = endpoint(ch.from, ch.to, c);
      const p1 = endpoint(ch.to, ch.from, c);
      const control = between ? { x: -40, y: (p0.y + p1.y) / 2 } : { x: (p0.x + p1.x) / 2 - 3, y: (p0.y + p1.y) / 2 };
      const perSign = between ? 3 : 2;
      placed.push(...ionsOnLine(`${ch.from}-${ch.to}-${c}`, p0, control, p1, ch.phase, perSign, ch.from * 7 + ch.to * 3 + c, ions.clock, 0.8));
    }
  }
  // Akım taşımayan su da iyon doludur: yerinde kıpırdayan birkaç iyon.
  const still: PlacedIon[] = [];
  if (38 - surface > 6) {
    for (let n = 0; n < 8; n++) {
      const j = jiggle(100 + n, ions.clock, 1.1);
      const y = surface + 3 + seeded(40 + n) * (35 - surface) + j.dy;
      still.push({ key: `s${n}`, x: -34 + seeded(60 + n) * 58 + j.dx, y, cation: n % 2 === 0 });
    }
  }
  // Gaz kabarcıkları: akımla orantılı sayıda, çubuktan yukarı yükselip söner.
  const bubbles = ions.probeCurrents.flatMap((current, k) => {
    const streams = Math.min(3, Math.floor(Math.abs(current) / 0.15e-3) + (Math.abs(current) > 2e-6 ? 1 : 0));
    return Array.from({ length: streams }, (_, m) => {
      const age = (ions.clock * (0.7 + 0.2 * m) + seeded(k * 5 + m)) % 1;
      const probe = TANK_PROBES[k]!;
      const x = (k === 0 ? -24 : -2) + 12 * m + 1.2 * Math.sin(ions.clock * 6 + m);
      return { key: `b${k}-${m}`, x, y: probe.y - 2 - 9 * age, opacity: 0.9 * (1 - age), r: k === 0 ? 1.5 : 1.2 };
    });
  });
  return (
    <g pointerEvents="none">
      {still.map((ion) => (
        <Ion key={ion.key} ion={ion} r={1.9} opacity={0.6} />
      ))}
      {placed.map((ion) => (
        <Ion key={ion.key} ion={ion} r={2.3} />
      ))}
      {bubbles
        .filter((b) => b.y > surface + 1)
        .map((b) => (
          <circle key={b.key} cx={b.x} cy={b.y} r={b.r} fill="#e9f6ff" fillOpacity={0.5} stroke="#ffffff" strokeWidth={0.6} opacity={b.opacity} />
        ))}
    </g>
  );
}

function Tank({ props, rotation, live }: { props: Props; rotation: Rotation; live: LiveVisual | undefined }) {
  const level = Math.min(100, Math.max(0, live?.level ?? numProp(props, 'level', 0)));
  // Yükseklik %0 → y = 40, %100 → y = −40 (uçlar −30, −10, 10, 30'da: %87,5, 62,5, 37,5, 12,5).
  const surface = Math.max(-38, 40 - 0.8 * level);
  const probes = TANK_PROBES;
  return (
    <g>
      <rect x={-40} y={-40} width={70} height={80} rx={3} style={PAPER} stroke="none" />
      {level > 0.5 && (
        <g>
          <rect x={-38} y={surface} width={66} height={38 - surface} fill="#5aa9e6" opacity={0.42} />
          <path
            d={`M-38 ${surface} q8.25 -2.5 16.5 0 t16.5 0 t16.5 0 t16.5 0`}
            fill="none"
            stroke="#2f7fc4"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )}
      {level > 0.5 && live?.ions && <TankIons ions={live.ions} surface={surface} />}
      <path d="M-40 -40V38a2 2 0 0 0 2 2H28a2 2 0 0 0 2-2V-40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      {probes.map((p) => (
        <g key={p.y}>
          <line x1={p.tip} y1={p.y} x2={50} y2={p.y} {...line} />
          <circle cx={p.tip} cy={p.y} r={2.6} fill="currentColor" />
          <DeviceText x={40} y={p.y - 6} rotation={rotation} size={p.name.length > 1 ? 6 : 7}>
            {p.name}
          </DeviceText>
        </g>
      ))}
      <DeviceText x={-35} y={-31} rotation={rotation} size={8} anchor="start" color="#2f7fc4">
        {`%${Math.round(level)}`}
      </DeviceText>
    </g>
  );
}

export function PartSymbol({ type, props, resistorStyle, rotation = 0, live }: SymbolProps) {
  switch (type) {
    case 'battery':
      return <Battery rotation={rotation} />;
    case 'funcgen':
      return <FunctionGenerator props={props} rotation={rotation} />;
    case 'dcsupply':
      return <DcSupply props={props} rotation={rotation} live={live} />;
    case 'tank':
      return <Tank props={props} rotation={rotation} live={live} />;
    case 'zener':
      return <Zener />;
    case 'npn':
    case 'pnp':
      return <Bjt pnp={type === 'pnp'} />;
    case 'njfet':
    case 'pjfet':
      return <Jfet p={type === 'pjfet'} />;
    case 'nmos':
    case 'pmos':
      return <Mosfet p={type === 'pmos'} />;
    case 'acsource':
      return <AcSource waveform={strProp(props, 'waveform', WAVEFORMS, 'sine')} rotation={rotation} />;
    case 'oscilloscope':
      return <Oscilloscope rotation={rotation} earthed={props.earthed === true} />;
    case 'ground':
      return <Ground />;
    case 'resistor':
      return <Resistor style={resistorStyle} {...(live?.powerRatio !== undefined ? { powerRatio: live.powerRatio } : {})} />;
    case 'capacitor':
      return <Capacitor polarized={partProp('capacitor', props, 'kind') === 'electrolytic'} />;
    case 'inductor':
      return <Inductor />;
    case 'transformer':
      return <Transformer />;
    case 'diode':
      return <DiodeBody fill="currentColor" />;
    case 'led':
      return <Led color={strProp(props, 'color', LED_COLORS, 'red')} live={live} />;
    case 'switch':
      return <Switch closed={boolProp(props, 'closed', false)} />;
    case 'relay':
      return <Relay energized={live?.energized ?? false} rotation={rotation} />;
    case 'motor':
      return <Motor angle={live?.angle ?? 0} rotation={rotation} />;
    case 'voltmeter':
      return <Meter letter="V" rotation={rotation} />;
    case 'ammeter':
      return <Meter letter="A" rotation={rotation} />;
  }
}

/** Kütüphane önizlemesi gibi bağımsız kullanımlar için sembolü kendi SVG'siyle çizer. */
export function SymbolIcon({
  type,
  resistorStyle,
  className,
}: {
  type: DeviceType;
  resistorStyle: ResistorStyle;
  className?: string;
}) {
  const b = CATALOG[type].bounds;
  const pad = 4;
  const viewBox = `${b.x * GRID - pad} ${b.y * GRID - pad} ${b.w * GRID + 2 * pad} ${b.h * GRID + 2 * pad}`;
  return (
    <svg viewBox={viewBox} className={className} aria-hidden="true" style={{ color: 'var(--color-symbol)' }}>
      <PartSymbol type={type} props={CATALOG[type].defaultProps} resistorStyle={resistorStyle} />
    </svg>
  );
}
