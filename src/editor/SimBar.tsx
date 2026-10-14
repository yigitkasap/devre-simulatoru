// Alt araç çubuğu: Oynat / Duraklat / Durdur, simülasyon zamanı, hız ayarı ve akım yönü seçeneği.

import { tr, type DiagnosticContext } from '../i18n/tr';
import { formatNumber, formatSI } from '../sim/units';
import { Icon, type IconName } from './icons';
import { Rich } from './Rich';
import type { SimNotice, SimStatus } from './useSimulation';

export interface SimBarProps {
  readonly status: SimStatus;
  readonly time: number;
  readonly speed: number;
  readonly notice: SimNotice;
  /** Simülasyon istenen hıza yetişemiyor. */
  readonly lagging: boolean;
  readonly electronFlow: boolean;
  readonly diagnosticContext: DiagnosticContext;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStop: () => void;
  readonly onSpeed: (speed: number) => void;
  readonly onElectronFlow: (on: boolean) => void;
}

/**
 * Hız kaydırıcısı logaritmiktir: ×10⁻⁶ … ×1. Yüksek frekanslı sinyaller (fonksiyon üreteci
 * 2 MHz'e kadar) yalnızca çok yavaşlatılınca izlenebilir.
 */
const MIN_SPEED_LOG = -6;
const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Hızın yazımı: ×1, ×0,5, ×0,01; daha küçüklerde ×2·10⁻⁵ gibi. */
export function speedLabel(speed: number): string {
  if (speed >= 0.01) return `×${formatNumber(speed, speed >= 0.1 ? 2 : 3).replace(/0+$/, '').replace(/,$/, '')}`;
  const exp = Math.floor(Math.log10(speed) + 1e-9);
  const mantissa = speed / 10 ** exp;
  const power = String(exp).replace(/./g, (c) => SUPERSCRIPT[c] ?? c);
  const m = Math.abs(mantissa - 1) < 0.05 ? '' : `${formatNumber(mantissa, 1).replace(/,0$/, '')}·`;
  return `×${m}10${power}`;
}

function SimButton({
  icon,
  label,
  title,
  onClick,
  disabled,
  tone,
}: {
  icon: IconName;
  label: string;
  title?: string;
  onClick: () => void;
  disabled: boolean;
  tone: 'play' | 'neutral';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors disabled:opacity-35 ${
        tone === 'play' && !disabled ? 'bg-ok text-white hover:brightness-110' : 'text-ink hover:bg-app'
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

const STATUS_DOT: Record<SimStatus, string> = {
  running: 'bg-ok',
  paused: 'bg-paused',
  stopped: 'bg-stopped',
};

export function SimBar(props: SimBarProps) {
  const { status, notice } = props;
  const active = status !== 'stopped';
  const sliderValue = Math.log10(props.speed) - MIN_SPEED_LOG;

  let message: { text: string; tone: 'error' | 'info' } | null = null;
  if (notice?.kind === 'error') {
    const { detail } = tr.diagnostics.describe(notice.diagnostic, props.diagnosticContext);
    message = { text: `${tr.sim.cannotRun} ${detail}`, tone: 'error' };
  } else if (notice?.kind === 'stopped-by-edit') {
    message = { text: tr.sim.stoppedByEdit, tone: 'info' };
  } else if (active && props.lagging) {
    message = { text: tr.sim.lagging, tone: 'error' };
  } else if (active) {
    message = { text: props.electronFlow ? tr.sim.electronNote : tr.sim.conventionalNote, tone: 'info' };
  }

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-panel px-2 py-1.5 text-sm">
      <div className="flex items-center gap-1">
        <SimButton icon="play" label={tr.sim.play} onClick={props.onPlay} disabled={status === 'running'} tone="play" />
        <SimButton icon="pause" label={tr.sim.pause} onClick={props.onPause} disabled={status !== 'running'} tone="neutral" />
        <SimButton
          icon="stop"
          label={tr.sim.stop}
          title={tr.sim.stopTitle}
          onClick={props.onStop}
          disabled={status === 'stopped'}
          tone="neutral"
        />
      </div>

      <div className="flex items-center gap-2 text-muted" aria-live="polite">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
        <span className="hidden md:inline">{tr.sim.status[status]}</span>
        <span className="tabular text-ink">
          {tr.sim.time}: <strong className="font-semibold">{formatSI(active ? props.time : 0, 's', { digits: 4 })}</strong>
        </span>
      </div>

      <label className="flex items-center gap-2" title={tr.sim.speedTitle}>
        <span className="text-muted">{tr.sim.speed}</span>
        <input
          type="range"
          min={0}
          max={-MIN_SPEED_LOG}
          step={0.01}
          value={sliderValue}
          onChange={(e) => {
            const value = 10 ** (Number(e.target.value) + MIN_SPEED_LOG);
            // 1×, 0,1× ve 0,01× değerlerine yakınken tam değere yapış.
            const snapped = [1, 0.5, 0.1, 0.05, 0.01, 1e-3, 1e-4, 1e-5, 1e-6].find((s) => Math.abs(Math.log10(value / s)) < 0.03);
            props.onSpeed(snapped ?? value);
          }}
          className="w-24 accent-accent sm:w-32"
        />
        <span className="w-16 tabular">{speedLabel(props.speed)}</span>
      </label>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={props.electronFlow}
          onChange={(e) => props.onElectronFlow(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        <span>{tr.sim.electronFlow}</span>
      </label>

      {message && (
        <p
          className={`min-w-0 basis-full text-xs lg:basis-0 lg:flex-1 ${message.tone === 'error' ? 'text-danger' : 'text-muted'}`}
          role={message.tone === 'error' ? 'alert' : undefined}
        >
          <Rich text={message.text} />
        </p>
      )}
    </footer>
  );
}
