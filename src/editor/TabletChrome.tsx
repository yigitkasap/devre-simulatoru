// Tabletin araç şeridi, alt çubuğu ve parça ekleme kartı (tasarım: T01, T02). Tuvalin dokunma kipleri
// (Kur, Bağla, Ölç) telefondakiyle aynıdır; düğmeler en az 44 px, araç şeridindekiler 60 px.

import { useEffect, useRef, useState } from 'react';
import { tr } from '../i18n/tr';
import { HintText } from './HintStrip';
import { Icon, type IconName } from './icons';
import { PartsSheetBody, type PartsSheetProps } from './PhoneSheets';
import { SpeedOptions, speedLabel } from './SimBar';

/** Soldaki 72 px araç şeridi: Parça (ekleme kartı) ve Bağla. Ölç kipinde kapalı. */
export function TabletRail({
  partsOpen,
  connecting,
  locked,
  onParts,
  onConnect,
}: {
  partsOpen: boolean;
  connecting: boolean;
  /** Ölç kipi: devrenin yapısı kilitli. */
  locked: boolean;
  onParts: () => void;
  onConnect: () => void;
}) {
  const item = (icon: IconName, label: string, active: boolean, onClick: () => void, expanded?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      className={`flex h-[60px] w-[60px] flex-col items-center justify-center gap-0.5 rounded-xl text-[11.5px] font-medium disabled:text-stopped ${
        active ? 'bg-accent-soft text-accent-ink' : 'text-ink enabled:active:bg-app'
      }`}
    >
      <Icon name={icon} className="h-6 w-6" />
      {label}
    </button>
  );
  return (
    <nav aria-label={tr.tablet.tools} className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2.5">
      {item('plus', tr.phone.parts, partsOpen, onParts, partsOpen)}
      {item('wire', tr.phone.connect, connecting, onConnect)}
      {locked && <span className="px-1.5 pt-1 text-center text-[10.5px] leading-tight text-muted">{tr.tablet.locked}</span>}
    </nav>
  );
}

/** Tuvalin üstünde, solda açılan parça ekleme kartı (T02). */
export function TabletPartsCard({ onClose, dragging, ...props }: PartsSheetProps & { onClose: () => void; dragging: boolean }) {
  return (
    <div
      role="dialog"
      aria-label={tr.phone.addTitle}
      className={`absolute top-2 bottom-2 left-2 z-30 flex w-[340px] max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-[14px] bg-panel shadow-[0_16px_40px_rgba(29,39,51,0.2)] ${
        dragging ? 'opacity-25' : ''
      }`}
    >
      <div className="flex shrink-0 items-center justify-between pt-2 pr-2 pb-1 pl-4">
        <h2 className="text-[17px] font-semibold">{tr.phone.addTitle}</h2>
        <button type="button" onClick={onClose} aria-label={tr.phone.close} className="flex h-11 w-11 items-center justify-center rounded-[10px] text-muted active:bg-app">
          <Icon name="close" />
        </button>
      </div>
      <PartsSheetBody {...props} grouped />
    </div>
  );
}

export type TabletBarState = 'kur' | 'sec' | 'bagla' | 'olc' | 'pause';

export interface TabletBarProps {
  readonly state: TabletBarState;
  /** Sağdaki bilgi (HintText biçiminde: **kalın**). */
  readonly hint: string;
  readonly hintTone?: 'error' | 'warn';
  readonly statusText: string;
  // Seçim
  readonly canRotate: boolean;
  readonly canFlip: boolean;
  readonly onRotate: () => void;
  readonly onFlip: () => void;
  readonly onDelete: () => void;
  // Bağla
  readonly connectMessage: string;
  readonly connectDetail: string;
  readonly canUndo: boolean;
  readonly onUndo: () => void;
  readonly onDone: () => void;
  // Ölç
  readonly speed: number;
  readonly scopeSpeed: number | null;
  readonly onSpeed: (speed: number) => void;
  /** Hız penceresi açılıp kapanınca (tuval dokunmayı tutmasın). */
  readonly onSpeedOpen: (open: boolean) => void;
  readonly onStop: () => void;
  readonly onPlay: () => void;
  readonly onPause: () => void;
}

