// Osiloskop ön paneli (tasarım: M06a–c, M05a, DS-Cihaz). Ekran (iki kanal, sürüklenebilir sıfır
// üçgenleri), kanal ayarları, kip, zaman/bölme, tetik ve Oto; altta giriş ve şebeke toprağı. Ayarlar
// parçanın özelliklerinde saklanır (kaydedilir, paylaşılır, geri alınabilir; simülasyonu durdurmaz).

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { tr } from '../i18n/tr';
import type { Part } from '../model/types';
import {
  SCOPE_COUPLINGS,
  SCOPE_INPUTS,
  SCOPE_MODES,
  SCOPE_TRIGGERS,
  TIME_PER_DIV_STEPS,
  VOLTS_PER_DIV_STEPS,
  scopeSettings,
  type ScopeCoupling,
  type ScopeInput,
  type ScopeMode,
  type ScopeSettings,
  type ScopeTrigger,
} from '../sim/devices/oscilloscope';
import type { PropValue } from '../sim/netlist';
import { formatNumber, formatSI } from '../sim/units';
import { ChannelBadge, Face, Jack, PanelLabel, Segmented, Stepper } from './RackControls';
import { SCREEN_DIV, SCREEN_H, SCREEN_W, type ChannelStats, type ScopeView } from './scopeView';

/** Kanal renkleri (koyu ekranda iyi seçilen sarı ve camgöbeği; açık zeminde koyu tonları). */
export const SCOPE_COLORS = ['var(--color-ch-a)', 'var(--color-ch-b)'] as const;
const LIGHT_COLORS = ['#7a5c00', '#0e6b8a'] as const;
export const CHANNELS = ['A', 'B'] as const;
const POSITION_LIMIT = 4;
const POSITION_STEP = 0.5;

export const voltsLabel = (v: number) => `${formatSI(v, 'V', { trim: true })}${tr.scope.perDiv}`;
export const timeLabel = (t: number) => `${formatSI(t, 's', { trim: true })}${tr.scope.perDiv}`;
const positionLabel = (p: number) => `${p > 0 ? '+' : ''}${formatNumber(p, 1)} ${tr.rack.divShort}`;

function statsText(stats: ChannelStats): string {
  const parts = [`${tr.scope.peakToPeak} ${formatSI(stats.peakToPeak, 'V')}`, `${tr.scope.rms} ${formatSI(stats.rms, 'V')}`];
  if (stats.frequency !== null) parts.push(`${tr.scope.frequency} ${formatSI(stats.frequency, 'Hz')}`);
  return parts.join('\u2002 ');
}

export function stepIn(steps: readonly number[], value: number, direction: 1 | -1): number {
  const index = steps.findIndex((s) => Math.abs(s - value) <= s * 1e-6);
  const i = index < 0 ? steps.findIndex((s) => s > value) : index;
  return steps[Math.min(steps.length - 1, Math.max(0, (i < 0 ? steps.length - 1 : i) + direction))]!;
}

