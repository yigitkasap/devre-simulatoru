// Telefonda alt çubuk (tasarım: C-TelAlt, P00): aynı anda en çok dört eylem ve sağda Oynat. Çubuğun
// dört hâli: Kur (Parça, Bağla, Geri al, Panel), parça seçili (Değer, Döndür, Çevir, Sil), Bağla (durum,
// Geri al, Bitti) ve Ölç (Ölçümler, Cihazlar, Hız, Durdur). Oynat her hâlde aynı yerde.

import type { ReactNode } from 'react';
import { tr } from '../i18n/tr';
import { Icon, type IconName } from './icons';

export type PhoneBarState = 'kur' | 'sec' | 'bagla' | 'olc' | 'pause';
export type PhoneBarActive = 'parts' | 'panel' | 'measure' | 'devices' | null;

export interface PhoneBarProps {
  readonly state: PhoneBarState;
  readonly active: PhoneBarActive;
  readonly canUndo: boolean;
  // Kur
  readonly onParts: () => void;
  readonly onConnect: () => void;
  readonly onUndo: () => void;
  readonly onPanel: () => void;
  // Seçim
  /** Değer düğmesinin üst satırı (220 Ω, "Kablo", "3 öğe"). */
  readonly valueText: string;
  /** Değer düğmesi bir özellik sayfası açabiliyor mu (tek parça). */
  readonly canEditValue: boolean;
  readonly canRotate: boolean;
  readonly canFlip: boolean;
  readonly onValue: () => void;
  readonly onRotate: () => void;
  readonly onFlip: () => void;
  readonly onDelete: () => void;
  // Bağla
  readonly connectMessage: string;
  readonly connectDetail: string;
  readonly onDone: () => void;
  // Ölç
  readonly speed: string;
  readonly hasDevices: boolean;
  readonly onMeasure: () => void;
  readonly onDevices: () => void;
  readonly onSpeed: () => void;
  readonly onStop: () => void;
  // Oynat
  readonly onPlay: () => void;
  readonly onPause: () => void;
}

function BarButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  tone = 'ink',
  top,
  ariaLabel,
  grow = 1,
}: {
  icon?: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  tone?: 'ink' | 'danger' | 'accent';
  /** Simge yerine üst satırdaki değer (mono). */
  top?: ReactNode;
  ariaLabel?: string;
  grow?: number;
}) {
  const color = disabled
    ? 'text-stopped'
    : active || tone === 'accent'
      ? 'text-accent-ink'
      : tone === 'danger'
        ? 'text-danger'
        : 'text-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active || undefined}
      aria-label={ariaLabel}
      style={{ flexGrow: grow, flexBasis: 0 }}
      className={`flex h-14 min-w-0 flex-col items-center justify-center gap-[3px] rounded-xl text-[11.5px] leading-4 font-medium ${color} ${
        active || tone === 'accent' ? 'bg-accent-soft' : 'enabled:active:bg-app'
      }`}
    >
      {top ?? (icon && <Icon name={icon} className="h-[22px] w-[22px]" />)}
      <span className="max-w-full truncate px-0.5">{label}</span>
    </button>
  );
}

export function PhoneBar(props: PhoneBarProps) {
  const { state } = props;
  const olc = state === 'olc' || state === 'pause';
  const line =
    state === 'bagla' || state === 'sec' ? 'border-accent' : olc ? 'border-ok' : 'border-line';

  let actions: ReactNode;
  if (state === 'kur') {
    actions = (
      <>
        <BarButton icon="plus" label={tr.phone.parts} active={props.active === 'parts'} onClick={props.onParts} />
        <BarButton icon="wire" label={tr.phone.connect} onClick={props.onConnect} />
        <BarButton icon="undo" label={tr.phone.undo} disabled={!props.canUndo} onClick={props.onUndo} />
        <BarButton icon="panel" label={tr.phone.panel} active={props.active === 'panel'} onClick={props.onPanel} />
      </>
    );
  } else if (state === 'sec') {
    actions = (
      <>
        <BarButton
          label={tr.phone.value}
          tone={props.canEditValue ? 'accent' : 'ink'}
          disabled={!props.canEditValue}
          grow={1.25}
          ariaLabel={props.canEditValue ? tr.phone.valueButton(props.valueText) : undefined}
          top={<span className="max-w-full truncate px-1 font-mono text-[15px] leading-5 font-semibold">{props.valueText}</span>}
          onClick={props.onValue}
        />
        <BarButton icon="rotate" label={tr.phone.rotate} disabled={!props.canRotate} onClick={props.onRotate} />
        <BarButton icon="flip" label={tr.phone.flip} disabled={!props.canFlip} onClick={props.onFlip} />
        <BarButton icon="trash" label={tr.phone.remove} tone="danger" onClick={props.onDelete} />
      </>
    );
  } else if (state === 'bagla') {
    actions = (
      <>
        <div role="status" className="flex min-w-0 flex-col pl-2" style={{ flexGrow: 2.1, flexBasis: 0 }}>
          <span className="text-sm font-semibold text-accent-ink">{props.connectMessage}</span>
          <span className="truncate text-label text-ink-2">{props.connectDetail}</span>
        </div>
        <BarButton icon="undo" label={tr.phone.undo} disabled={!props.canUndo} onClick={props.onUndo} />
        <button
          type="button"
          onClick={props.onDone}
          style={{ flexGrow: 1, flexBasis: 0 }}
          className="h-12 min-w-0 rounded-xl bg-ink text-sm font-semibold text-white active:brightness-125"
        >
          {tr.phone.done}
        </button>
      </>
    );
  } else {
    actions = (
      <>
        <BarButton icon="measure" label={tr.phone.measurements} active={props.active === 'measure'} onClick={props.onMeasure} />
        <BarButton
          icon="devices"
          label={tr.phone.devices}
          active={props.active === 'devices'}
          disabled={!props.hasDevices}
          onClick={props.onDevices}
        />
        <BarButton
          label={tr.phone.speed}
          ariaLabel={tr.phone.speedButton(props.speed)}
          top={<span className="font-mono text-sm leading-5 font-semibold">{props.speed}</span>}
          onClick={props.onSpeed}
        />
        <BarButton icon="stop" label={tr.phone.stop} onClick={props.onStop} />
      </>
    );
  }

  const running = state === 'olc';
  const playLabel = running ? tr.phone.pause : state === 'pause' ? tr.phone.resume : tr.phone.play;
  return (
    <nav
      aria-label={tr.phone.bar}
      className={`flex shrink-0 items-center gap-0.5 border-t-[1.5px] pr-2 pl-1.5 ${line} ${state === 'bagla' ? 'bg-accent-soft/50' : 'bg-panel'}`}
      style={{ height: 'calc(70px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className={`flex min-w-0 flex-1 items-center ${state === 'bagla' ? 'gap-1' : 'gap-0.5'}`}>{actions}</div>
      <button
        type="button"
        onClick={running ? props.onPause : props.onPlay}
        disabled={state === 'bagla'}
        aria-label={playLabel}
        title={playLabel}
        className={`ml-1 flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-white shadow-[0_4px_12px_rgba(29,39,51,0.22)] ${
          running ? 'bg-ink' : state === 'bagla' ? 'bg-line-2' : 'bg-ok active:brightness-110'
        }`}
      >
        <Icon name={running ? 'pause' : 'play'} className="h-6 w-6" />
      </button>
    </nav>
  );
}
