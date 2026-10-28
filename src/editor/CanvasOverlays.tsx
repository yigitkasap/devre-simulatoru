// Tuvalin üzerinde duran HTML katmanları: sağ tık menüsü, yanmış LED balonu ve
// "devrede toprak yok" afişi (tasarım: M07a, M07b).

import { useEffect, useRef } from 'react';
import { tr } from '../i18n/tr';
import { Rich } from './Rich';

/** Kutunun kapsayıcıdan taşmaması için konumu ayarlar (imlecin sağına, sığmazsa soluna). */
function place(x: number, y: number, width: number, height: number, area: { width: number; height: number }, gap = 14) {
  let left = x + gap;
  if (left + width > area.width - 4) left = Math.max(4, x - gap - width);
  let top = y + gap;
  if (top + height > area.height - 4) top = Math.max(4, area.height - height - 4);
  return { left, top };
}

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly tone?: 'danger' | 'accent';
  /** Sağda gösterilen klavye kısayolu (R, F, Delete). */
  readonly shortcut?: string;
  /** Öncesine ayırıcı çizgi. */
  readonly separatorBefore?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  area,
  label,
  onClose,
}: {
  x: number;
  y: number;
  items: readonly MenuItem[];
  area: { width: number; height: number };
  /** Erişilebilir ad ("D1 menüsü"). */
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const width = 220;
  const pos = place(x, y, width, items.length * 38 + 16, area, 2);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="absolute z-30 rounded-[10px] border border-line bg-panel p-1 text-sm shadow-md"
      style={{ left: pos.left, top: pos.top, width }}
      onKeyDown={(e) => {
        const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')];
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        if (step === 0) return;
        e.preventDefault();
        buttons[(index + step + buttons.length) % buttons.length]?.focus();
      }}
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.separatorBefore && <div className="mx-1.5 my-1 h-px bg-line" aria-hidden="true" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={`flex h-9 w-full items-center justify-between rounded-md px-2.5 text-left outline-none hover:bg-panel-2 focus-visible:bg-panel-2 ${
              item.tone === 'danger'
                ? 'text-danger'
                : item.tone === 'accent'
                  ? 'bg-accent-soft font-semibold text-accent-ink hover:bg-accent-soft'
                  : 'text-ink'
            }`}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="font-mono text-label text-muted">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Yanmış LED'in yanında çıkan balon (M07a): parçayı ve kablolarını kapatmayacak yöne açılır. */
export function BurnBalloon({
  id,
  title,
  detail,
  x,
  y,
  flip,
  onRepair,
  onClose,
  onWhy,
}: {
  id: string;
  title: string;
  detail: string;
  x: number;
  y: number;
  /** Sağda yer yoksa balon parçanın soluna açılır. */
  flip: boolean;
  onRepair: () => void;
  onClose: () => void;
  /** "Neden?": Mesajlar sekmesinde ayrıntılı açıklama. */
  onWhy?: () => void;
}) {
  const width = 268;
  return (
    <div
      className="absolute z-10 flex flex-col gap-2 rounded-lg border border-danger-line bg-panel px-3.5 py-3 shadow-md"
      style={{ left: flip ? x - width : x, top: y, width }}
      role="alertdialog"
      aria-labelledby={`burn-${id}`}
    >
      <span
        className={`absolute top-4 h-3 w-3 rotate-45 border-danger-line bg-panel ${
          flip ? '-right-1.5 border-t border-r' : '-left-1.5 border-b border-l'
        }`}
        aria-hidden="true"
      />
      <b id={`burn-${id}`} className="text-sm font-semibold text-danger-ink">
        {title}
      </b>
      <span className="text-small leading-[1.45] text-ink">
        <Rich text={detail} />
      </span>
      <div className="flex gap-2">
        <button type="button" onClick={onRepair} className="h-9 rounded-md bg-ink px-3.5 text-small font-semibold text-on-ink hover:brightness-125">
          {tr.balloon.repair}
        </button>
        <button type="button" onClick={onClose} className="h-9 rounded-md border border-line-2 bg-panel px-3 text-small font-medium hover:bg-panel-2">
          {tr.balloon.close}
        </button>
        {onWhy && (
          <button type="button" onClick={onWhy} className="h-9 rounded-md px-2 text-small font-medium text-accent-ink hover:bg-accent-soft">
            {tr.balloon.why}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Sıfır noktası işareti: toprak yokken (ya da toprağa bağlı olmayan parçada) çözücünün seçtiği 0 V
 * referansı. Toprak sembolüyle karışmasın diye mavi bir "0 V" etiketi ve pinde halka. Dokununca ya da
 * tıklayınca kısa açıklama açılır (fareyle üstüne gelince ipucu da çıkar). Dokunmatikte hedef 44 px.
 */
export function ZeroMark({
  x,
  y,
  open,
  onToggle,
  detail,
}: {
  /** Pinin ekran konumu (px). */
  x: number;
  y: number;
  open: boolean;
  onToggle: () => void;
  detail: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute z-[5] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-info-ink bg-panel"
        style={{ left: x, top: y }}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={tr.zeroPoint.aria}
        aria-expanded={open}
        title={`${tr.zeroPoint.title}: ${detail}`}
        className="absolute z-[6] flex h-[18px] w-8 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-11"
        style={{ left: x + 5, top: y + 5 }}
      >
        <span className="rounded-full border border-info-line bg-info-soft px-1.5 font-mono text-[11px] leading-4 font-semibold whitespace-nowrap text-info-ink shadow-sm">
          {tr.zeroPoint.label}
        </span>
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute z-10 mt-7 flex w-[240px] flex-col gap-1 rounded-lg border border-info-line bg-panel px-3 py-2.5 shadow-md pointer-coarse:mt-[52px]"
          style={{ left: x + 8, top: y }}
        >
          <b className="text-small font-semibold text-info-ink">{tr.zeroPoint.title}</b>
          <span className="text-small leading-[1.45] text-ink">{detail}</span>
        </div>
      )}
    </>
  );
}
