// Lojik entegrelerin şema sembolleri: veri sayfasındaki bacak sırasıyla DIP kutusu (1. bacak sol
// üstte, çentik üstte; sol yanda yukarıdan aşağı 1…n/2, sağ yanda aşağıdan yukarı n/2+1…n). Bacak
// numaraları kutunun içinde, adları dışında; VCC ve GND açık bacak. Kapılar kutunun içinde ANSI
// şekilleriyle, bağlı oldukları bacaklara kısa çizgilerle; 7474, CD4017 ve CD4511'de kutunun içinde blok.
// Simülasyonda 1 olan bacakların ucunda turuncu nokta. 7 segment göstergede segmentler akımla yanar.

import { GATE_CHIPS, LOGIC_CHIPS, SEVEN_SEGMENT_CODES, chipPinNames, type GateChipType, type GateKind, type LogicChipType } from '../model/logicChips';
import type { Rotation } from '../model/types';

/** Kutunun kenarı ve bacak ucu (piksel, GRID = 10). */
const EDGE = 70;
const PIN_X = 90;
/** Kapı gövdesinin kenara uzaklığı ve çıkış kablosunun döndüğü x. */
const BODY_X = 50;
const TURN_X = 10;
const PAPER = { fill: 'var(--color-paper)' } as const;
/** 1 seviyesinin işareti (555'in çıkışıyla aynı turuncu). */
const HIGH = 'var(--color-paused)';

/** DIP bacağının şemadaki y'si (piksel): sol yanda yukarıdan aşağı, sağ yanda aşağıdan yukarı. */
export function dipPinY(pin: number, count: number): number {
  const half = count / 2;
  const top = -(half - 1) * 10;
  return pin <= half ? top + 20 * (pin - 1) : top + 20 * (count - pin);
}

/** DIP bacağının şemadaki x'i (piksel): sol yan −, sağ yan +. */
export function dipPinX(pin: number, count: number): number {
  return pin <= count / 2 ? -PIN_X : PIN_X;
}

/** Sembol içindeki küçük yazı (parça dönse de dik kalır); `bar`: üstü çizgili (etkin düşük). */
function Text({
  x,
  y,
  rotation,
  children,
  size = 6,
  anchor = 'middle',
  color = 'currentColor',
  weight = 600,
  bar = false,
}: {
  x: number;
  y: number;
  rotation: Rotation;
  children: string;
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  color?: string;
  weight?: number;
  bar?: boolean;
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
      style={{ fontFamily: 'var(--font-sans)', textDecoration: bar ? 'overline' : undefined }}
    >
      {children}
    </text>
  );
}

/**
 * Sağa bakan bir kapının gövdesi (sol orta (0, 0); girişler y = ±10'da) ve çıkış ucunun x'i.
 * VE: düz arka, yarım daire ön; VEYA: içbükey arka, sivri ön; ÖZEL VEYA: arkada ikinci yay;
 * DEĞİL: üçgen. Değilli kapılarda (NAND, NOR, NOT) çıkışta küçük daire.
 */
function gateShape(kind: GateKind): { path: string; inputX: number; out: number; bubble: number | null } {
  switch (kind) {
    case 'and':
    case 'nand': {
      const path = 'M0,-12 H12 A12,12 0 0 1 12,12 H0 Z';
      return kind === 'and' ? { path, inputX: 0, out: 24, bubble: null } : { path, inputX: 0, out: 30, bubble: 27 };
    }
    case 'or':
    case 'nor': {
      const path = 'M0,-12 Q8,0 0,12 Q16,12 26,0 Q16,-12 0,-12 Z';
      return kind === 'or' ? { path, inputX: 4, out: 26, bubble: null } : { path, inputX: 4, out: 32, bubble: 29 };
    }
    case 'xor':
      return { path: 'M4,-12 Q12,0 4,12 Q20,12 30,0 Q20,-12 4,-12 Z M-1,-12 Q7,0 -1,12', inputX: 4, out: 30, bubble: null };
    case 'not':
      return { path: 'M0,-8 L16,0 L0,8 Z', inputX: 0, out: 22, bubble: 19 };
  }
}

