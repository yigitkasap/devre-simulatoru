// Osiloskobun ekranı (iki kanal, sürüklenebilir sıfır üçgenleri) ve ölçüm satırları; defterdeki
// osiloskop kartı (DeviceCards.tsx) ve telefonun Cihazlar sayfası kullanır. Ayarlar parçanın
// özelliklerinde saklanır (kaydedilir, paylaşılır, geri alınabilir; simülasyonu durdurmaz).

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { tr } from '../i18n/tr';
import type { Part } from '../model/types';
import type { ScopeSettings } from '../sim/devices/oscilloscope';
import type { PropValue } from '../sim/netlist';
import { formatSI } from '../sim/units';
import { SCREEN_DIV, SCREEN_H, SCREEN_W, type ChannelStats, type ScopeView } from './scopeView';

/** Kanal renkleri (koyu ekranda iyi seçilen sarı ve camgöbeği; açık zeminde koyu tonları). */
export const SCOPE_COLORS = ['var(--color-ch-a)', 'var(--color-ch-b)'] as const;
const LIGHT_COLORS = ['#7a5c00', '#0e6b8a'] as const;
export const CHANNELS = ['A', 'B'] as const;
const POSITION_LIMIT = 4;

export const voltsLabel = (v: number) => `${formatSI(v, 'V', { trim: true })}${tr.scope.perDiv}`;
export const timeLabel = (t: number) => `${formatSI(t, 's', { trim: true })}${tr.scope.perDiv}`;

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
  width,
  onChange,
}: {
  part: Part;
  view: ScopeView | null;
  settings: ScopeSettings;
  /** Ekranın yüksekliği (px); "fill" verilirse genişliğin tamamını kaplar (telefon). */
  height: number | 'fill';
  /**
   * Verilirse ekran bu genişlikte (defterdeki osiloskop kartı: kart genişliğinde, 10 × 8 bölme yatayda
   * esner). Çizgiler esner; sıfır üçgenleri ve harfler gerçek boyutta, HTML katmanında çizilir.
   */
  width?: number | string;
  onChange: (patch: Record<string, PropValue>) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ channel: 0 | 1; axis: 'x' | 'y' } | null>(null);
  const stretch = width !== undefined && height !== 'fill';
  const size =
    height === 'fill'
      ? { width: '100%', aspectRatio: `${SCREEN_W} / ${SCREEN_H}` }
      : width !== undefined
        ? { width, height }
        : { width: Math.round((height * SCREEN_W) / SCREEN_H), height };
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

  /** Esneyen ekranda üçgen ve harfler: konum yüzdeyle, boyut pikselle. */
  const overlayMarker = (channel: 0 | 1, axis: 'x' | 'y') => {
    const p = settings.position[channel] * SCREEN_DIV;
    const name = CHANNELS[channel];
    const style: CSSProperties =
      axis === 'y' ? { left: 0, top: `${((SCREEN_H / 2 - p) / SCREEN_H) * 100}%`, transform: 'translateY(-50%)' } : { top: 0, left: `${((SCREEN_W / 2 + p) / SCREEN_W) * 100}%`, transform: 'translateX(-50%)' };
    return (
      <span
        key={`m${channel}`}
        onPointerDown={startDrag(channel, axis)}
        className={`absolute flex h-7 w-7 items-center ${axis === 'y' ? 'cursor-ns-resize justify-start' : 'cursor-ew-resize items-start justify-center'}`}
        style={style}
        aria-hidden="true"
      >
        <svg width={axis === 'y' ? 12 : 16} height={axis === 'y' ? 16 : 12} viewBox={axis === 'y' ? '0 0 12 16' : '0 0 16 12'}>
          <path d={axis === 'y' ? 'M0,0 L12,8 L0,16 Z' : 'M0,0 L8,12 L16,0 Z'} fill={SCOPE_COLORS[channel]} />
          <text x={axis === 'y' ? 1.5 : 5} y={axis === 'y' ? 11 : 8} fontSize={8} fontWeight={700} fontFamily="var(--font-mono)" fill="#0f1713">
            {name}
          </text>
        </svg>
      </span>
    );
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
              {end && !stretch && (
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
        {!stretch && (xy ? [marker(0, 'x'), marker(1, 'y')] : (settings.mode === 'add' ? [0] : [0, 1]).map((c) => marker(c as 0 | 1, 'y')))}
      </svg>
      {stretch && (
        <div className="pointer-events-none absolute inset-0 [&>span]:pointer-events-auto" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
          {xy ? [overlayMarker(0, 'x'), overlayMarker(1, 'y')] : (settings.mode === 'add' ? [0] : [0, 1]).map((c) => overlayMarker(c as 0 | 1, 'y'))}
          {view?.channels.map((channel, index) => {
            const end = channel.path ? lastPoint(channel.path) : null;
            if (!end) return null;
            const label = settings.mode === 'add' ? tr.scope.sum(settings.invertB).replace(/\s/g, '') : CHANNELS[index];
            return (
              <span
                key={`e${index}`}
                className="absolute right-1.5 -translate-y-full font-mono text-[11px] font-bold"
                style={{ top: `${(Math.max(14, Math.min(SCREEN_H - 6, end.y - 8)) / SCREEN_H) * 100}%`, color: SCOPE_COLORS[index] }}
                aria-hidden="true"
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
