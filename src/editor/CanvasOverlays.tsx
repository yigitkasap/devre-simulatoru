// Tuvalin üzerinde duran HTML katmanları: V/I/P bilgi kutusu, sağ tık menüsü, yanmış LED balonu.

import { useEffect, useRef } from 'react';
import { tr } from '../i18n/tr';
import type { Readout } from './readouts';
import { Rich } from './Rich';

/** Kutunun kapsayıcıdan taşmaması için konumu ayarlar (imlecin sağına, sığmazsa soluna). */
function place(x: number, y: number, width: number, height: number, area: { width: number; height: number }, gap = 14) {
  let left = x + gap;
  if (left + width > area.width - 4) left = Math.max(4, x - gap - width);
  let top = y + gap;
  if (top + height > area.height - 4) top = Math.max(4, area.height - height - 4);
  return { left, top };
}

export function ReadoutBox({
  readout,
  x,
  y,
  area,
}: {
  readout: Readout;
  x: number;
  y: number;
  area: { width: number; height: number };
}) {
  const width = 248;
  const height = 40 + readout.rows.length * 18 + (readout.note ? 40 : 0);
  const pos = place(x, y, width, height, area);
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border border-line bg-panel/95 px-3 py-2 text-xs shadow-lg"
      style={{ left: pos.left, top: pos.top, width }}
      role="tooltip"
    >
      <p className="mb-1 font-semibold">{readout.title}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        {readout.rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted">
              <Rich text={row.label} />
            </dt>
            <dd className="text-right font-medium tabular">{row.value}</dd>
          </div>
        ))}
      </dl>
      {readout.note && (
        <p className="mt-1.5 border-t border-line pt-1.5 leading-snug text-ink/85 tabular">
          <Rich text={readout.note} />
        </p>
      )}
    </div>
  );
}

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly tone?: 'danger' | 'accent';
}

export function ContextMenu({
  x,
  y,
  items,
  area,
  onClose,
}: {
  x: number;
  y: number;
  items: readonly MenuItem[];
  area: { width: number; height: number };
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
  const width = 176;
  const pos = place(x, y, width, items.length * 32 + 8, area, 2);
  return (
    <div
      ref={ref}
      role="menu"
      className="absolute z-30 rounded-lg border border-line bg-panel py-1 text-sm shadow-xl"
      style={{ left: pos.left, top: pos.top, width }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={`block w-full px-3 py-1.5 text-left hover:bg-app focus:bg-app focus:outline-none ${
            item.tone === 'danger' ? 'text-danger' : item.tone === 'accent' ? 'font-medium text-accent' : ''
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Yanmış LED'in yanında çıkan açıklama balonu. */
export function BurnBalloon({
  title,
  detail,
  x,
  y,
  flip,
  onRepair,
  onClose,
}: {
  title: string;
  detail: string;
  x: number;
  y: number;
  /** Sağda yer yoksa balon parçanın soluna açılır. */
  flip: boolean;
  onRepair: () => void;
  onClose: () => void;
}) {
  const width = 272;
  return (
    <div
      className="absolute z-10 rounded-lg border border-[#f2c9c5] bg-[#fff6f5] p-3 text-xs shadow-lg"
      style={{ left: flip ? x - width : x, top: y, width }}
      role="alert"
    >
      <span
        className={`absolute top-4 h-3 w-3 rotate-45 border-[#f2c9c5] bg-[#fff6f5] ${
          flip ? '-right-1.5 border-t border-r' : '-left-1.5 border-b border-l'
        }`}
        aria-hidden="true"
      />
      <p className="font-semibold text-danger">{title}</p>
      <p className="mt-1 leading-snug text-ink">
        <Rich text={detail} />
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-muted hover:bg-white">
          {tr.balloon.close}
        </button>
        <button type="button" onClick={onRepair} className="rounded bg-danger px-2.5 py-1 font-medium text-white hover:brightness-110">
          {tr.balloon.repair}
        </button>
      </div>
    </div>
  );
}