/** Kutunun üst ve alt kenarı (piksel). */
function boxEdges(count: number): { top: number; bottom: number } {
  return { top: dipPinY(1, count) - 12, bottom: dipPinY(count / 2, count) + 12 };
}

/** Kapı entegresi (7400, 7402, 7404, 7408, 7432, 7486). */
export function GateIc({ type, model, rotation, levels }: { type: GateChipType; model: string; rotation: Rotation; levels?: readonly (number | null)[] }) {
  const chip = GATE_CHIPS[type];
  const count = chip.names.length;
  const shape = gateShape(chip.kind);
  const wires: string[] = [];
  const bodies = chip.gates.map((g, i) => {
    const left = g.output <= count / 2;
    const s = left ? 1 : -1;
    const ys = g.inputs.map((p) => dipPinY(p, count));
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const x0 = s * -BODY_X;
    // Girişler: kenardan gövdeye; çıkış: gövdeden dönüş noktasına, oradan çıkış bacağının hizasına ve kenara.
    for (const y of ys) wires.push(`M${s * -EDGE},${y}H${x0 + s * shape.inputX}`);
    const yOut = dipPinY(g.output, count);
    wires.push(`M${x0 + s * shape.out},${cy}H${s * -TURN_X}V${yOut}H${s * -EDGE}`);
    return (
      <g key={i} transform={`translate(${x0} ${cy})${left ? '' : ' scale(-1 1)'}`}>
        <path d={shape.path} style={PAPER} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
        {shape.bubble !== null && <circle cx={shape.bubble} cy={0} r={3} style={PAPER} stroke="currentColor" strokeWidth={1.4} />}
      </g>
    );
  });
  return (
    <g>
      <DipBox type={type} model={model} rotation={rotation} levels={levels} />
      <path d={wires.join('')} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      {bodies}
    </g>
  );
}

/**
 * 7474: kutunun içinde iki flip-flop bloğu (1. flip-flop sol yanın bacaklarında, 2. sağ yanın).
 * Blokta D, saat üçgeni, Q, Q̄; PRĒ ve CLR̄ girişlerinde değil dairesi.
 */
export function FlipFlopIc({ model, rotation, levels }: { model: string; rotation: Rotation; levels?: readonly (number | null)[] }) {
  const count = 14;
  const blocks = [
    { s: 1, pins: { clr: 1, d: 2, clk: 3, pre: 4, q: 5, qn: 6 } },
    { s: -1, pins: { clr: 13, d: 12, clk: 11, pre: 10, q: 9, qn: 8 } },
  ];
  return (
    <g>
      <DipBox type="ic7474" model={model} rotation={rotation} levels={levels} />
      {blocks.map(({ s, pins }, k) => {
        const ys = Object.values(pins).map((p) => dipPinY(p, count));
        const y0 = Math.min(...ys) - 9;
        const y1 = Math.max(...ys) + 9;
        const inner = s * -50;
        const outer = s * -14;
        const x = Math.min(inner, outer);
        const lead = (p: number, bubble: boolean) => {
          const y = dipPinY(p, count);
          return (
            <g key={p}>
              <path d={`M${s * -EDGE},${y}H${inner - s * (bubble ? 6 : 0)}`} fill="none" stroke="currentColor" strokeWidth={1.2} />
              {bubble && <circle cx={inner - s * 3} cy={y} r={3} style={PAPER} stroke="currentColor" strokeWidth={1.2} />}
            </g>
          );
        };
        const label = (p: number, text: string, bar = false) => (
          <Text key={`t${p}`} x={inner + s * 3} y={dipPinY(p, count)} rotation={rotation} size={6} anchor={s > 0 ? 'start' : 'end'} bar={bar}>
            {text}
          </Text>
        );
        const yClk = dipPinY(pins.clk, count);
        return (
          <g key={k}>
            {[pins.clr, pins.d, pins.clk, pins.pre, pins.q, pins.qn].map((p) => lead(p, p === pins.clr || p === pins.pre))}
            <rect x={x} y={y0} width={36} height={y1 - y0} rx={2} style={PAPER} stroke="currentColor" strokeWidth={1.6} />
            <path d={`M${inner},${yClk - 4}L${inner + s * 6},${yClk}L${inner},${yClk + 4}`} fill="none" stroke="currentColor" strokeWidth={1.2} />
            {label(pins.clr, 'CLR', true)}
            {label(pins.d, 'D')}
            {label(pins.pre, 'PRE', true)}
            {label(pins.q, 'Q')}
            {label(pins.qn, 'Q', true)}
          </g>
        );
      })}
    </g>
  );
}

