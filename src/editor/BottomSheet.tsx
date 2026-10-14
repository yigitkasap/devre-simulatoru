// Telefonda tek alt sayfa (tasarım: N01 → Telefon, DS-Bilesen → alt sayfa). Konumlar: peek (≈ 180 px),
// yarım (içerik kadar, en çok ekranın yarısı) ve tam (yalnızca Cihazlar; üstte 112 px devre şeridi
// kalır). Tutamaca dokunmak bir sonraki konuma geçirir; tutamaçtan yukarı/aşağı çekmek büyütür ya da
// küçültür. Sayfanın yüksekliği dışarı bildirilir: tuval kalan alana sığar. İçerik kendi içinde kayar.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { tr } from '../i18n/tr';
import { Icon } from './icons';

export type SheetSize = 'peek' | 'half' | 'full';

/** Tam boyda sayfanın üstünde kalan devre şeridi (px). */
export const SHEET_FULL_TOP = 112;
export const PEEK_HEIGHT = 200;
const DRAG_PX = 28;

export interface BottomSheetProps {
  readonly size: SheetSize;
  /** Tutamağın gezdiği konumlar (sırasıyla). */
  readonly sizes: readonly SheetSize[];
  readonly onSize: (size: SheetSize) => void;
  /** Tutamaçtan aşağı çekince en küçük konumdan da aşağıdaysa sayfa kapanır. */
  readonly onClose?: () => void;
  readonly label: string;
  readonly role?: 'region' | 'dialog' | 'alertdialog';
  /** Sayfanın içinde bulunduğu alanın yüksekliği (px). */
  readonly areaHeight: number;
  /** Sayfanın gerçek yüksekliği değişince. */
  readonly onHeight: (height: number) => void;
  /** Cihazlar: rafın gri zemini. */
  readonly tone?: 'panel' | 'rack';
  /** Parça sürüklenirken sayfa saydamlaşır (devre görünsün). */
  readonly dimmed?: boolean;
  readonly children: ReactNode;
}

export function BottomSheet({ size, sizes, onSize, onClose, label, role = 'region', areaHeight, onHeight, tone = 'panel', dimmed = false, children }: BottomSheetProps) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; y: number } | null>(null);
  const dragged = useRef(false);

  const onHeightRef = useRef(onHeight);
  onHeightRef.current = onHeight;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    onHeightRef.current(el.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => onHeightRef.current(entries[0]?.target.getBoundingClientRect().height ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => onHeightRef.current(0), []);

  const index = Math.max(0, sizes.indexOf(size));
  const step = (direction: 1 | -1) => {
    const next = index + direction;
    if (next >= sizes.length) onSize(sizes[0]!);
    else if (next < 0) onClose?.();
    else onSize(sizes[next]!);
  };

  // Yarım: en çok pencerenin yarısı; tuvale en az 120 px kalsın.
  const halfMax = Math.max(PEEK_HEIGHT, Math.min(Math.round(window.innerHeight * 0.5), areaHeight - 120));
  const style =
    size === 'full'
      ? { height: Math.max(PEEK_HEIGHT, areaHeight - SHEET_FULL_TOP) }
      : size === 'peek'
        ? { height: Math.min(PEEK_HEIGHT, areaHeight - 80) }
        : { maxHeight: halfMax };

  return (
    <section
      ref={ref}
      role={role}
      aria-label={label}
      className={`sheet-in absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-xl shadow-[0_-4px_18px_rgba(29,39,51,0.14)] ${
        tone === 'rack' ? 'bg-rack' : 'bg-panel'
      } ${dimmed ? 'opacity-25' : ''}`}
      style={style}
    >
      <button
        type="button"
        aria-label={`${tr.phone.sheetHandle} (${tr.phone.sheetSizes[size] ?? size})`}
        onClick={() => {
          // Çekme hareketinden sonra gelen tıklama ikinci kez adım attırmasın.
          if (dragged.current) dragged.current = false;
          else step(1);
        }}
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId, y: e.clientY };
          dragged.current = false;
        }}
        onPointerUp={(e) => {
          const start = drag.current;
          drag.current = null;
          if (!start || start.id !== e.pointerId) return;
          const dy = e.clientY - start.y;
          if (Math.abs(dy) < DRAG_PX) return;
          dragged.current = true;
          step(dy < 0 ? 1 : -1);
        }}
        className="flex h-[30px] w-full shrink-0 touch-none items-center justify-center rounded-t-xl"
      >
        <i className={`block h-[5px] w-9 rounded-[3px] ${tone === 'rack' ? 'bg-muted' : 'bg-line-2'}`} aria-hidden="true" />
      </button>
      {children}
    </section>
  );
}

/** Alt sayfanın başlık satırı: başlık (ya da verilen içerik) ve kapat düğmesi. */
export function SheetHeader({ title, onClose, closeLabel, children }: { title?: string; onClose?: () => void; closeLabel?: string; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 pr-2 pl-4">
      {children ?? <h2 className="min-w-0 flex-1 truncate text-[18px] font-semibold">{title}</h2>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel ?? tr.phone.close}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-muted active:bg-app"
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

/** Sayfanın kayan gövdesi. */
export function SheetBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4 ${className}`}>{children}</div>;
}
