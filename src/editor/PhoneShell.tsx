// Telefonun defter düzeni (tasarım v3: DP1–DP4): 56 px üst çubuk (logo, devrenin adı ve altında durum
// satırı; dokununca Durdur ve Hız; Geri al, ⋯), şema kutusunun düğmeleri, bir karta odaklanınca şemanın
// yerini alan 64 px şerit, tam ekran kablo bağlama görünümünün (DP2) üst ve alt çubukları ve iki yüzen
// düğme (sol altta Parça ekle, sağ altta 64 px Oynat / Duraklat).

import { useMemo } from 'react';
import { tr } from '../i18n/tr';
import { partBounds } from '../model/geometry';
import type { CircuitDoc } from '../model/types';
import { formatSI } from '../sim/units';
import type { SaveState } from './autosave';
import { HintText } from './HintStrip';
import { Icon } from './icons';
import type { SimStatus } from './useSimulation';

/** Sitenin simgesi: koyu kare üzerinde turuncu dalga. */
function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0">
      <rect width="44" height="44" rx="9" fill="#1d2733" />
      <path d="M8 22c3.5-10 7-10 10.5 0s7 10 10.5 0 5-8 7-6" fill="none" stroke="#f05a28" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

/** Üst çubuktaki durum satırı: "Kur · kaydedildi", "Çalışıyor · 2,58 s". */
export function statusLine(status: SimStatus, time: number, saveState: SaveState): string {
  if (status === 'stopped' && saveState === 'off') return tr.phone.statusLine.stopped;
  if (status === 'stopped') return `${tr.phone.statusLine.stopped} · ${saveState === 'failed' ? tr.phone.notSavedShort : tr.phone.savedShort}`;
  return `${tr.phone.statusLine[status]} · ${formatSI(time, 's', { digits: 3 })}`;
}

const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink active:bg-app disabled:text-stopped';

export interface PhoneHeaderProps {
  readonly title: string;
  readonly status: SimStatus;
  readonly time: number;
  readonly saveState: SaveState;
  readonly canUndo: boolean;
  readonly statusOpen: boolean;
  readonly moreOpen: boolean;
  readonly onStatus: () => void;
  readonly onUndo: () => void;
  readonly onMore: () => void;
}

/** Üst çubuk (DP1): Geri al yalnızca Kur kipinde (çalışırken devrenin yapısı kilitli). */
export function PhoneHeader(props: PhoneHeaderProps) {
  const { status } = props;
  const line = statusLine(status, props.time, props.saveState);
  const tone = status === 'running' ? 'text-ok-ink' : status === 'paused' || props.saveState === 'failed' ? 'text-warn' : 'text-muted';
  return (
    <header className="shrink-0 border-b border-line bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <h1 className="sr-only">{tr.site.name}</h1>
      <div className="flex h-14 items-center gap-2 pr-2 pl-3">
        <Logo />
        <button
          type="button"
          onClick={props.onStatus}
          aria-haspopup="dialog"
          aria-expanded={props.statusOpen}
          aria-label={tr.phone.statusButton(props.title, line)}
          className="flex h-11 min-w-0 flex-1 flex-col justify-center rounded-[10px] px-1 text-left leading-[1.2] active:bg-app"
        >
          <span className="truncate text-[15px] font-semibold">{props.title}</span>
          <span className={`flex min-w-0 items-center gap-1.5 text-label ${tone}`}>
            {status === 'running' && <i className="block h-1.5 w-1.5 shrink-0 rounded-full bg-ok" aria-hidden="true" />}
            <span className="truncate tabular">{line}</span>
          </span>
        </button>
        {status === 'stopped' && (
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo} aria-label={tr.toolbar.undo} className={iconButton}>
            <Icon name="undo" />
          </button>
        )}
        <button type="button" onClick={props.onMore} aria-haspopup="dialog" aria-expanded={props.moreOpen} aria-label={tr.phone.more} className={iconButton}>
          <Icon name="more" />
        </button>
      </div>
    </header>
  );
}