/** CD4017: kutunun içinde "÷10" bloğu; simülasyonda sayacın değeri. */
export function CounterIc({ rotation, levels, count }: { rotation: Rotation; levels?: readonly (number | null)[]; count?: number | undefined }) {
  return (
    <g>
      <DipBox type="cd4017" model="CD4017B" rotation={rotation} levels={levels} />
      <rect x={-30} y={-30} width={60} height={60} rx={3} style={PAPER} stroke="currentColor" strokeWidth={1.6} />
      <Text x={0} y={-16} rotation={rotation} size={9} weight={700}>
        ÷10
      </Text>
      <Text x={0} y={6} rotation={rotation} size={16} weight={700} color={count !== undefined ? HIGH : 'var(--color-muted)'}>
        {count !== undefined ? String(count) : '0–9'}
      </Text>
    </g>
  );
}

/** CD4511: kutunun içinde "BCD → 7" bloğu ve küçük bir gösterge; simülasyonda gösterilen rakam. */
export function DecoderIc({ rotation, levels, digit }: { rotation: Rotation; levels?: readonly (number | null)[]; digit?: number | null | undefined }) {
  const segments = digit === undefined || digit === null ? null : (SEVEN_SEGMENT_CODES[digit] ?? null);
  return (
    <g>
      <DipBox type="cd4511" model="CD4511B" rotation={rotation} levels={levels} />
      <rect x={-34} y={-34} width={68} height={68} rx={3} style={PAPER} stroke="currentColor" strokeWidth={1.6} />
      <Text x={0} y={-24} rotation={rotation} size={8} weight={700}>
        BCD → 7
      </Text>
      <g transform="translate(0 6) scale(0.42)">
        <Digit segments={segments ? [...segments, 0] : null} />
      </g>
    </g>
  );
}

/**
 * DIP kutusu: bacak çizgileri, çentik, bacak numaraları (içte) ve adları (dışta, etkin düşükler üstü
 * çizgili); 1 olan bacakta turuncu nokta.
 */
export function DipBox({ type, model, rotation, levels }: { type: LogicChipType; model: string; rotation: Rotation; levels?: readonly (number | null)[] }) {
  const chip = LOGIC_CHIPS[type];
  const names = chipPinNames(type, model);
  const count = names.length;
  const { top, bottom } = boxEdges(count);
  const pins = Array.from({ length: count }, (_, i) => i + 1);
  const stubs = pins.map((p) => `M${dipPinX(p, count)},${dipPinY(p, count)}H${Math.sign(dipPinX(p, count)) * EDGE}`).join('');
  return (
    <g>
      <path d={stubs} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path
        d={`M${-EDGE},${top}H-7A7,7 0 0 0 7,${top}H${EDGE}V${bottom}H${-EDGE}Z`}
        style={PAPER}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {pins.map((p) => {
        const x = dipPinX(p, count);
        const y = dipPinY(p, count);
        const s = Math.sign(x);
        const high = levels?.[p - 1] === 1;
        return (
          <g key={p}>
            <Text x={s * (EDGE - 3)} y={y - 5} rotation={rotation} size={5.5} anchor={s < 0 ? 'start' : 'end'} color="var(--color-muted)">
              {String(p)}
            </Text>
            <Text x={s * (EDGE + 10)} y={y - 6} rotation={rotation} size={6} bar={chip.bars.includes(p)}>
              {names[p - 1]!}
            </Text>
            {high && <circle cx={s * (EDGE + 4)} cy={y} r={2.6} fill={HIGH} />}
          </g>
        );
      })}
    </g>
  );
}

