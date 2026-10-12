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
  readonly electronFlow: boolean;
  readonly diagnosticContext: DiagnosticContext;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStop: () => void;
  readonly onSpeed: (speed: number) => void;
  readonly onElectronFlow: (on: boolean) => void;
}

/** Hız kaydırıcısı logaritmiktir: 0 → ×0,01, 1 → ×0,1, 2 → ×1. */
const MIN_SPEED_LOG = -2;

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
        tone === 'play' && !disabled ? 'bg-[#1f8a4c] text-white hover:brightness-110' : 'text-ink hover:bg-app'
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

const STATUS_DOT: Record<SimStatus, string> = {
  running: 'bg-[#1f8a4c]',
  paused: 'bg-[#e8a317]',
  stopped: 'bg-[#9aa3ad]',
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
            const snapped = [1, 0.5, 0.1, 0.05, 0.01].find((s) => Math.abs(Math.log10(value / s)) < 0.03);
            props.onSpeed(snapped ?? value);
          }}
          className="w-24 accent-accent sm:w-32"
        />
        <span className="w-12 tabular">×{formatNumber(props.speed, 2)}</span>
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
