// Osiloskop paneli: devrede osiloskop varken masaüstünde tuvalin sağ altında, telefonda tuvalin
// altında durur. Ekran (iki kanal), kanal ölçümleri ve ayar düğmeleri buradadır. Ayarlar
// parçanın özelliklerinde saklanır (kaydedilir, paylaşılır, geri alınabilir).

import { useId } from 'react';
import { tr } from '../i18n/tr';
import type { Part } from '../model/types';
import { SCOPE_TRIGGERS, TIME_PER_DIV_STEPS, VOLTS_PER_DIV_STEPS, scopeSettings } from '../sim/devices/oscilloscope';
import type { PropValue } from '../sim/netlist';
import { formatSI } from '../sim/units';
import { Icon } from './icons';
import { SCREEN_DIV, SCREEN_H, SCREEN_W, type ChannelStats, type ScopeView } from './scopeView';

/** Kanal renkleri (koyu ekranda iyi seçilen sarı ve camgöbeği). */
export const SCOPE_COLORS = ['#f2c94c', '#56ccf2'] as const;
const CHANNELS = ['A', 'B'] as const;
const POSITION_LIMIT = 4;

export interface ScopePanelProps {
  readonly scopes: readonly Part[];
  /** Gösterilen osiloskop. */
  readonly scope: Part;
  readonly onChoose: (id: string) => void;
  /** Simülasyon çalışmıyorsa null. */
  readonly view: ScopeView | null;
  /** Kanal bağlantıları (simülasyon durmuşken de bilinir). */
  readonly connected: readonly [boolean, boolean];
  readonly collapsed: boolean;
  readonly onCollapsed: (collapsed: boolean) => void;
  readonly onChange: (patch: Record<string, PropValue>) => void;
  readonly onAuto: () => void;
}

const voltsLabel = (v: number) => `${formatSI(v, 'V', { trim: true })}${tr.scope.perDiv}`;
const timeLabel = (t: number) => `${formatSI(t, 's', { trim: true })}${tr.scope.perDiv}`;

function statsText(stats: ChannelStats): string {
  const parts = [
    `${tr.scope.peakToPeak} ${formatSI(stats.peakToPeak, 'V')}`,
    `${tr.scope.rms} ${formatSI(stats.rms, 'V')}`,
  ];
  if (stats.frequency !== null) parts.push(`${tr.scope.frequency} ${formatSI(stats.frequency, 'Hz')}`);
  return parts.join(' · ');
}

const selectClass = 'rounded border border-line bg-panel px-1 py-0.5 text-xs tabular';
const buttonClass = 'flex h-6 w-6 max-md:hidden items-center justify-center rounded border border-line text-muted hover:bg-app disabled:opacity-35';

