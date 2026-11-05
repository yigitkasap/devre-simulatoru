// Tuvalin sol altındaki yakınlaştırma grubu (arayüz v4): tek parça, 36 px: − · %yüzde · + | sığdır. Yalnızca
// masaüstünde ve tablette, şema görünümünde (Şema / 3B tezgâh seçimi üst çubukta). Tablette düğmeler 44 px'tir
// ve grubun sağında "Kablo bağla" durur (Kur kipinde; uçlar büyür, iki uca sırayla dokunulur); Bağla
// kipindeyken sağ altta Geri al, Seçimi bırak ve Bitti çıkar.

import { tr } from '../i18n/tr';
import { Icon, type IconName } from './icons';

export function CanvasControls({
  zoom,
  onZoomOut,
  onZoomIn,
  onFit,
  on3d,
  side = 'left',
  touch = false,
  onConnect,
}: {
  /** Yakınlaştırma yüzdesi (ölçek 1 = %100). */
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  /** Gömülü sayfa: üst çubuk yok, 3B'ye geçiş grubun sonunda. */
  on3d?: () => void;
  /** Sol alt (olağan) ya da sağ alt (arıza bulmada sol altta multimetre paneli varken). */
  side?: 'left' | 'right';
  touch?: boolean;
  /** Tablet, Kur kipi: "Kablo bağla". */
  onConnect?: () => void;
}) {
  const button = (icon: IconName, label: string, onClick: () => void, title = label) => (
    <button type="button" onClick={onClick} aria-label={label} title={title} className={`flex items-center justify-center text-ink hover:bg-panel-2 ${touch ? 'w-11' : 'w-9'}`}>
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
  return (
    <div className={`absolute bottom-4 z-10 flex items-center gap-2 ${side === 'left' ? 'left-4' : 'right-4 flex-row-reverse'}`}>
      <div role="group" aria-label={tr.toolbar.view} className={`flex items-stretch overflow-hidden rounded-md border border-line bg-panel shadow-md ${touch ? 'h-11' : 'h-9'}`}>
        {button('minus', tr.toolbar.zoomOut, onZoomOut)}
        <span role="status" title={tr.toolbar.zoomLevel} className="flex min-w-[52px] items-center justify-center font-mono text-label text-ink-2 tabular">
          <span className="sr-only">{tr.toolbar.zoomLevel}: </span>%{zoom}
        </span>
        {button('plus', tr.toolbar.zoomIn, onZoomIn)}
        <span className="w-px bg-line" aria-hidden="true" />
        {button('fit', tr.toolbar.fit, onFit, tr.toolbar.fitTitle)}
        {on3d && (
          <button type="button" onClick={on3d} className="border-l border-line px-2.5 text-small font-medium hover:bg-panel-2">
            {tr.bench.bench}
          </button>
        )}
      </div>
      {onConnect && (
        <button
          type="button"
          data-tour="canvas"
          onClick={onConnect}
          className="flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white shadow-md active:brightness-110"
        >
          <Icon name="wire" className="h-[18px] w-[18px]" />
          {tr.phone.connectButton}
        </button>
      )}
    </div>
  );
}

/** Tablet, Bağla kipi: tuvalin sağ altında Geri al, Seçimi bırak ve Bitti. */
export function WiringControls({ canUndo, hasStart, onUndo, onClear, onDone }: { canUndo: boolean; hasStart: boolean; onUndo: () => void; onClear: () => void; onDone: () => void }) {
  const button = 'flex h-11 items-center gap-2 rounded-[10px] border border-line-2 bg-panel px-3.5 text-sm font-medium shadow-sm active:bg-app disabled:text-stopped';
  return (
    <div role="group" aria-label={tr.phone.wiringTitle} className="absolute right-4 bottom-4 z-10 flex items-center gap-2">
      <button type="button" onClick={onUndo} disabled={!canUndo} className={button}>
        <Icon name="undo" className="h-[18px] w-[18px]" />
        {tr.toolbar.undo}
      </button>
      <button type="button" onClick={onClear} disabled={!hasStart} className={button}>
        {tr.phone.clearStart}
      </button>
      <button type="button" onClick={onDone} className="h-11 rounded-[10px] bg-ink px-4 text-sm font-semibold text-on-ink shadow-sm active:brightness-125">
        {tr.phone.done}
      </button>
    </div>
  );
}
