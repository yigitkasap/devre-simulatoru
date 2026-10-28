// Tuvalin sağ altındaki görünüm düğmeleri (tasarım v3: D1–D3): uzaklaştır, yakınlaştır, sığdır ve 3B.
// Yalnızca masaüstünde ve tablette, şema görünümünde (3B'de Şema | 3B düğmesi sol üstte). Tam ekran üst
// çubukta. Tablette düğmeler 44 px'tir ve solda "Kablo bağla" durur (Kur kipinde; uçlar büyür, iki uca
// sırayla dokunulur); Bağla kipindeyken bu grubun yerini Geri al, Seçimi bırak ve Bitti alır.

import { tr } from '../i18n/tr';
import { Icon, type IconName } from './icons';

export function CanvasControls({
  onZoomOut,
  onZoomIn,
  onFit,
  on3d,
  touch = false,
  onConnect,
}: {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  on3d: () => void;
  touch?: boolean;
  /** Tablet, Kur kipi: "Kablo bağla". */
  onConnect?: () => void;
}) {
  const size = touch ? 'h-11 w-11' : 'h-9 w-9';
  const button = (icon: IconName, label: string, onClick: () => void, title = label) => (
    <button type="button" onClick={onClick} aria-label={label} title={title} className={`flex items-center justify-center rounded-md text-ink hover:bg-app ${size}`}>
      <Icon name={icon} />
    </button>
  );
  return (
    <div className="absolute right-4 bottom-4 z-10 flex items-center gap-2">
      {onConnect && (
        <button
          type="button"
          data-tour="canvas"
          onClick={onConnect}
          className="flex h-[52px] items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-semibold text-white shadow-sm active:brightness-110"
        >
          <Icon name="wire" className="h-[18px] w-[18px]" />
          {tr.phone.connectButton}
        </button>
      )}
      <div role="group" aria-label={tr.toolbar.view} className="flex items-center rounded-[10px] border border-line bg-panel p-[3px]">
        {button('minus', tr.toolbar.zoomOut, onZoomOut)}
        {button('plus', tr.toolbar.zoomIn, onZoomIn)}
        {button('fit', tr.toolbar.fit, onFit, tr.toolbar.fitTitle)}
        <button type="button" onClick={on3d} className={`ml-0.5 border-l border-line px-2.5 text-small font-medium hover:bg-app ${touch ? 'h-11' : 'h-9'}`}>
          {tr.bench.bench}
        </button>
      </div>
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
      <button type="button" onClick={onDone} className="h-11 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white shadow-sm active:brightness-125">
        {tr.phone.done}
      </button>
    </div>
  );
}
