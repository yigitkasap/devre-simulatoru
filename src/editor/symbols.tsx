// Bileşen sembolleri. Yerel koordinatlarda (piksel, GRID = 10) çizilir; iki uçlu bileşenlerin
// pinleri (−40, 0) ve (40, 0) noktalarındadır. Çizgiler `currentColor` ile çizilir, böylece
// seçim ve vurgu rengi kapsayıcı grubun `color` değeriyle değişir.

import { CATALOG } from '../model/catalog';
import { GRID } from '../model/types';
import { WAVEFORMS, type Waveform } from '../sim/devices/acsource';
import { LED_MODELS, type LedColor } from '../sim/devices/led';
import type { Rotation } from '../model/types';
import { boolProp, strProp, type DeviceType, type Props } from '../sim/netlist';
import { formatSI } from '../sim/units';
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

function Resistor({ style }: { style: ResistorStyle }) {
  if (style === 'iec') {
    return (
      <g>
        <Lead from={-40} to={-22} />
        <Lead from={22} to={40} />
        <rect x={-22} y={-7} width={44} height={14} style={PAPER} stroke="currentColor" strokeWidth={2} />
      </g>
    );
  }
  const zigzag = '-40,0 -24,0 -21,-7 -15,7 -9,-7 -3,7 3,-7 9,7 15,-7 21,7 24,0 40,0';
  return (
    <polyline points={zigzag} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
  );
}

function Capacitor() {
  return (
    <g>
      <Lead from={-40} to={-4} />
      <Lead from={4} to={40} />
      <line x1={-4} y1={-13} x2={-4} y2={13} stroke="currentColor" strokeWidth={2.6} />
      <line x1={4} y1={-13} x2={4} y2={13} stroke="currentColor" strokeWidth={2.6} />
      <Plus x={-13} y={-10} />
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

export function PartSymbol({ type, props, resistorStyle, rotation = 0, live }: SymbolProps) {
  switch (type) {
    case 'battery':
      return <Battery rotation={rotation} />;
    case 'funcgen':
      return <FunctionGenerator props={props} rotation={rotation} />;
    case 'dcsupply':
      return <DcSupply props={props} rotation={rotation} live={live} />;
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
      return <Resistor style={resistorStyle} />;
    case 'capacitor':
      return <Capacitor />;
    case 'diode':
      return <DiodeBody fill="currentColor" />;
    case 'led':
      return <Led color={strProp(props, 'color', ['red', 'green', 'blue'] as const, 'red')} live={live} />;
    case 'switch':
      return <Switch closed={boolProp(props, 'closed', false)} />;
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