/** Şemanın küçük çizimi: parçaların kutuları ve kablolar (şeritte, 72 × 44 px). */
function MiniSchematic({ doc }: { doc: CircuitDoc }) {
  const shape = useMemo(() => {
    const boxes = doc.parts.map((p) => partBounds(p));
    const xs = [...boxes.flatMap((b) => [b.x, b.x + b.w]), ...doc.wires.flatMap((w) => w.points.map((p) => p.x))];
    const ys = [...boxes.flatMap((b) => [b.y, b.y + b.h]), ...doc.wires.flatMap((w) => w.points.map((p) => p.y))];
    if (xs.length === 0) return null;
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(1, Math.max(...xs) - x0);
    const h = Math.max(1, Math.max(...ys) - y0);
    const pad = Math.max(w, h) * 0.08;
    return { boxes, viewBox: `${x0 - pad} ${y0 - pad} ${w + 2 * pad} ${h + 2 * pad}` };
  }, [doc]);
  return (
    <span className="flex h-11 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper" aria-hidden="true">
      {shape && (
        <svg width="60" height="36" viewBox={shape.viewBox} preserveAspectRatio="xMidYMid meet">
          {doc.wires.map((wire) => (
            <polyline
              key={wire.id}
              points={wire.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--color-wire-off)"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {shape.boxes.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--color-panel)" stroke="var(--color-ink-2)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}
    </span>
  );
}

/** Bir karta odaklanınca şemanın yerini alan 64 px'lik şerit (DP3): "Şema · 8 parça · 1 uyarı · Aç". */
export function SchematicStrip({ doc, errors, warnings, onOpen }: { doc: CircuitDoc; errors: number; warnings: number; onOpen: () => void }) {
  const summary = tr.phone.stripSummary(doc.parts.length, tr.phone.problemsShort(errors, warnings));
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={tr.phone.stripLabel(summary)}
      className="flex h-16 w-full shrink-0 items-center gap-3 border-b border-line bg-panel px-3 text-left active:bg-panel-2"
    >
      <MiniSchematic doc={doc} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{tr.phone.schematic}</span>
        <span className="truncate text-label text-muted">{summary}</span>
      </span>
      <span className="text-sm font-medium text-accent-ink">{tr.phone.open}</span>
    </button>
  );
}

/** Şema kutusunun sağ altı: Kablo bağla (yalnızca Kur kipinde) ve tam ekran / küçült. */
export function SchematicButtons({ connect, full, raised, onConnect, onFull }: { connect: boolean; full: boolean; raised: boolean; onConnect: () => void; onFull: () => void }) {
  return (
    <div className="absolute right-2.5 z-10 flex gap-1.5" style={{ bottom: raised ? 'calc(100px + env(safe-area-inset-bottom))' : 10 }}>
      {connect && (
        <button
          type="button"
          data-tour="canvas"
          onClick={onConnect}
          className="flex h-11 items-center gap-2 rounded-xl bg-accent px-3.5 text-sm font-semibold text-white shadow-sm active:brightness-110"
        >
          <Icon name="wire" className="h-[18px] w-[18px]" />
          {tr.phone.connectButton}
        </button>
      )}
      <button
        type="button"
        onClick={onFull}
        aria-label={full ? tr.phone.schematicSmall : tr.phone.schematicFull}
        aria-pressed={full}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel text-ink shadow-sm active:bg-app"
      >
        <Icon name={full ? 'fullscreenExit' : 'fullscreen'} />
      </button>
    </div>
  );
}

/** Tam ekran kablo bağlama (DP2): "← Kablo bağla … Bitti" ve altında adım numaralı mavi durum satırı. */
export function WiringHeader({ step, text, onDone }: { step: 1 | 2; text: string; onDone: () => void }) {
  return (
    <div className="shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="flex h-14 items-center gap-2 border-b border-line bg-panel pr-2 pl-1">
        <h1 className="sr-only">{tr.site.name}</h1>
        <button type="button" onClick={onDone} aria-label={tr.phone.backToList} className={iconButton}>
          <Icon name="chevron" className="rotate-180" />
        </button>
        <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{tr.phone.wiringTitle}</span>
        <button type="button" onClick={onDone} className="h-10 shrink-0 rounded-[10px] bg-ink px-4 text-[15px] font-semibold text-on-ink active:brightness-125">
          {tr.phone.done}
        </button>
      </header>
      <div role="status" className="flex items-center gap-2.5 border-b border-accent-line bg-accent-soft px-4 py-3 text-sm leading-[1.4]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white" aria-hidden="true">
          {step}
        </span>
        <span>
          <HintText text={text} />
        </span>
      </div>
    </div>
  );
}

/** Kablo bağlamanın alt çubuğu: Geri al ve Seçimi bırak (başlangıç ucunu bırakır). */
export function WiringFooter({ canUndo, hasStart, onUndo, onClear }: { canUndo: boolean; hasStart: boolean; onUndo: () => void; onClear: () => void }) {
  const button = 'flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-line-2 bg-panel text-[15px] font-medium active:bg-app disabled:text-stopped';
  return (
    <div className="flex shrink-0 gap-2 border-t border-line bg-panel px-4 pt-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
      <button type="button" onClick={onUndo} disabled={!canUndo} className={button}>
        <Icon name="undo" className="h-[18px] w-[18px]" />
        {tr.toolbar.undo}
      </button>
      <button type="button" onClick={onClear} disabled={!hasStart} className={button}>
        {tr.phone.clearStart}
      </button>
    </div>
  );
}

/** Yüzen düğmeler: sol altta Parça ekle (Kur kipinde), sağ altta 64 px Oynat / Duraklat. */
export function PhoneFabs({ status, canAdd, addOpen, onAdd, onPlay, onPause }: { status: SimStatus; canAdd: boolean; addOpen: boolean; onAdd: () => void; onPlay: () => void; onPause: () => void }) {
  const running = status === 'running';
  return (
    <>
      {canAdd && (
        <button
          type="button"
          data-tour="parts"
          onClick={onAdd}
          aria-haspopup="dialog"
          aria-expanded={addOpen}
          className="absolute left-4 z-20 flex h-[52px] items-center gap-2 rounded-full border border-line-2 bg-panel pr-[18px] pl-4 text-[15px] font-semibold shadow-[0_4px_12px_rgba(29,39,51,0.1)] active:bg-app"
          style={{ bottom: 'calc(28px + env(safe-area-inset-bottom))' }}
        >
          <Icon name="plus" className="h-[18px] w-[18px]" />
          {tr.phone.addTitle}
        </button>
      )}
      <button
        type="button"
        data-tour="play"
        onClick={running ? onPause : onPlay}
        aria-label={running ? tr.sim.pause : status === 'paused' ? tr.phone.resume : tr.sim.play}
        className={`absolute right-4 z-20 flex h-16 w-16 items-center justify-center rounded-full active:brightness-110 ${
          running ? 'bg-ink text-on-ink shadow-[0_6px_16px_rgba(29,39,51,0.3)]' : 'bg-ok text-white shadow-[0_6px_16px_rgba(27,125,68,0.3)]'
        }`}
        style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        <Icon name={running ? 'pause' : 'play'} className="h-6 w-6" />
      </button>
    </>
  );
}