function BarButton({ icon, label, onClick, disabled = false, danger = false }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-line-2 bg-panel px-3 text-[15px] font-medium enabled:active:bg-app disabled:text-stopped ${
        danger ? 'text-danger' : 'text-ink'
      }`}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

/** Alttaki 64 px simülasyon çubuğu: kipe göre eylemler, bilgi satırı ve sağda Oynat (T01, T02). */
export function TabletBar(props: TabletBarProps) {
  const { state } = props;
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);
  const onSpeedOpen = props.onSpeedOpen;
  useEffect(() => {
    onSpeedOpen(speedOpen);
    if (!speedOpen) return undefined;
    const onPointer = (e: PointerEvent) => {
      if (!speedRef.current?.contains(e.target as Node)) setSpeedOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSpeedOpen(false);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [speedOpen, onSpeedOpen]);
  useEffect(() => {
    if (state !== 'olc' && state !== 'pause') setSpeedOpen(false);
  }, [state]);

  const olc = state === 'olc' || state === 'pause';
  const running = state === 'olc';
  const playLabel = running ? tr.phone.pause : state === 'pause' ? tr.phone.resume : tr.phone.play;
  const line = olc ? 'border-ok' : state === 'bagla' || state === 'sec' ? 'border-accent' : 'border-line';

  return (
    <div
      role="region"
      aria-label={tr.sim.region}
      className={`flex h-16 shrink-0 items-center gap-2 border-t-[1.5px] px-3 ${line} ${state === 'bagla' ? 'bg-accent-soft/50' : 'bg-panel'}`}
    >
      <span role="status" className="sr-only">
        {props.statusText}
      </span>
      {state === 'sec' && (
        <>
          <BarButton icon="rotate" label={tr.phone.rotate} onClick={props.onRotate} disabled={!props.canRotate} />
          <BarButton icon="flip" label={tr.toolbar.flip} onClick={props.onFlip} disabled={!props.canFlip} />
          <BarButton icon="trash" label={tr.phone.remove} onClick={props.onDelete} danger />
        </>
      )}
      {state === 'bagla' && (
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold text-accent-ink">{props.connectMessage}</span>
          <span className="truncate text-small text-ink-2">{props.connectDetail}</span>
        </div>
      )}
      {olc && (
        <>
          <BarButton icon="stop" label={tr.phone.stop} onClick={props.onStop} />
          <div ref={speedRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setSpeedOpen((o) => !o)}
              aria-haspopup="dialog"
              aria-expanded={speedOpen}
              className={`flex h-11 items-center gap-2 rounded-[10px] border border-line-2 px-3 text-[15px] font-medium ${speedOpen ? 'bg-accent-soft' : 'bg-panel active:bg-app'}`}
            >
              <Icon name="speed" />
              {tr.phone.speed}
              <b className="font-mono text-sm font-semibold">{speedLabel(props.speed)}</b>
            </button>
            {speedOpen && (
              <div role="dialog" aria-label={tr.sim.speedDialog} className="absolute bottom-full left-0 z-[60] mb-2 w-[340px] rounded-xl border border-line bg-panel p-2 shadow-lg">
                <SpeedOptions speed={props.speed} scopeSpeed={props.scopeSpeed} onSpeed={props.onSpeed} touch />
              </div>
            )}
          </div>
        </>
      )}
      {state !== 'bagla' && (
      <p className={`min-w-0 flex-1 truncate text-small ${props.hintTone === 'error' ? 'text-danger' : props.hintTone === 'warn' ? 'text-warn' : 'text-muted'}`} title={props.hint.replace(/\*\*/g, '')}>
        <HintText text={props.hint} />
      </p>
      )}
      {state === 'bagla' && (
        <>
          <BarButton icon="undo" label={tr.phone.undo} onClick={props.onUndo} disabled={!props.canUndo} />
          <button type="button" onClick={props.onDone} className="h-11 shrink-0 rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white active:brightness-125">
            {tr.phone.done}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={running ? props.onPause : props.onPlay}
        disabled={state === 'bagla'}
        aria-label={playLabel}
        title={playLabel}
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-[0_4px_12px_rgba(29,39,51,0.22)] ${
          running ? 'bg-ink' : state === 'bagla' ? 'bg-line-2' : 'bg-ok active:brightness-110'
        }`}
      >
        <Icon name={running ? 'pause' : 'play'} className="h-6 w-6" />
      </button>
    </div>
  );
}
