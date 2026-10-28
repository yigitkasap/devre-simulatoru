// Baraj sayfasının devre paneli (tasarım v3: B2, B4, B5). Kat sekmeleri (Kat 1, 2, 3) tek katın
// devresini çizer; dördüncü sekme "Tüm devre" hazneyi, pili ve üç katı tek çizimde gösterir. Akım yolu
// yeşil vurguyla çizilir: her dal, simülasyonda o daldan geçen akım eşiğin üstündeyse vurgulanır (su
// yolu ve baz direnci, baz, kondansatör, emetör, LED; tek ışıkta susturucunun bazı ve kollektörü).
// Akım geçmeyen kat gri çizilir; kuru probun suyu kesikli turuncu çerçeveyle "açık" yazar.
//
// Çizimler devrenin kendisiyle aynı bağlantıları taşır (örnek: baraj-cubuk, baraj-tek-isik): ortak prob
// +9 V'ta; prob → RB → baz düğümü (C ve RP toprağa) → Q bazı; +9 V → RC → LED (anot) → kollektör;
// emetör toprakta. Tek ışıkta bir üst prob RS üzerinden susturucuyu (Q4, Q5) sürer; susturucunun
// kollektörü bu katın baz düğümündedir. Renkler tema belirteçleriyle (koyu temada da okunur); su ve
// seviye renkleri sahneyle aynı.

