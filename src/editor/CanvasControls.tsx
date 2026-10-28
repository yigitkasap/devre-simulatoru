// Tuvalin sağ altındaki görünüm düğmeleri (tasarım v3: D1–D3): uzaklaştır, yakınlaştır, sığdır ve 3B.
// Yalnızca masaüstünde, şema görünümünde (3B'de Şema | 3B düğmesi sol üstte). Tam ekran üst çubukta.

import { tr } from '../i18n/tr';
import { Icon, type IconName } from './icons';

export function CanvasControls({
  onZoomOut,
  onZoomIn,
  onFit,
  on3d,
}: {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  on3d: () => void;
}) {
  const button = (icon: IconName, label: string, onClick: () => void, title = label) => (
    <button type="button" onClick={onClick} aria-label={label} title={title} className="flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-app">
      <Icon name={icon} />
    </button>
  );
  return (
    <div role="group" aria-label={tr.toolbar.view} className="absolute right-4 bottom-4 z-10 flex items-center rounded-[10px] border border-line bg-panel p-[3px]">
      {button('minus', tr.toolbar.zoomOut, onZoomOut)}
      {button('plus', tr.toolbar.zoomIn, onZoomIn)}
      {button('fit', tr.toolbar.fit, onFit, tr.toolbar.fitTitle)}
      <button type="button" onClick={on3d} className="ml-0.5 h-9 border-l border-line px-2.5 text-small font-medium hover:bg-app">
        {tr.bench.bench}
      </button>
    </div>
  );
}