export interface ScopeFaceProps {
  readonly part: Part;
  /** Simülasyon çalışmıyorsa null. */
  readonly view: ScopeView | null;
  readonly connected: readonly [boolean, boolean];
  /** Ekranın yüksekliği (px); genişlik 5:4. */
  readonly screenHeight: number;
  readonly onChange: (patch: Record<string, PropValue>) => void;
  readonly onAuto: () => void;
  /** Jak: tuvalde ilgili ucu göster (0 = A, 1 = B, 2 = COM). */
  readonly onJack: (pin: number) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function ScopeFace({ part, view, connected, screenHeight, onChange, onAuto, onJack, className, style }: ScopeFaceProps) {
  const settings = scopeSettings(part.props);
  const xy = settings.mode === 'xy';
  const add = settings.mode === 'add';

  const status =
    view && !xy ? (
      <span className={`ml-2 flex items-center gap-1.5 text-label ${view.triggered ? 'text-ink' : 'text-warn'}`}>
        <i className={`block h-2 w-2 rounded-full ${view.triggered ? 'bg-ok' : 'bg-paused'}`} aria-hidden="true" />
        {view.triggered ? tr.rack.triggered : tr.scope.rolling}
      </span>
    ) : null;
  const badge = add ? tr.rack.badgeAdd(settings.invertB) : xy ? tr.rack.badgeXy : null;

  return (
    <Face
      title={tr.scope.title}
      label={part.label}
      ariaLabel={`${tr.scope.title} ${part.label}${xy ? `, ${tr.rack.badgeXy}` : ''}`}
      className={className}
      style={style}
      extra={
        <>
          {status}
          <span className="flex-1" />
          {badge ? (
            <span className="rounded-xs bg-ink px-2 py-0.5 text-label font-semibold text-white">{badge}</span>
          ) : (
            <span className="text-label text-muted">{settings.input === 'real' ? tr.rack.inputReal : tr.rack.inputIdeal}</span>
          )}
        </>
      }
    >
      {/* İçerik doğal yüksekliğinde; raf alçaksa panel kendi içinde kayar. */}
      <div className="flex shrink-0 gap-3.5 px-3 py-2.5">
        <div className="flex shrink-0 flex-col gap-1">
          <Screen part={part} view={view} settings={settings} height={screenHeight} onChange={onChange} />
          <StatsLines view={view} settings={settings} connected={connected} />
        </div>

        <div className="grid min-w-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] content-start gap-x-3.5 gap-y-3">
          {CHANNELS.map((name, index) => (
            <ChannelControls key={name} name={name} index={index as 0 | 1} settings={settings} onChange={onChange} />
          ))}
          <div className="flex flex-col gap-1.5">
            <span className="flex h-[18px] items-center text-small font-semibold">{tr.rack.modeAndTime}</span>
            <PanelLabel panel="MODE">{tr.scope.mode}</PanelLabel>
            <Segmented<ScopeMode>
              label={tr.scope.mode}
              options={SCOPE_MODES.map((m) => ({ value: m, text: tr.rack.modes[m] }))}
              value={settings.mode}
              onChange={(mode) => onChange({ mode })}
            />
            <PanelLabel panel={xy ? tr.rack.xyTimeUnused : 'TIME/DIV'} muted={xy}>
              {tr.scope.timePerDiv}
            </PanelLabel>
            <Stepper
              label={tr.scope.timePerDiv}
              text={timeLabel(settings.timePerDiv)}
              disabled={xy}
              canDown={settings.timePerDiv > TIME_PER_DIV_STEPS[0]!}
              canUp={settings.timePerDiv < TIME_PER_DIV_STEPS[TIME_PER_DIV_STEPS.length - 1]!}
              onStep={(d) => onChange({ timePerDiv: stepIn(TIME_PER_DIV_STEPS, settings.timePerDiv, d) })}
            />
            <div className="flex gap-1.5 pt-0.5">
              <Segmented<ScopeTrigger>
                label={tr.scope.trigger}
                className="flex-1"
                disabled={xy}
                options={SCOPE_TRIGGERS.map((t) => ({ value: t, text: t === 'A' ? tr.rack.triggerA : t }))}
                value={settings.trigger}
                onChange={(trigger) => onChange({ trigger })}
              />
              <button
                type="button"
                onClick={onAuto}
                title={tr.scope.autoTitle}
                className="h-9 rounded-md bg-ink px-3 text-small font-semibold text-white hover:brightness-125"
              >
                {tr.scope.auto}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <PanelLabel>{tr.rack.input}</PanelLabel>
          <Segmented<ScopeInput>
            label={tr.rack.input}
            className="w-[210px]"
            options={SCOPE_INPUTS.map((i) => ({ value: i, text: i === 'real' ? tr.rack.inputRealShort : tr.rack.inputIdealShort }))}
            value={settings.input}
            onChange={(input) => onChange({ input })}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-label font-semibold">
          <input
            type="checkbox"
            checked={settings.earthed}
            onChange={(e) => onChange({ earthed: e.target.checked })}
            className="h-[18px] w-[18px] accent-earth"
          />
          {tr.rack.earthed}
        </label>
        <span className="flex-1" />
        <div className="flex items-end gap-2">
          <Jack color="var(--color-ch-a)" name="A" label={tr.rack.jack(`${part.label} A`)} onClick={() => onJack(0)} />
          <Jack color="var(--color-ch-b)" name="B" label={tr.rack.jack(`${part.label} B`)} onClick={() => onJack(1)} />
          <Jack color="#2c3846" ring={settings.earthed} name="COM" earthed={settings.earthed} label={tr.rack.jack(`${part.label} COM`)} onClick={() => onJack(2)} />
        </div>
      </div>
    </Face>
  );
}

function ChannelControls({
  name,
  index,
  settings,
  onChange,
}: {
  name: 'A' | 'B';
  index: 0 | 1;
  settings: ScopeSettings;
  onChange: (patch: Record<string, PropValue>) => void;
}) {
  const xy = settings.mode === 'xy';
  const volts = settings.voltsPerDiv[index];
  const position = settings.position[index];
  const title = xy ? (index === 0 ? tr.rack.xyAxisA : tr.rack.xyAxisB) : tr.scope.channel(name);
  // X-Y'de A yatay eksendir: konumu sola/sağa kaydırır.
  const horizontal = xy && index === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex h-[18px] items-center gap-1.5 text-small font-semibold">
        <ChannelBadge name={name} color={SCOPE_COLORS[index]} />
        {title}
        {!xy && <small className="font-mono font-medium text-muted">{index === 0 ? 'CH1' : 'CH2'}</small>}
      </span>
      <PanelLabel panel="VOLTS/DIV">{tr.scope.voltsPerDiv}</PanelLabel>
      <Stepper
        label={`${name} ${tr.scope.voltsPerDiv.toLocaleLowerCase('tr-TR')}`}
        text={voltsLabel(volts)}
        canDown={volts > VOLTS_PER_DIV_STEPS[0]!}
        canUp={volts < VOLTS_PER_DIV_STEPS[VOLTS_PER_DIV_STEPS.length - 1]!}
        onStep={(d) => onChange({ [`voltsPerDiv${name}`]: stepIn(VOLTS_PER_DIV_STEPS, volts, d) })}
      />
      <Segmented<ScopeCoupling>
        label={`${name} ${tr.scope.coupling.toLocaleLowerCase('tr-TR')}`}
        options={(['ac', 'gnd', 'dc'] as const)
          .filter((c) => SCOPE_COUPLINGS.includes(c))
          .map((c) => ({ value: c, text: tr.scope.couplings[c] ?? c }))}
        value={settings.coupling[index]}
        onChange={(c) => onChange({ [`coupling${name}`]: c })}
      />
      <PanelLabel panel="POSITION">{tr.rack.position}</PanelLabel>
      <Stepper
        label={`${name} ${tr.rack.position.toLocaleLowerCase('tr-TR')}`}
        text={positionLabel(position)}
        downGlyph={horizontal ? '◀' : '▼'}
        upGlyph={horizontal ? '▶' : '▲'}
        downLabel={horizontal ? tr.rack.moveLeft(name) : tr.rack.moveDown(name)}
        upLabel={horizontal ? tr.rack.moveRight(name) : tr.rack.moveUp(name)}
        canDown={position > -POSITION_LIMIT}
        canUp={position < POSITION_LIMIT}
        onStep={(d) => onChange({ [`position${name}`]: Math.max(-POSITION_LIMIT, Math.min(POSITION_LIMIT, position + d * POSITION_STEP)) })}
      />
      {index === 1 && (
        <label
          className={`flex h-9 cursor-pointer items-center gap-2 rounded-md border-[1.5px] bg-panel px-2.5 text-small font-semibold ${
            settings.invertB ? 'border-ink' : 'border-rack-line'
          }`}
        >
          <input
            type="checkbox"
            checked={settings.invertB}
            onChange={(e) => onChange({ invertB: e.target.checked })}
            className="h-[18px] w-[18px] accent-ink"
          />
          {tr.rack.invert}
          <small className="font-mono font-medium text-muted">INV</small>
        </label>
      )}
    </div>
  );
}

