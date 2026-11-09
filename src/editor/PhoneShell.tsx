// Telefonun defter düzeni (arayüz v4): 56 px üst çubuk (logo, devrenin adı ve altında durum satırı;
// dokununca devre sayfası; sağda Örnekler ve Daha fazla), şema kutusunun tam ekran düğmesi, bir karta
// odaklanınca şemanın yerini alan 64 px şerit, tam ekran kablo bağlama görünümünün (DP2) üst ve alt
// çubukları ve altta sabit çubuk (Parça, Kablo, Oynat; çalışırken Duraklat, Durdur, süre).

import { useMemo } from 'react';
import { tr } from '../i18n/tr';
import { partBounds } from '../model/geometry';
import type { CircuitDoc } from '../model/types';
import { formatSI } from '../sim/units';
import type { SaveState } from './autosave';
import { HintText } from './HintStrip';
import { Icon } from './icons';
import { Logo } from './Logo';
import type { SimStatus } from './useSimulation';

/** Üst çubuktaki durum satırı: "Kur · kaydedildi", "Çalışıyor · 2,58 s". */
export function statusLine(status: SimStatus, time: number, saveState: SaveState): string {
  if (status === 'stopped' && saveState === 'off') return tr.phone.statusLine.stopped;
  if (status === 'stopped') return `${tr.phone.statusLine.stopped} · ${saveState === 'failed' ? tr.phone.notSavedShort : tr.phone.savedShort}`;
  return `${tr.phone.statusLine[status]} · ${formatSI(time, 's', { digits: 3 })}`;
}

const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink active:bg-app disabled:text-stopped';

export interface PhoneHeaderProps {
  readonly title: string;
  readonly status: SimStatus;
  readonly time: number;
  /** Simülasyon gerçek zamana yetişemiyor (masaüstündeki gibi uyarı simgesi; açıklaması Durum sayfasında). */
  readonly lagging?: boolean;
  readonly saveState: SaveState;
  /** Devre sayfası (yeni, aç, indir, paylaş…) açık mı; adına dokununca açılır. */
  readonly circuitOpen: boolean;
  readonly moreOpen: boolean;
  readonly onCircuit: () => void;
  readonly onExamples: () => void;
  readonly onMore: () => void;
  /** Tahtada kur: Geri al üst çubukta (yalnızca Kur kipinde). */
  readonly undo?: { readonly can: boolean; readonly run: () => void };
}