import { useId, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../editor/icons';
import { tr } from '../i18n/tr';
import { formatNumber, formatSI } from '../sim/units';
import { carries, circuitClosed, conducting, LEVEL_COLORS, milliamps, type KatDevresi, type LevelNo, type Region } from './seviye';
import { FloorsIcon } from './simgeler';

export type CircuitTab = LevelNo | 'all';
const TABS: readonly CircuitTab[] = [1, 2, 3, 'all'];

const WATER_FILL = '#74b6ec';
const WATER_LINE = '#3a7fc0';
const INK = {
  symbol: 'var(--color-symbol)',
  off: 'var(--color-wire-off)',
  rail: 'var(--color-danger)',
  railInk: 'var(--color-danger-ink)',
  ok: 'var(--color-ok-ink)',
  okDot: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  muted: 'var(--color-muted)',
  panel: 'var(--color-panel)',
  glow: 'var(--color-lamp-on)',
} as const;
const LAMP_KEY = { 1: 'green', 2: 'yellow', 3: 'red' } as const;

const ohms = (v: number) => formatSI(v, 'Ω', { trim: true });
const farads = (v: number) => formatSI(v, 'F', { trim: true });
const regionText = (r: Region | null) => (r ? tr.baraj.panel.region[r] : '');
/** Akım: "≈ 0,43 mA", sıfırsa "0 mA", simülasyon yoksa "—". */
export function currentText(current: number | null | undefined): string {
  if (current === null || current === undefined) return '—';
  const { value, decimals } = milliamps(current);
  return value === 0 ? '0 mA' : `≈ ${formatNumber(value, decimals)} mA`;
}

const sans = { fontFamily: 'var(--font-sans)' } as const;
const mono = { fontFamily: 'var(--font-mono)' } as const;

/** Vurgulu akım yolu: yarı saydam kalın yeşil çizgiler (grup saydamlığı: üst üste binen yollar koyulaşmaz). */
function Highlight({ paths }: { paths: readonly (string | false)[] }) {
  const shown = paths.filter((d): d is string => typeof d === 'string');
  if (shown.length === 0) return null;
  return (
    <g fill="none" stroke={INK.glow} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" opacity={0.4}>
      {shown.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

/** NPN simgesi: daire, baz çubuğu, kollektör ve emetör çaprazları, emetör oku. Uçlar çizimi yapan yerde. */
function Npn({ cx, cy, r, bar, lead, reach, stroke }: { cx: number; cy: number; r: number; bar: number; lead: number; reach: number; stroke: string }) {
  const bx = cx - bar;
  const ex = cx + lead;
  const h = Math.round(r * 0.57);
  const d = Math.round(r * 0.28);
  // Emetör oku: çaprazın ucunda, çapraz yönünde.
  const len = Math.hypot(ex - bx, reach - d);
  const ux = (ex - bx) / len;
  const uy = (reach - d) / len;
  const a = 8;
  const w = 3.6;
  const tip = `${ex} ${cy + reach}`;
  const base = { x: ex - ux * a, y: cy + reach - uy * a };
  return (
    <g stroke={stroke}>
      <circle cx={cx} cy={cy} r={r} fill={INK.panel} />
      <path d={`M${bx} ${cy - h}V${cy + h}M${bx} ${cy - d}L${ex} ${cy - reach}M${bx} ${cy + d}L${ex} ${cy + reach}`} />
      <path
        d={`M${tip}L${base.x - uy * w} ${base.y + ux * w}L${base.x + uy * w} ${base.y - ux * w}Z`}
        fill={stroke}
        strokeWidth={1}
      />
    </g>
  );
}

/** Suyun prob ile ortak prob arasındaki yolu: ıslaksa mavi kutu, kuruysa kesikli turuncu çerçeve. */
function WaterBox({ x, y, wet }: { x: number; y: number; wet: boolean }) {
  return wet ? (
    <g>
      <rect x={x} y={y} width={24} height={60} rx={3} fill={WATER_FILL} stroke={WATER_LINE} strokeWidth={2} />
      <path d={`M${x + 4} ${y + 20}q4-4 8 0t8 0M${x + 4} ${y + 36}q4-4 8 0t8 0`} fill="none" stroke="#ffffff" strokeWidth={1.6} />
    </g>
  ) : (
    <rect x={x} y={y} width={24} height={60} rx={3} fill="none" stroke={INK.warn} strokeWidth={2} strokeDasharray="4 3" />
  );
}

/** Akım yönü oku (ucu x, y'de). */
function arrow(x: number, y: number, dir: 'left' | 'right' | 'up' | 'down'): string {
  if (dir === 'left') return `M${x} ${y}l10-6v12z`;
  if (dir === 'right') return `M${x} ${y}l-10-6v12z`;
  if (dir === 'down') return `M${x} ${y}l-6-10h12z`;
  return `M${x} ${y}l-6 10h12z`;
}

interface SchematicProps {
  readonly kat: KatDevresi;
  /** Pilin gerilimi (V): üst baradaki yazı. */
  readonly supply: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Katın parça gruplarının rengi: girdi (prob, RB, C, RP) ve transistör katı (Q, RC, LED). */
function katInks(kat: KatDevresi) {
  const input = kat.wet || (kat.baseVoltage ?? 0) > 0.3 || carries(kat.currents?.probe) || kat.currents === null;
  const stage = conducting(kat.region) !== false;
  return { input: input ? INK.symbol : INK.off, stage: stage ? INK.symbol : INK.off, inputOn: input, stageOn: stage };
}

/** LED etiketi ve dolgusu: yanıyorsa seviyenin rengi. */
function ledLook(kat: KatDevresi) {
  const lit = kat.brightness > 0.3;
  const colors = LEVEL_COLORS[kat.level];
  return {
    lit,
    fill: lit ? colors.lamp : INK.panel,
    text: `${tr.baraj.panel.led(colorName(kat.level))}${lit ? '' : ` · ${tr.baraj.lampOff}`}`,
    textFill: lit ? INK.symbol : INK.muted,
    glow: lit ? colors.lamp : null,
  };
}

function probeText(n: number, wet: boolean) {
  return `${tr.baraj.panel.probe(n)} · ${wet ? tr.baraj.panel.wet : tr.baraj.panel.dry}`;
}

const colorName = (n: LevelNo) => tr.baraj.lampNames[LAMP_KEY[n]];

/** Kat çiziminin ekran okuyucu metni: prob, transistör, LED, akımlar ve (tek ışıkta) susturucu. */
function floorAria(kat: KatDevresi): string {
  const t = tr.baraj.panel;
  const parts = [`${t.probe(kat.level)} ${kat.wet ? t.wet : `${t.dry}, ${t.open}`}`];
  if (kat.region) parts.push(`${kat.labels.q} ${regionText(kat.region)}`);
  parts.push(`${colorName(kat.level)} LED ${kat.brightness > 0.3 ? tr.baraj.lampOn : tr.baraj.lampOff}`);
  const s = kat.silencer;
  if (s) parts.push(`${s.label}: ${t.probe(kat.level + 1)} ${s.wet ? t.wet : t.dry}${s.region ? `, ${t.silencer} ${regionText(s.region)}` : ''}`);
  if (kat.currents) parts.push(`${t.baseCurrent} ${currentText(kat.currents.base)}, ${t.ledCurrent} ${currentText(kat.currents.led)}`);
  return t.floorLabel(kat.level, parts);
}

/** Tüm devre çiziminin ekran okuyucu metni: tamamlanan halkalar ve açık katlar. */
function allAria(katlar: readonly KatDevresi[], battery: string): string {
  const t = tr.baraj.panel;
  const parts = katlar.filter(circuitClosed).map((k) => `${t.closed(k.level)} ${loopChain(k, battery).join(' → ')}.`);
  const dry = katlar.filter((k) => !k.wet).map((k) => k.level);
  if (dry.length > 0) parts.push(`${t.dryNote(dry)}.`);
  return t.allLabel(parts);
}

/** Tek ışıkta susturulan katın açıklaması (B4). */
function silencedText(kat: KatDevresi): string {
  const upper = (kat.level + 1) as LevelNo;
  return tr.baraj.panel.silencedNote(upper, kat.silencer?.label ?? '', kat.labels.q, colorName(kat.level), colorName(upper));
}

/** Kat çizimi (B2): çubuk gösterge ve tek ışıkta Kat 3. */
function KatSemasi({ kat, supply, className, style }: SchematicProps) {
  const c = kat.currents;
  const ink = katInks(kat);
  const led = ledLook(kat);
  const t = tr.baraj.panel;
  return (
    <svg viewBox="0 0 560 380" role="img" aria-label={floorAria(kat)} className={className} style={style}>
      <Highlight
        paths={[
          carries(c?.probe) && 'M40 30H70V170H250',
          carries(c?.base) && 'M250 170H362',
          carries(c?.capacitor) && 'M250 170V330H316',
          (carries(c?.emitter) || carries(c?.base)) && 'M384 194V330H316',
          carries(c?.led) && 'M40 30H460V130H384V146',
        ]}
      />
      {led.glow && <circle cx={460} cy={98} r={22} fill={led.glow} opacity={0.25 + 0.25 * Math.min(1, kat.brightness)} />}
      <g fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M40 30H520" stroke={INK.rail} strokeWidth={3} />
        <g stroke={ink.input}>
          <path d="M70 30V80M70 140V170H120" />
          <path d="M120 170l6-12 10 24 10-24 10 24 10-24 10 24 10-24 4 12" />
          <path d="M200 170H362" />
          <path d="M250 170V210M235 210H265M235 220H265M250 220V330" />
          <path d="M300 170V200l-10 6 20 10-20 10 20 10-20 10 20 10-10 6V330" />
        </g>
        <g stroke={INK.symbol}>
          <path d="M250 330H384M316 330V342M302 342H330M306 349H326M311 356H321" />
        </g>
        <Npn cx={372} cy={170} r={28} bar={10} lead={12} reach={24} stroke={ink.stage} />
        <g stroke={ink.stage}>
          <path d="M384 146V130H460M384 194V330" />
          <path d="M460 30V40l-10 4 20 8-20 8 20 8-20 8 10 4V86" />
          <path d="M446 86H474L460 110Z" fill={led.fill} />
          <path d="M446 112H474M460 112V130" />
        </g>
      </g>
      <WaterBox x={58} y={80} wet={kat.wet} />
      <circle cx={70} cy={170} r={5} fill={kat.wet ? INK.okDot : INK.muted} />
      <circle cx={250} cy={170} r={4} fill={ink.input} />
      <circle cx={300} cy={170} r={4} fill={ink.input} />
      <g fontSize={14} fill={INK.symbol} style={sans}>
        <text x={40} y={20} fontWeight={600} fill={INK.railInk}>{`+${formatSI(supply, 'V', { trim: true })}`}</text>
        <text x={92} y={62}>{t.common}</text>
        <text x={92} y={116} fill={kat.wet ? INK.symbol : INK.warn} fontWeight={kat.wet ? 400 : 600}>
          {kat.wet ? t.water : t.noWater}
        </text>
        <text x={20} y={196} fontWeight={600} fill={kat.wet ? INK.ok : INK.muted}>{probeText(kat.level, kat.wet)}</text>
        <text x={126} y={152} fill={ink.inputOn ? INK.symbol : INK.muted}>{`${kat.labels.rb} ${ohms(kat.values.rb)}`}</text>
        <text x={170} y={222} fill={ink.inputOn ? INK.symbol : INK.muted}>{`${kat.labels.c} ${farads(kat.values.c)}`}</text>
        <text x={316} y={270} fill={ink.inputOn ? INK.symbol : INK.muted}>{`${kat.labels.rp} ${ohms(kat.values.rp)}`}</text>
        <text x={410} y={176} fontWeight={600} fill={ink.stageOn ? INK.symbol : INK.muted}>{kat.labels.q}</text>
        <text x={410} y={194} fill={INK.muted}>{regionText(kat.region)}</text>
        <text x={484} y={66} fill={ink.stageOn ? INK.symbol : INK.muted}>{`${kat.labels.rc} ${ohms(kat.values.rc)}`}</text>
        <text x={484} y={104} fontWeight={600} fill={led.textFill}>{led.text}</text>
      </g>
    </svg>
  );
}

/** Tek ışıkta Kat 1 ve Kat 2 (B4): bir üst prob RS ile susturucuyu sürer; susturucu bu katın bazını toprağa çeker. */
function SusturmaliKatSemasi({ kat, supply, className, style }: SchematicProps) {
  const s = kat.silencer!;
  const c = kat.currents;
  const sc = s.currents;
  const ink = katInks(kat);
  const led = ledLook(kat);
  const t = tr.baraj.panel;
  const silOn = conducting(s.region) !== false;
  const silInk = silOn ? INK.symbol : INK.off;
  const driveInk = s.wet || sc === null ? INK.symbol : INK.off;
  const silSat = s.region === 'saturation';
  return (
    <svg viewBox="0 0 560 390" role="img" aria-label={floorAria(kat)} className={className} style={style}>
      <Highlight
        paths={[
          carries(c?.probe) && 'M20 30H70V150H236',
          carries(sc?.collector) && 'M236 150V246',
          (carries(sc?.emitter) || carries(sc?.collector)) && 'M236 294V360H344',
          carries(sc?.base) && 'M20 30H30V270H214',
          carries(c?.base) && 'M236 150H430',
          carries(c?.capacitor) && 'M236 150H320V360H344',
          (carries(c?.emitter) || carries(c?.base)) && 'M452 174V360H344',
          carries(c?.led) && 'M20 30H500V110H452V126',
        ]}
      />
      {led.glow && <circle cx={500} cy={90} r={20} fill={led.glow} opacity={0.25 + 0.25 * Math.min(1, kat.brightness)} />}
      <g fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 30H540" stroke={INK.rail} strokeWidth={3} />
        <g stroke={ink.input}>
          <path d="M70 30V50M70 110V150H110" />
          <path d="M110 150l6-12 10 24 10-24 10 24 10-24 10 24 10-24 4 12" />
          <path d="M190 150H430" />
          <path d="M320 150V190M305 190H335M305 200H335M320 200V360" />
          <path d="M360 150V180l-10 6 20 10-20 10 20 10-20 10 20 10-10 6V360" />
        </g>
        <g stroke={driveInk}>
          <path d="M30 30V180M30 240V270H70" />
          <path d="M70 270l6-12 10 24 10-24 10 24 10-24 10 24 10-24 4 12" />
          <path d="M150 270H214" />
        </g>
        <Npn cx={226} cy={270} r={24} bar={12} lead={10} reach={24} stroke={silInk} />
        <path d="M236 246V150M236 294V360" stroke={silInk} />
        <path d="M236 360H452M344 360V372M330 372H358M335 379H353M340 386H348" stroke={INK.symbol} />
        <Npn cx={440} cy={150} r={26} bar={10} lead={12} reach={24} stroke={ink.stage} />
        <g stroke={ink.stage}>
          <path d="M452 126V110H500M452 174V360" />
          <path d="M500 30V36l-10 4 20 8-20 8 20 8-20 8 10 4V80" />
          <path d="M486 80H514L500 100Z" fill={led.fill} />
          <path d="M486 100H514M500 100V110" />
        </g>
      </g>
      <WaterBox x={58} y={50} wet={kat.wet} />
      <WaterBox x={18} y={180} wet={s.wet} />
      <circle cx={70} cy={150} r={5} fill={kat.wet ? INK.okDot : INK.muted} />
      <circle cx={30} cy={270} r={5} fill={s.wet ? INK.okDot : INK.muted} />
      <circle cx={236} cy={150} r={kat.silenced ? 5 : 4} fill={kat.silenced ? INK.warn : ink.input} />
      <circle cx={320} cy={150} r={4} fill={ink.input} />
      <circle cx={360} cy={150} r={4} fill={ink.input} />
      <g fontSize={14} fill={INK.symbol} style={sans}>
        <text x={24} y={20} fontWeight={600} fill={INK.railInk}>{`+${formatSI(supply, 'V', { trim: true })}`}</text>
        <text x={92} y={86} fill={kat.wet ? INK.symbol : INK.warn} fontWeight={kat.wet ? 400 : 600}>
          {kat.wet ? t.water : t.noWater}
        </text>
        <text x={82} y={178} fontWeight={600} fill={kat.wet ? INK.ok : INK.muted}>{probeText(kat.level, kat.wet)}</text>
        <text x={118} y={132} fill={ink.inputOn ? INK.symbol : INK.muted}>{`${kat.labels.rb} ${ohms(kat.values.rb)}`}</text>
        {kat.silenced && kat.baseVoltage !== null && (
          <text x={246} y={138} fontWeight={700} fill={INK.warn}>{`≈ ${formatNumber(kat.baseVoltage, 2)} V`}</text>
        )}
        <text x={248} y={230} fill={ink.inputOn ? INK.symbol : INK.muted}>{`${kat.labels.c} ${farads(kat.values.c)}`}</text>
        <text x={372} y={232} fill={ink.inputOn ? INK.symbol : INK.muted}>{`${kat.labels.rp} ${ohms(kat.values.rp)}`}</text>
        <text x={476} y={160} fontWeight={600} fill={ink.stageOn ? INK.symbol : INK.muted}>{kat.labels.q}</text>
        <text x={476} y={178} fill={INK.muted}>{regionText(kat.region)}</text>
        <text x={404} y={62} fill={ink.stageOn ? INK.symbol : INK.muted}>{`${kat.labels.rc} ${ohms(kat.values.rc)}`}</text>
        <text x={482} y={96} textAnchor="end" fontWeight={600} fill={led.textFill}>{led.text}</text>
        {!s.wet && (
          <text x={50} y={216} fontWeight={600} fill={INK.warn}>{t.open}</text>
        )}
        <text x={44} y={302} fontWeight={600} fill={s.wet ? INK.ok : INK.muted}>{probeText(kat.level + 1, s.wet)}</text>
        <text x={76} y={252} fill={s.wet ? INK.symbol : INK.muted}>{`${s.resistor} ${ohms(s.resistance)}`}</text>
        <text x={96} y={330} fontWeight={700} fill={silSat ? INK.warn : INK.muted}>{s.label}</text>
        <text x={96} y={348} fill={silSat ? INK.warn : INK.muted}>{`${t.silencer}${s.region ? ` · ${regionText(s.region)}` : ''}`}</text>
      </g>
    </svg>
  );
}

// --- Tüm devre (B5) -------------------------------------------------------------------------------

/** Katların satırı (y): Kat 1 en altta. */
const ROW_Y: Readonly<Record<LevelNo, number>> = { 1: 397, 2: 242, 3: 87 };
const COMMON_Y = 566;
const TANK = { x: 40, y: 20, w: 110, h: 590 } as const;
/** Su seviyesinin (%) haznedeki y'si: problar satırlarının hizasında (parça parça doğrusal). */
const LEVEL_Y: ReadonlyArray<readonly [number, number]> = [
  [0, 608],
  [12.5, COMMON_Y],
  [37.5, ROW_Y[1]],
  [62.5, ROW_Y[2]],
  [87.5, ROW_Y[3]],
  [100, 22],
];
function waterY(level: number): number {
  const l = Math.min(100, Math.max(0, level));
  for (let i = 1; i < LEVEL_Y.length; i++) {
    const [l0, y0] = LEVEL_Y[i - 1]!;
    const [l1, y1] = LEVEL_Y[i]!;
    if (l <= l1) return y0 + ((l - l0) / (l1 - l0)) * (y1 - y0);
  }
  return 22;
}

/** Bir üst probun susturucuya inen telinin x'i (Q4: Prob 2'den, Q5: Prob 3'ten). */
const DRIVE_X: Readonly<Partial<Record<LevelNo, number>>> = { 1: 164, 2: 180 };
/** Susturucunun yeri (tek ışık): baz düğümünün altında, RB ile C arasında. */
const SIL = { cx: 330, dy: 50, lead: 334, bar: 323 } as const;

function TumDevreSemasi({
  katlar,
  level,
  supply,
  battery,
  className,
  style,
}: {
  katlar: readonly KatDevresi[];
  level: number;
  supply: number;
  battery: string;
  className?: string;
  style?: CSSProperties;
}) {
  const tek = katlar.some((k) => k.silencer !== null);
  const D = tek ? 60 : 0;
  const W = 960 + D;
  const cx = 360 + D;
  const rpx = 410 + D;
  const qcx = 560 + D;
  const qLead = qcx + 6;
  const qBar = qcx - 12;
  const ledL = 640 + D;
  const ledR = 666 + D;
  const railX = 800 + D;
  const busX = 850 + D;
  const batX = 890 + D;
  const t = tr.baraj.panel;
  const wy = waterY(level);
  const top = ROW_Y[3];
  const bottom = ROW_Y[1];

  const anyProbe = katlar.some((k) => carries(k.currents?.probe) || carries(k.silencer?.currents?.base));
  const returnPath = `H${busX}V600H${batX}V534`;
  const highlights: (string | false)[] = [anyProbe && `M${batX} 520V-20H20V620H95V${COMMON_Y}`];
  const arrows: string[] = [];
  if (anyProbe) arrows.push(arrow(470, -20, 'left'), arrow(20, 330, 'down'), arrow(batX, 280, 'up'));
  const closed = katlar.filter(circuitClosed);
  const lowest = closed[0];
  if (lowest) arrows.push(arrow((95 + 120) / 2, (COMMON_Y + ROW_Y[lowest.level]) / 2, 'up'));
  const ledFloors = katlar.filter((k) => carries(k.currents?.led));
  const topLed = ledFloors[ledFloors.length - 1];
  if (topLed) arrows.push(arrow(railX, (-20 + ROW_Y[topLed.level] - 40) / 2 + 5, 'down'));

  const rows = katlar.map((kat) => {
    const yb = ROW_Y[kat.level];
    const c = kat.currents;
    const s = kat.silencer;
    const sc = s?.currents;
    const ink = katInks(kat);
    const led = ledLook(kat);
    const nodeJ = s ? SIL.lead : cx;
    const gx0 = s ? SIL.lead : cx;
    const hop = yb + 90 < bottom - 40;
    const ground = `M${gx0} ${yb + 90}${hop ? `H${railX - 6}a6 6 0 0 1 12 0` : ''}H${busX}`;
    const driveX = DRIVE_X[kat.level];
    const upper = (kat.level + 1) as LevelNo;
    highlights.push(
      carries(c?.probe) && `M95 ${COMMON_Y}L120 ${yb}H${nodeJ}`,
      carries(c?.base) && `M${nodeJ} ${yb}H${qBar}`,
      carries(c?.capacitor) && `M${nodeJ} ${yb}H${cx}V${yb + 90}${returnPath}`,
      (carries(c?.emitter) || carries(c?.base)) && `M${qLead} ${yb + 20}V${yb + 90}${returnPath}`,
      carries(c?.led) && `M${batX} 520V-20H${railX}V${yb - 40}H${qLead}V${yb - 20}`,
      s !== null && driveX !== undefined && carries(sc?.base) && `M95 ${COMMON_Y}L120 ${ROW_Y[upper]}H${driveX}V${yb + SIL.dy}H${SIL.bar}`,
      s !== null && carries(sc?.collector) && `M${SIL.lead} ${yb}V${yb + SIL.dy - 14}`,
      s !== null && (carries(sc?.emitter) || carries(sc?.collector)) && `M${SIL.lead} ${yb + SIL.dy + 14}V${yb + 90}${returnPath}`,
    );
    if (carries(c?.probe)) arrows.push(arrow(s ? 300 : 310, yb, 'right'));
    if (carries(c?.emitter) || carries(sc?.emitter)) arrows.push(arrow(720 + D, yb + 90, 'right'));
    const colors = LEVEL_COLORS[kat.level];
    const labelInk = (on: boolean) => (on ? INK.symbol : INK.muted);
    return (
      <g key={kat.level}>
        {led.glow && <circle cx={(ledL + ledR) / 2} cy={yb - 40} r={14} fill={led.glow} opacity={0.25 + 0.25 * Math.min(1, kat.brightness)} />}
        <g fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <g stroke={ink.input}>
            <path d={`M190 ${yb}H200l5-10 8 20 8-20 8 20 8-20 8 20 8-20 7 10H${qBar}`} />
            <path d={`M${cx} ${yb}V${yb + 30}M${cx - 15} ${yb + 30}H${cx + 15}M${cx - 15} ${yb + 38}H${cx + 15}M${cx} ${yb + 38}V${yb + 90}`} />
            <path d={`M${rpx} ${yb}V${yb + 12}l-8 5 16 8-16 8 16 8-16 8 16 8-8 5V${yb + 90}`} />
            <path d={ground} />
          </g>
          <Npn cx={qcx} cy={yb} r={22} bar={12} lead={6} reach={20} stroke={ink.stage} />
          <g stroke={ink.stage}>
            <path d={`M${qLead} ${yb - 20}V${yb - 40}H${ledL}M${qLead} ${yb + 20}V${yb + 90}`} />
            <path d={`M${ledR} ${yb - 48}V${yb - 32}L${ledL} ${yb - 40}Z`} fill={led.fill} />
            <path d={`M${ledL} ${yb - 48}V${yb - 32}`} />
            <path d={`M${ledR} ${yb - 40}H${690 + D}l5-8 8 16 8-16 8 16 8-16 8 16 8-16 5 8H${railX}`} />
          </g>
          {s && driveX !== undefined && (
            <>
              <path
                d={`M${driveX} ${ROW_Y[upper]}V${yb - 6}a6 6 0 0 1 0 12V${yb + SIL.dy}H190l5-10 8 20 8-20 8 20 8-20 8 20 8-20 7 10H${SIL.bar}`}
                stroke={s.wet || sc === null ? INK.symbol : INK.off}
              />
              <Npn cx={SIL.cx} cy={yb + SIL.dy} r={16} bar={7} lead={4} reach={14} stroke={conducting(s.region) !== false ? INK.symbol : INK.off} />
              <path
                d={`M${SIL.lead} ${yb + SIL.dy - 14}V${yb}M${SIL.lead} ${yb + SIL.dy + 14}V${yb + 90}`}
                stroke={conducting(s.region) !== false ? INK.symbol : INK.off}
              />
            </>
          )}
        </g>
        {s && driveX !== undefined && <circle cx={driveX} cy={ROW_Y[upper]} r={4} fill={INK.symbol} />}
        {s && <circle cx={SIL.lead} cy={yb} r={4} fill={kat.silenced ? INK.warn : ink.input} />}
        <circle cx={cx} cy={yb} r={4} fill={ink.input} />
        <circle cx={rpx} cy={yb} r={4} fill={ink.input} />
        <g fontSize={13} style={sans}>
          <circle cx={168} cy={yb - 20} r={11} fill={colors.badge} />
          <text x={168} y={yb - 15} textAnchor="middle" fontWeight={700} fill={colors.badgeInk}>
            {kat.level}
          </text>
          <text x={206} y={yb - 20} fill={labelInk(ink.inputOn)}>{`${kat.labels.rb} ${ohms(kat.values.rb)}`}</text>
          {tek ? (
            <text x={cx - 18} y={yb + 24} textAnchor="end" fill={labelInk(ink.inputOn)}>{`${kat.labels.c} ${farads(kat.values.c)}`}</text>
          ) : (
            <text x={cx - 70} y={yb + 63} fill={labelInk(ink.inputOn)}>{`${kat.labels.c} ${farads(kat.values.c)}`}</text>
          )}
          <text x={rpx + 12} y={yb + 63} fill={labelInk(ink.inputOn)}>{`${kat.labels.rp} ${ohms(kat.values.rp)}`}</text>
          <text x={qcx + 30} y={yb + 10} fontWeight={ink.stageOn ? 600 : 400} fill={labelInk(ink.stageOn)}>
            {`${kat.labels.q}${kat.region ? ` · ${regionText(kat.region)}` : ''}`}
          </text>
          <text x={626 + D} y={yb - 53} fontWeight={led.lit ? 600 : 400} fill={led.textFill}>
            {`${kat.labels.led} ${tr.baraj.lampNames[LAMP_KEY[kat.level]]}`}
          </text>
          <text x={712 + D} y={yb - 53} fill={labelInk(ink.stageOn)}>{`${kat.labels.rc} ${ohms(kat.values.rc)}`}</text>
          {s && (
            <>
              <text x={196} y={yb + 38} fill={labelInk(s.wet)}>{`${s.resistor} ${ohms(s.resistance)}`}</text>
              <text x={196} y={yb + 80} fontWeight={s.region === 'saturation' ? 600 : 400} fill={s.region === 'saturation' ? INK.warn : INK.muted}>
                {`${s.label}${s.region ? ` · ${regionText(s.region)}` : ''}`}
              </text>
            </>
          )}
        </g>
      </g>
    );
  });

  return (
    <svg viewBox={`0 -50 ${W} 686`} role="img" aria-label={allAria(katlar, battery)} className={className} style={style}>
      <Highlight paths={highlights} />
      {/* Hazne, su ve problar */}
      <rect x={TANK.x} y={TANK.y} width={TANK.w} height={TANK.h} rx={6} fill={INK.panel} stroke={INK.symbol} strokeWidth={2} />
      {level > 0.5 && (
        <>
          <rect x={42} y={wy} width={106} height={608 - wy} fill={WATER_FILL} fillOpacity={0.55} />
          <path d={`M42 ${wy}q9-5 18 0t18 0 18 0 18 0 18 0 16 0`} fill="none" stroke={WATER_LINE} strokeWidth={2} />
        </>
      )}
      <text x={52} y={46} fontSize={15} fontWeight={600} fill={INK.symbol} style={mono}>
        H1
      </text>
      <g stroke={INK.symbol} strokeWidth={3} strokeLinecap="round">
        {katlar.map((k) => (
          <path key={k.level} d={`M120 ${ROW_Y[k.level]}H190`} />
        ))}
        <path d={`M95 ${COMMON_Y}V620`} />
      </g>
      {katlar.map((k) => {
        const y = ROW_Y[k.level];
        return k.wet ? (
          <circle key={k.level} cx={120} cy={y} r={6} fill={INK.okDot} />
        ) : (
          <g key={k.level}>
            <circle cx={120} cy={y} r={6} fill={INK.panel} stroke={INK.symbol} strokeWidth={2} />
            <circle cx={120} cy={y} r={15} fill="none" stroke={INK.warn} strokeWidth={2} strokeDasharray="4 3" />
            <text x={58} y={y + 4} fontSize={12} fontWeight={600} fill={INK.warn} style={sans}>
              {t.open}
            </text>
          </g>
        );
      })}
      <circle cx={95} cy={COMMON_Y} r={6} fill={INK.symbol} />
      <g fontSize={12} style={sans}>
        <text x={158} y={600} fill={INK.symbol}>
          {t.common}
        </text>
        {level > 0.5 && Math.max(wy + 26, 72) < COMMON_Y - 10 && (
          <text x={54} y={Math.max(wy + 26, 72)} fontWeight={600} fill={INK.ok}>
            {t.waterShort}
          </text>
        )}
      </g>

      {/* +9 V bara, pil ve toprak barası */}
      <g fill="none" stroke={INK.symbol} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d={`M20 -20H${batX}V520`} stroke={INK.rail} />
        <path d={`M20 -20V620H95`} stroke={INK.rail} />
        <path d={`M${railX} -20V${bottom - 40}`} stroke={INK.rail} />
        <path d={`M${batX - 18} 520H${batX + 18}`} />
        <path d={`M${batX - 10} 534H${batX + 10}`} strokeWidth={5} />
        <path d={`M${batX} 534V600H${busX}`} />
        <path d={`M${busX} ${top + 90}V600`} />
        <path d={`M${busX} 600V612M${busX - 12} 612H${busX + 12}M${busX - 8} 618H${busX + 8}M${busX - 4} 624H${busX + 4}`} />
      </g>
      <g fill={INK.symbol}>
        <circle cx={railX} cy={-20} r={4} fill={INK.rail} />
        <circle cx={railX} cy={ROW_Y[3] - 40} r={4} fill={INK.rail} />
        <circle cx={railX} cy={ROW_Y[2] - 40} r={4} fill={INK.rail} />
        <circle cx={busX} cy={ROW_Y[2] + 90} r={4} />
        <circle cx={busX} cy={ROW_Y[1] + 90} r={4} />
        <circle cx={busX} cy={600} r={4} />
      </g>
      <g fontSize={14} fontWeight={600} style={sans}>
        <text x={batX + 18} y={512} fill={INK.symbol}>
          {battery}
        </text>
        <text x={batX + 18} y={552} fill={INK.muted} fontWeight={400}>
          {formatSI(supply, 'V', { trim: true })}
        </text>
        <text x={batX - 14} y={514} fill={INK.railInk}>
          +
        </text>
        <text x={420} y={-28} fill={INK.railInk}>
          {t.rail(formatSI(supply, 'V', { trim: true }))}
        </text>
        <text x={busX + 8} y={420} fill={INK.ok} transform={`rotate(90 ${busX + 8} 420)`}>
          {t.ground}
        </text>
      </g>
      {rows}
      {arrows.length > 0 && (
        <g fill={INK.ok}>
          {arrows.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      )}
    </svg>
  );
}

// --- Panel ----------------------------------------------------------------------------------------

/** Akım halkasının adımları: B1 + → ortak prob → su → Prob N → RBN → (QN ya da susturucu) → toprak → B1 −. */
export function loopChain(kat: KatDevresi, battery: string): string[] {
  const t = tr.baraj.panel;
  const via = !carries(kat.currents?.base) && kat.silencer && carries(kat.silencer.currents?.collector) ? kat.silencer.label : kat.labels.q;
  return [`${battery} +`, t.chainCommon, t.waterShort, t.probe(kat.level), kat.labels.rb, via, t.ground, `${battery} −`];
}

function Tabs({ tab, onTab, touch, panelId, idBase }: { tab: CircuitTab; onTab: (t: CircuitTab) => void; touch: boolean; panelId: string; idBase: string }) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onTab(TABS[next]!);
    e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={tr.baraj.panel.tabs} onKeyDown={onKeyDown} className="flex shrink-0 gap-0.5 rounded-[10px] bg-face p-[3px]">
      {TABS.map((tb) => {
        const on = tb === tab;
        const colors = tb === 'all' ? null : LEVEL_COLORS[tb];
        return (
          <button
            key={tb}
            id={`${idBase}-${tb}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onTab(tb)}
            className={`flex items-center gap-1.5 rounded-lg text-body whitespace-nowrap ${touch ? 'h-11 px-2' : 'h-[34px] pr-3 pl-2'} ${
              on ? 'bg-panel font-semibold text-ink shadow-[0_1px_2px_rgba(29,39,51,.12)]' : 'text-ink-2 hover:bg-panel/60'
            } ${tb === 'all' && !touch ? 'pl-3' : ''}`}
          >
            {colors ? (
              <span
                aria-hidden="true"
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: colors.badge, color: colors.badgeInk }}
              >
                {tb}
              </span>
            ) : (
              <FloorsIcon size={16} />
            )}
            {tb === 'all' ? tr.baraj.panel.all : tr.baraj.panel.floor(tb)}
          </button>
        );
      })}
    </div>
  );
}

const dotsStyle = {
  backgroundColor: 'var(--color-paper)',
  backgroundImage: 'radial-gradient(var(--color-grid) 1px, transparent 1.2px)',
  backgroundSize: '20px 20px',
} as const;

export interface DevrePaneliProps {
  readonly variant: string;
  readonly katlar: readonly KatDevresi[];
  readonly tab: CircuitTab;
  readonly onTab: (tab: CircuitTab) => void;
  /** Haznedeki su seviyesi (%): tüm devre çiziminde. */
  readonly level: number;
  readonly supply: number;
  readonly battery: string;
  /** "Tüm devreyi simülatörde aç": o anki hâlin paylaşım bağlantısı (tıklanınca tazelenir). */
  readonly openHref: string;
  readonly onOpenActivate: (e: { currentTarget: HTMLAnchorElement }) => void;
  readonly onClose: () => void;
  /** Masaüstünde Tüm devre sekmesinde paneli sayfa genişliğine açar. */
  readonly wide?: { readonly on: boolean; readonly onToggle: () => void };
  /** side: sahnenin yanında (masaüstü, tablet); sheet: tam ekran (telefon). */
  readonly layout: 'side' | 'sheet';
  readonly touch: boolean;
  readonly big?: boolean;
}

/** Devre paneli: başlık ve sekmeler, tek ışıkta öncelik kuralı, tüm devrede halka açıklaması, çizim ve akımlar. */
export function DevrePaneli({ variant, katlar, tab, onTab, level, supply, battery, openHref, onOpenActivate, onClose, wide, layout, touch, big = false }: DevrePaneliProps) {
  const idBase = useId().replace(/:/g, '');
  const panelId = `${idBase}-panel`;
  const t = tr.baraj.panel;
  const sheet = layout === 'sheet';
  const tek = katlar.some((k) => k.silencer !== null);
  const kat = tab === 'all' ? null : katlar.find((k) => k.level === tab)!;
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      autoFocus={sheet}
      aria-label={tr.baraj.closeCircuit}
      title={tr.baraj.closeCircuit}
      className={`flex shrink-0 items-center justify-center rounded-[10px] hover:bg-panel-2 ${touch ? 'h-11 w-11' : 'h-10 w-10'}`}
    >
      <Icon name="close" />
    </button>
  );
  const tabs = <Tabs tab={tab} onTab={onTab} touch={touch} panelId={panelId} idBase={idBase} />;

  // Çizim: masaüstünde panele sığar (gerekirse küçülür), telefonda en az okunur genişlikte, panel içinde kayar.
  const drawingClass = sheet ? 'block h-auto shrink-0' : 'block min-h-0 w-full shrink';
  const drawing = (vb: readonly [number, number], minWidth: number): { className: string; style: CSSProperties } => ({
    className: drawingClass,
    style: sheet ? { width: `max(100%, ${minWidth}px)`, aspectRatio: `${vb[0]} / ${vb[1]}` } : { aspectRatio: `${vb[0]} / ${vb[1]}` },
  });

  let svg: ReactNode;
  if (kat === null) {
    svg = <TumDevreSemasi katlar={katlar} level={level} supply={supply} battery={battery} {...drawing([tek ? 1020 : 960, 686], 680)} />;
  } else if (kat.silencer) {
    svg = <SusturmaliKatSemasi kat={kat} supply={supply} {...drawing([560, 390], 440)} />;
  } else {
    svg = <KatSemasi kat={kat} supply={supply} {...drawing([560, 380], 440)} />;
  }

  const closed = katlar.filter(circuitClosed);
  const dry = katlar.filter((k) => !k.wet).map((k) => k.level);
  const anySim = katlar.some((k) => k.currents !== null);
  const textSize = big ? 'text-[16px]' : 'text-body';

  const footer = kat && (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      {kat.silenced && kat.silencer ? (
        <p className={`m-0 min-w-0 flex-1 rounded-[10px] border border-line bg-panel px-3.5 py-2.5 leading-snug text-ink ${textSize}`}>{silencedText(kat)}</p>
      ) : (
        <>
          <Reading label={t.baseCurrent} value={currentText(kat.currents?.base)} big={big} />
          <Reading label={t.ledCurrent} value={currentText(kat.currents?.led)} big={big} />
        </>
      )}
      <a
        href={openHref}
        onPointerDown={onOpenActivate}
        onClick={onOpenActivate}
        className={`flex shrink-0 items-center font-medium text-accent-ink hover:underline ${touch ? 'min-h-11' : ''} ${textSize}`}
      >
        {t.openAll}
      </a>
    </div>
  );

  return (
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col">
      {sheet ? (
        <>
          <div className="flex h-14 shrink-0 items-center gap-2 pr-2 pl-4">
            <h2 className="m-0 text-[17px] font-semibold">{tr.baraj.devre.title}</h2>
            <span className="min-w-0 flex-1 truncate text-small text-muted">{tr.baraj.variants[variant]}</span>
            {closeButton}
          </div>
          <div className="flex shrink-0 justify-center border-b border-line px-3 pb-2">{tabs}</div>
        </>
      ) : (
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line pr-2 pl-5">
          <h2 className={`m-0 font-semibold @max-[540px]:sr-only ${big ? 'text-[18px]' : 'text-heading'}`}>{tr.baraj.devre.title}</h2>
          {tabs}
          <span className="flex-1" />
          {tab === 'all' && wide && (
            <button
              type="button"
              aria-pressed={wide.on}
              aria-label={wide.on ? t.shrink : t.expand}
              title={wide.on ? t.shrink : t.expand}
              onClick={wide.onToggle}
              className={`flex shrink-0 items-center justify-center rounded-[10px] hover:bg-panel-2 ${touch ? 'h-11 w-11' : 'h-10 w-10'}`}
            >
              <Icon name={wide.on ? 'fullscreenExit' : 'fullscreen'} className="h-[18px] w-[18px]" />
            </button>
          )}
          {closeButton}
        </div>
      )}

      {tek && (
        <div className={`flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line bg-panel-2 ${sheet ? 'px-4 py-2.5 text-small' : `px-5 py-3 ${textSize}`}`}>
          <span className="font-semibold">{t.priority}</span>
          {([1, 2, 3] as const).map((n) => (
            <span key={n} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: LEVEL_COLORS[n].badge }} />
              {t.rules[n]}
            </span>
          ))}
        </div>
      )}

      {tab === 'all' && anySim && (
        <div className={`flex shrink-0 flex-col items-start gap-2 border-b border-line bg-panel-2 ${sheet ? 'px-4 py-2.5 text-small' : `px-5 py-2.5 ${textSize}`}`}>
          {closed.map((k) => (
            <span key={k.level} className="flex items-start gap-2 rounded-lg border border-ok-line bg-ok-soft px-3 py-1.5">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-ok)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
                <path d="M4.5 10.5l3.5 3.5 7.5-8" />
              </svg>
              <span>
                <span className="font-semibold text-ok-ink">{t.closed(k.level)}</span> {loopChain(k, battery).join(' → ')}
              </span>
            </span>
          ))}
          {dry.length > 0 && (
            <span className="flex items-center gap-1.5 text-warn">
              <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-dashed border-warn" />
              {t.dryNote(dry)}
            </span>
          )}
        </div>
      )}

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${idBase}-${tab}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        style={dotsStyle}
      >
        <div className={sheet ? 'flex flex-col gap-4 p-4' : 'flex h-full min-h-0 flex-col gap-5 px-5 pt-6 pb-5'}>
          {svg}
          {footer}
        </div>
      </div>
    </div>
  );
}

function Reading({ label, value, big }: { label: string; value: string; big: boolean }) {
  return (
    <span className="flex min-w-[8.5rem] flex-1 flex-col gap-0.5 rounded-[10px] border border-line bg-panel px-3.5 py-3">
      <span className={big ? 'text-[14px] text-muted' : 'text-label text-muted'}>{label}</span>
      <span className={`font-mono tabular ${big ? 'text-[22px]' : 'text-[18px]'}`}>{value}</span>
    </span>
  );
}