/** Ekranın altındaki ölçüm satırları (kanal harfi renginin yanında). */
export function StatsLines({ view, settings, connected }: { view: ScopeView | null; settings: ScopeSettings; connected: readonly [boolean, boolean] }) {
  if (!view) {
    return (
      <p className="font-mono text-[11.5px] text-muted">
        {settings.mode === 'xy'
          ? `X ${voltsLabel(settings.voltsPerDiv[0])} · Y ${voltsLabel(settings.voltsPerDiv[1])}`
          : `A ${voltsLabel(settings.voltsPerDiv[0])} · B ${voltsLabel(settings.voltsPerDiv[1])} · ${timeLabel(settings.timePerDiv)}`}
      </p>
    );
  }
  const add = settings.mode === 'add';
  return (
    <div className="font-mono text-[11px] leading-normal text-ink">
      {CHANNELS.map((name, index) => {
        if (add && index === 1) return null;
        const stats = view.channels[index]?.stats;
        const unconnected = add ? !connected[0] && !connected[1] : !connected[index];
        const text = unconnected ? tr.scope.notConnected : stats ? statsText(stats) : '';
        if (!text) return null;
        const title = add ? tr.scope.sum(settings.invertB) : index === 1 && settings.invertB ? `${name} (${tr.scope.inverted})` : name;
        return (
          <p key={name} className="whitespace-nowrap">
            <b style={{ color: LIGHT_COLORS[index] }}>{title}</b>
            {'\u2002'}
            {text}
          </p>
        );
      })}
    </div>
  );
}