/** Üst çubuk (56 px): logo, devrenin adı (tek satır) ve altında durum; sağda Örnekler ve Daha fazla. */
export function PhoneHeader(props: PhoneHeaderProps) {
  const { status } = props;
  const line = statusLine(status, props.time, props.saveState);
  const tone = status === 'running' ? 'text-ok-ink' : status === 'paused' || props.saveState === 'failed' ? 'text-warn' : 'text-muted';
  return (
    <header className="shrink-0 border-b border-line bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <h1 className="sr-only">{tr.site.name}</h1>
      <div className="flex h-14 items-center gap-1.5 pr-1.5 pl-3">
        <Logo size={28} />
        <button
          type="button"
          onClick={props.onCircuit}
          aria-haspopup="dialog"
          aria-expanded={props.circuitOpen}
          aria-label={tr.phone.circuitButton(props.title, line)}
          className="flex h-11 min-w-0 flex-1 flex-col justify-center rounded-md px-1.5 text-left leading-[1.2] active:bg-panel-2"
        >
          <span className="truncate text-[15px] font-semibold">{props.title}</span>
          <span className={`flex min-w-0 items-center gap-1.5 text-label ${tone}`}>
            {status === 'running' && <i className="block h-1.5 w-1.5 shrink-0 rounded-full bg-ok" aria-hidden="true" />}
            <span className="truncate tabular">{line}</span>
            {props.lagging && status === 'running' && (
              <span data-lagging="" className="flex shrink-0 text-warn">
                <Icon name="info" className="h-3.5 w-3.5" />
              </span>
            )}
          </span>
        </button>
        {props.undo && status === 'stopped' && (
          <button type="button" onClick={props.undo.run} disabled={!props.undo.can} aria-label={tr.toolbar.undo} className={iconButton}>
            <Icon name="undo" />
          </button>
        )}
        <button type="button" onClick={props.onExamples} aria-label={tr.examples.button} className={iconButton}>
          <Icon name="book" />
        </button>
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

/** Şema kutusunun sağ altı: tam ekran / küçült. */
export function SchematicButtons({ full, onFull, bottom = 10, bench = false }: { full: boolean; onFull: () => void; bottom?: number | string; bench?: boolean }) {
  // 3B görünümde düğme 3B'yi büyütür: adı da öyle (erişilebilir ad ve ipucu).
  const label = bench ? (full ? tr.phone.benchSmall : tr.phone.benchFull) : full ? tr.phone.schematicSmall : tr.phone.schematicFull;
  return (
    <div className="absolute right-2.5 z-10 flex gap-1.5" style={{ bottom }}>
      <button
        type="button"
        onClick={onFull}
        aria-label={label}
        title={label}
        aria-pressed={full}
        className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-panel text-ink shadow-md active:bg-panel-2"
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
        <button type="button" onClick={onDone} className="h-10 shrink-0 rounded-md bg-ink px-4 text-[15px] font-semibold text-on-ink active:brightness-125">
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

/**
 * Altta sabit çubuk (76 px; altında güvenli alan): Kur kipinde [+ Parça] [Kablo] [▶ Oynat] (Oynat daha geniş,
 * yeşil); çalışırken [Duraklat] [Durdur] [● süre] (süreye dokununca hız); duraklatılmışken Parça ve Kablo
 * yerine "Düzenlemek için durdur" ve Devam et. Arıza bulmada ve kilitli görevde Parça ve Kablo yok.
 */
export function PhoneBottomBar({
  compact = false,
  status,
  time,
  canEdit,
  canConnect,
  addOpen,
  speedOpen,
  onAdd,
  onConnect,
  onPlay,
  onPause,
  onStop,
  onSpeed,
}: {
  /** Yatay telefon: düğmeler 44 px, kenar payları küçük (defter ve şema yer kazanır). */
  compact?: boolean;
  status: SimStatus;
  time: number;
  /** Parça eklenebilir mi (Kur kipinde, kilitli görev ve arıza bulma dışında). */
  canEdit: boolean;
  /** Kablo bağlanabilir mi (devrede parça var, şema görünümünde). */
  canConnect: boolean;
  addOpen: boolean;
  speedOpen: boolean;
  onAdd: () => void;
  onConnect: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSpeed: () => void;
}) {
  const base = `flex min-w-0 items-center justify-center gap-2 rounded-md px-2 text-[15px] font-semibold ${compact ? 'h-11' : 'h-[52px]'}`;
  const outline = `${base} flex-1 border border-line-2 bg-panel text-ink active:bg-panel-2 disabled:text-stopped`;
  const green = `${base} flex-[1.6] bg-ok px-3 text-white active:brightness-110`;
  return (
    <nav
      aria-label={tr.phone.bottomBar}
      className={`flex shrink-0 items-center gap-2 border-t border-line bg-panel px-3 ${compact ? 'pt-1.5' : 'pt-3'}`}
      style={{ paddingBottom: `calc(${compact ? 6 : 12}px + env(safe-area-inset-bottom))` }}
    >
      {status === 'running' ? (
        <>
          <button type="button" data-tour="play" onClick={onPause} className={`${base} flex-1 bg-ink text-on-ink active:brightness-125`}>
            <Icon name="pause" className="h-[18px] w-[18px]" />
            {tr.sim.pause}
          </button>
          <button type="button" onClick={onStop} className={outline}>
            <Icon name="stop" className="h-[18px] w-[18px]" />
            {tr.sim.stop}
          </button>
          <button type="button" onClick={onSpeed} aria-haspopup="dialog" aria-expanded={speedOpen} aria-label={tr.phone.timeButton(formatSI(time, 's', { digits: 3 }))} className={`${outline} font-mono font-medium tabular`}>
            <i className="block h-2 w-2 shrink-0 rounded-full bg-ok" aria-hidden="true" />
            {formatSI(time, 's', { digits: 3 })}
          </button>
        </>
      ) : status === 'paused' ? (
        <>
          <button type="button" onClick={onStop} className={`${base} flex-[1.4] border border-line-2 bg-panel text-sm text-ink active:bg-panel-2`}>
            <Icon name="stop" className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{tr.phone.stopToEditButton}</span>
          </button>
          <button type="button" data-tour="play" onClick={onPlay} className={green}>
            <Icon name="play" className="h-[18px] w-[18px]" />
            {tr.phone.resume}
          </button>
        </>
      ) : (
        <>
          {canEdit && (
            <>
              <button type="button" data-tour="parts" onClick={onAdd} aria-haspopup="dialog" aria-expanded={addOpen} className={addOpen ? `${base} flex-1 border border-accent bg-accent-soft text-accent-ink` : outline}>
                <Icon name="plus" className="h-[18px] w-[18px]" />
                {tr.phone.addShort}
              </button>
              <button type="button" data-tour="canvas" onClick={onConnect} disabled={!canConnect} className={outline}>
                <Icon name="wire" className="h-[18px] w-[18px]" />
                {tr.phone.wireShort}
              </button>
            </>
          )}
          <button type="button" data-tour="play" onClick={onPlay} className={green}>
            <Icon name="play" className="h-[18px] w-[18px]" />
            {tr.sim.play}
          </button>
        </>
      )}
    </nav>
  );
}