export function ScopePanel(props: ScopePanelProps) {
  const { scope, view, connected, collapsed } = props;
  const settings = scopeSettings(scope.props);
  const titleId = useId();
  const status = view ? (view.triggered ? null : tr.scope.rolling) : null;

  return (
    <section
      aria-labelledby={titleId}
      className="absolute z-20 border border-line bg-panel shadow-lg max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-xl md:right-2 md:bottom-2 md:w-[380px] md:rounded-xl"
    >
      <header className="flex items-center gap-2 px-3 py-1.5">
        <h2 id={titleId} className="text-sm font-semibold">
          {tr.scope.title}
        </h2>
        {props.scopes.length > 1 ? (
          <select
            aria-label={tr.scope.choose}
            value={scope.id}
            onChange={(e) => props.onChoose(e.target.value)}
            className={selectClass}
          >
            {props.scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted">{scope.label}</span>
        )}
        {status && <span className="truncate text-xs text-muted">{status}</span>}
        <button
          type="button"
          onClick={() => props.onCollapsed(!collapsed)}
          aria-label={collapsed ? tr.scope.expand : tr.scope.collapse}
          aria-expanded={!collapsed}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-app"
        >
          <Icon name="chevron" className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      </header>

      {!collapsed && (
        <>
          <Screen view={view} settings={settings} connected={connected} />
          <div className="space-y-1.5 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {CHANNELS.map((name, index) => {
                const position = settings.position[index]!;
                const positionKey = `position${name}`;
                return (
                  <div key={name} className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="h-2 w-2 rounded-full" style={{ background: SCOPE_COLORS[index] }} aria-hidden="true" />
                      {name}
                    </span>
                    <select
                      aria-label={`${tr.scope.channel(name)} ${tr.scope.voltsPerDiv}`}
                      value={settings.voltsPerDiv[index]}
                      onChange={(e) => props.onChange({ [`voltsPerDiv${name}`]: Number(e.target.value) })}
                      className={selectClass}
                    >
                      {VOLTS_PER_DIV_STEPS.map((v) => (
                        <option key={v} value={v}>
                          {voltsLabel(v)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={`${tr.scope.channel(name)}: ${tr.scope.up}`}
                      disabled={position >= POSITION_LIMIT}
                      onClick={() => props.onChange({ [positionKey]: Math.min(POSITION_LIMIT, position + 1) })}
                    >
                      <Icon name="chevron" className="h-3.5 w-3.5 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={`${tr.scope.channel(name)}: ${tr.scope.down}`}
                      disabled={position <= -POSITION_LIMIT}
                      onClick={() => props.onChange({ [positionKey]: Math.max(-POSITION_LIMIT, position - 1) })}
                    >
                      <Icon name="chevron" className="h-3.5 w-3.5 rotate-90" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="flex items-center gap-1.5">
                <span className="text-muted">{tr.scope.timePerDiv}</span>
                <select
                  value={settings.timePerDiv}
                  onChange={(e) => props.onChange({ timePerDiv: Number(e.target.value) })}
                  className={selectClass}
                >
                  {TIME_PER_DIV_STEPS.map((t) => (
                    <option key={t} value={t}>
                      {timeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-muted">{tr.scope.trigger}</span>
                <select
                  value={settings.trigger}
                  onChange={(e) => props.onChange({ trigger: e.target.value })}
                  className={selectClass}
                >
                  {SCOPE_TRIGGERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={props.onAuto}
                title={tr.scope.autoTitle}
                className="ml-auto rounded-md border border-line px-2.5 py-1 font-medium hover:bg-app"
              >
                {tr.scope.auto}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Ekran: 10 × 8 bölmelik ızgara, kanalların sıfır işaretleri ve çizgileri; altında gerçek bir
 * osiloskoptaki gibi kanal ölçümleri (tepe-tepe, etkin değer, frekans).
 */
function Screen({
  view,
  settings,
  connected,
}: {
  view: ScopeView | null;
  settings: ReturnType<typeof scopeSettings>;
  connected: readonly [boolean, boolean];
}) {
  const grid: string[] = [];
  for (let i = 1; i < 10; i++) grid.push(`M${i * SCREEN_DIV},0 V${SCREEN_H}`);
  for (let i = 1; i < 8; i++) grid.push(`M0,${i * SCREEN_DIV} H${SCREEN_W}`);
  const ticks: string[] = [];
  for (let i = 0; i <= 50; i++) ticks.push(`M${i * 10},${SCREEN_H / 2 - 4} V${SCREEN_H / 2 + 4}`);
  for (let i = 0; i <= 40; i++) ticks.push(`M${SCREEN_W / 2 - 4},${i * 10} H${SCREEN_W / 2 + 4}`);
  const stroke = { vectorEffect: 'non-scaling-stroke' } as const;
  return (
    <div className="relative border-y border-line bg-[#0f1713] px-1 py-1">
      {!view && (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-[#9fb3a8]">
          {tr.scope.stopped}
        </p>
      )}
      <svg
        viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={tr.scope.screen}
        className="block h-32 w-full md:h-[min(18rem,36vh)]"
      >
        <path d={grid.join(' ')} stroke="#2a3a32" strokeWidth={1} style={stroke} fill="none" />
        <path d={ticks.join(' ')} stroke="#3c5246" strokeWidth={1} style={stroke} fill="none" />
        {[0, 1].map((index) => {
          const y = SCREEN_H / 2 - settings.position[index]! * SCREEN_DIV;
          return (
            <path key={`zero-${index}`} d={`M0,${y - 7} L9,${y} L0,${y + 7} Z`} fill={SCOPE_COLORS[index]} opacity={0.85} />
          );
        })}
        {view?.channels.map((channel, index) =>
          channel.path ? (
            <path
              key={index}
              d={channel.path}
              fill="none"
              stroke={SCOPE_COLORS[index]}
              strokeWidth={2}
              strokeLinejoin="round"
              style={stroke}
            />
          ) : null,
        )}
      </svg>
      <div className="min-h-8 px-1.5 pt-1 text-[11px] leading-4 tabular">
        {CHANNELS.map((name, index) => {
          const stats = view?.channels[index]?.stats;
          const text = !connected[index] ? tr.scope.notConnected : stats ? statsText(stats) : '';
          return text ? (
            <p key={name} style={{ color: SCOPE_COLORS[index] }}>
              {name} · {text}
            </p>
          ) : null;
        })}
      </div>
    </div>
  );
}