/** SVG yolunun son noktası (iz sonu etiketi için). */
function lastPoint(path: string): { x: number; y: number } | null {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;
  return { x: Number(numbers[numbers.length - 2]), y: Number(numbers[numbers.length - 1]) };
}

/**
 * Ekran: 10 × 8 bölmelik ızgara, kanalların harfli sıfır üçgenleri (sürüklenince konum değişir),
 * çizgiler ve iz sonunda kanal harfi.
 */
export function Screen({
  part,
  view,
  settings,
  height,
  onChange,
}: {
  part: Part;
  view: ScopeView | null;
  settings: ScopeSettings;
  /** Ekranın yüksekliği (px); "fill" verilirse genişliğin tamamını kaplar (telefon). */
  height: number | 'fill';
  onChange: (patch: Record<string, PropValue>) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ channel: 0 | 1; axis: 'x' | 'y' } | null>(null);
  const size = height === 'fill' ? { width: '100%', aspectRatio: `${SCREEN_W} / ${SCREEN_H}` } : { width: Math.round((height * SCREEN_W) / SCREEN_H), height };
  const grid: string[] = [];
  for (let i = 1; i < 10; i++) grid.push(`M${i * SCREEN_DIV},0 V${SCREEN_H}`);
  for (let i = 1; i < 8; i++) grid.push(`M0,${i * SCREEN_DIV} H${SCREEN_W}`);
  const ticks: string[] = [];
  for (let i = 0; i <= 50; i++) ticks.push(`M${i * 10},${SCREEN_H / 2 - 4} V${SCREEN_H / 2 + 4}`);
  for (let i = 0; i <= 40; i++) ticks.push(`M${SCREEN_W / 2 - 4},${i * 10} H${SCREEN_W / 2 + 4}`);
  const stroke = { vectorEffect: 'non-scaling-stroke' } as const;
  const xy = settings.mode === 'xy';

  const toScreen = (e: ReactPointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SCREEN_W, y: ((e.clientY - rect.top) / rect.height) * SCREEN_H };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toScreen(e);
    const raw = d.axis === 'y' ? (SCREEN_H / 2 - p.y) / SCREEN_DIV : (p.x - SCREEN_W / 2) / SCREEN_DIV;
    const position = Math.max(-POSITION_LIMIT, Math.min(POSITION_LIMIT, Math.round(raw * 10) / 10));
    if (position !== settings.position[d.channel]) onChange({ [`position${CHANNELS[d.channel]}`]: position });
  };
  const startDrag = (channel: 0 | 1, axis: 'x' | 'y') => (e: ReactPointerEvent) => {
    e.preventDefault();
    drag.current = { channel, axis };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const marker = (channel: 0 | 1, axis: 'x' | 'y') => {
    const p = settings.position[channel] * SCREEN_DIV;
    const name = CHANNELS[channel];
    if (axis === 'y') {
      const y = SCREEN_H / 2 - p;
      return (
        <g key={`m${channel}`} onPointerDown={startDrag(channel, 'y')} className="cursor-ns-resize" aria-hidden="true">
          <rect x={0} y={y - 14} width={30} height={28} fill="transparent" />
          <path d={`M0,${y - 9} L14,${y} L0,${y + 9} Z`} fill={SCOPE_COLORS[channel]} />
          <text x={2} y={y + 3.5} fontSize={9} fontWeight={700} fontFamily="var(--font-mono)" fill="#0f1713">
            {name}
          </text>
        </g>
      );
    }
    const x = SCREEN_W / 2 + p;
    return (
      <g key={`m${channel}`} onPointerDown={startDrag(channel, 'x')} className="cursor-ew-resize" aria-hidden="true">
        <rect x={x - 14} y={0} width={28} height={30} fill="transparent" />
        <path d={`M${x - 9},0 L${x},14 L${x + 9},0 Z`} fill={SCOPE_COLORS[channel]} />
        <text x={x - 3} y={9} fontSize={9} fontWeight={700} fontFamily="var(--font-mono)" fill="#0f1713">
          {name}
        </text>
      </g>
    );
  };

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-md bg-scope-bg shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]"
      style={size}
    >
      {!view && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-small text-scope-text">
          {tr.scope.stopped}
        </p>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${tr.scope.screen} ${part.label}`}
        className="block h-full w-full touch-none"
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <path d={grid.join(' ')} stroke="var(--color-scope-grid)" strokeWidth={1} style={stroke} fill="none" />
        <path d={ticks.join(' ')} stroke="#3c5246" strokeWidth={1} style={stroke} fill="none" />
        {xy && view?.xyPath && (
          <path d={view.xyPath} fill="none" stroke="var(--color-ch-xy)" strokeWidth={2} strokeLinejoin="round" style={stroke} />
        )}
        {view?.channels.map((channel, index) => {
          if (!channel.path) return null;
          const end = lastPoint(channel.path);
          const label = settings.mode === 'add' ? tr.scope.sum(settings.invertB).replace(/\s/g, '') : CHANNELS[index];
          return (
            <g key={index}>
              <path
                d={channel.path}
                fill="none"
                stroke={SCOPE_COLORS[index]}
                strokeWidth={index === 0 ? 2 : 1.5}
                strokeLinejoin="round"
                style={stroke}
              />
              {end && (
                <text
                  x={SCREEN_W - 6}
                  y={Math.max(14, Math.min(SCREEN_H - 6, end.y - 8))}
                  textAnchor="end"
                  fontSize={13}
                  fontWeight={700}
                  fontFamily="var(--font-mono)"
                  fill={SCOPE_COLORS[index]}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {xy ? [marker(0, 'x'), marker(1, 'y')] : (settings.mode === 'add' ? [0] : [0, 1]).map((c) => marker(c as 0 | 1, 'y'))}
      </svg>
    </div>
  );
}