/**
 * 7 segmentin şekilleri (yerel; hanenin ortası (0, 0), 36 × 64 piksel, 8° eğik). Sıra a b c d e f g;
 * DP ayrı daire.
 */
const SEGMENT_PATHS: readonly string[] = (() => {
  const w = 36;
  const h = 64;
  const t = 6;
  const hx = (y: number) => `M${-w / 2 + t},${y}l${t / 2},${-t / 2}h${w - 3 * t}l${t / 2},${t / 2}l${-t / 2},${t / 2}h${-(w - 3 * t)}Z`;
  const vy = (x: number, y0: number) => `M${x},${y0 + t / 2}l${t / 2},${t / 2}v${h / 2 - 2 * t}l${-t / 2},${t / 2}l${-t / 2},${-t / 2}v${-(h / 2 - 2 * t)}Z`;
  return [hx(-h / 2), vy(w / 2 - t / 2, -h / 2), vy(w / 2 - t / 2, 0), hx(h / 2), vy(-w / 2 + t / 2, 0), vy(-w / 2 + t / 2, -h / 2), hx(0)];
})();

/** Bir hane: `segments` a…g ve DP için 0..1 parlaklık (null: hepsi sönük); `burned`: yanmış segmentler. */
function Digit({ segments, burned }: { segments: readonly number[] | null; burned?: readonly boolean[] | undefined }) {
  const lit = (k: number) => (segments?.[k] ?? 0) > 0.02;
  const fill = (k: number) => (lit(k) ? 'var(--color-lamp-cc)' : 'var(--color-line)');
  const opacity = (k: number) => (lit(k) ? 0.25 + 0.75 * (segments?.[k] ?? 0) : 1);
  return (
    <g transform="skewX(-8)">
      {SEGMENT_PATHS.map((d, k) => (
        <path
          key={k}
          d={d}
          fill={burned?.[k] ? 'none' : fill(k)}
          fillOpacity={opacity(k)}
          stroke={burned?.[k] ? 'currentColor' : 'none'}
          strokeWidth={1}
          strokeDasharray={burned?.[k] ? '2 2' : undefined}
        />
      ))}
      <circle cx={26} cy={30} r={3.5} fill={burned?.[7] ? 'none' : fill(7)} fillOpacity={opacity(7)} stroke={burned?.[7] ? 'currentColor' : 'none'} strokeDasharray="2 2" />
    </g>
  );
}

/**
 * Ortak katotlu 7 segment gösterge: solda a…g ve DP anotları (yukarıdan aşağı), altta ortak katot.
 * Segmentler akımla yanar (parlaklık akımla); yanmış segment kesikli çizgiyle.
 */
export function SevenSegment({ rotation, brightness, burned }: { rotation: Rotation; brightness?: readonly number[] | undefined; burned?: readonly boolean[] | undefined }) {
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'DP'];
  return (
    <g>
      <path
        d={`${names.map((_, k) => `M-60,${-70 + 20 * k}H-45`).join('')}M10,100V85`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect x={-45} y={-85} width={90} height={170} rx={4} style={PAPER} stroke="currentColor" strokeWidth={2} />
      {names.map((n, k) => (
        <Text key={n} x={-40} y={-70 + 20 * k} rotation={rotation} size={6.5} anchor="start" color="var(--color-muted)">
          {n}
        </Text>
      ))}
      <Text x={10} y={77} rotation={rotation} size={6.5} color="var(--color-muted)">
        K
      </Text>
      <g transform="translate(12 -8)">
        <Digit segments={brightness ?? null} burned={burned} />
      </g>
    </g>
  );
}
