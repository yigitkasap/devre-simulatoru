// Tuvalin üzerinde duran HTML katmanları: V/I/P bilgi kutusu, sağ tık menüsü, yanmış LED balonu ve
// "devrede toprak yok" afişi (tasarım: M07a, M07b).

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
        <button type="button" onClick={onRepair} className="h-9 rounded-md bg-ink px-3.5 text-small font-semibold text-white hover:brightness-125">
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

/** "Devrede toprak yok" afişi (M07b): Oynat'a basılınca simülasyon başlamadıysa tuvalin üstünde. */
export function NoGroundBanner({
  text,
  fixLabel,
  onFix,
  onDismiss,
}: {
  text: string;
  /** Tek tıkla düzeltme düğmesi; önerilecek yer yoksa null. */
  fixLabel: string | null;
  onFix: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="absolute top-4 left-1/2 z-20 flex w-[min(560px,calc(100%-24px))] -translate-x-1/2 items-start gap-3 rounded-lg border border-danger-line bg-panel px-3.5 py-3 shadow-md"
    >
      <svg width="22" height="22" viewBox="0 0 20 20" className="mt-px shrink-0" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="var(--color-danger)" />
        <path d="M10 5.5v5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="14.2" r="1.2" fill="white" />
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <b className="text-[15px] font-semibold">{tr.noGround.title}</b>
        <span className="text-small leading-normal text-ink-2">{text}</span>
        <div className="flex flex-wrap gap-2">
          {fixLabel && (
            <button type="button" onClick={onFix} className="h-9 rounded-md bg-accent px-3.5 text-small font-semibold text-white hover:brightness-110">
              {fixLabel}
            </button>
          )}
          <button type="button" onClick={onDismiss} className="h-9 rounded-md border border-line-2 bg-panel px-3 text-small font-medium hover:bg-panel-2">
            {tr.noGround.myself}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={tr.noGround.close}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}
