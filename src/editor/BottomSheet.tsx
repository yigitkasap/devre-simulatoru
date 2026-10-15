// Telefonda tek alt sayfa (tasarım: N01 → Telefon, DS-Bilesen → alt sayfa). Konumlar: peek (≈ 180 px),
// yarım (içerik kadar, en çok ekranın yarısı; parça sayfasında biraz daha fazla) ve tam (Cihazlar ve
// parça ekleme; üstte 112 px devre şeridi kalır). Tutamaca dokunmak bir sonraki konuma geçirir.
// Tutamaçtan ya da başlık satırından çekince sayfa parmağı izler, bırakınca en yakın konuma oturur
// (en küçüğün de altına çekilirse kapanır). Sayfanın yüksekliği dışarı bildirilir: tuval kalan alana
// sığar (çekerken bildirilmez, tuval her karede yeniden sığmasın). İçerik kendi içinde kayar.

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { tr } from '../i18n/tr';
import { Icon } from './icons';

export type SheetSize = 'peek' | 'half' | 'full';

/** Tam boyda sayfanın üstünde kalan devre şeridi (px). */
export const SHEET_FULL_TOP = 112;
export const PEEK_HEIGHT = 214;
/** Kısa ekranda (375×667; S01) küçük sayfa. */
const PEEK_HEIGHT_SMALL = 164;
const DRAG_PX = 28;
/** Bu kadar çekilince en yakın konum değişmese de bir sonraki konuma geçilir. */
const FLICK_PX = 40;
/** Parmak bu kadar oynamadan çekme başlamaz (dokunma ile ayrılsın). */
const DRAG_START_PX = 6;

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
  /** Yarım konumda pencere yüksekliğinin en çok bu kadarı (varsayılan 0,5). */
  readonly halfRatio?: number;
  readonly children: ReactNode;
}

interface SheetDrag {
  readonly id: number;
  readonly y: number;
  /** Çekme başladığındaki yükseklik. */
  readonly height: number;
  moved: boolean;
}

export function BottomSheet({
  size,
  sizes,
  onSize,
  onClose,
  label,
  role = 'region',
  areaHeight,
  onHeight,
  tone = 'panel',
  dimmed = false,
  halfRatio = 0.5,
  children,
}: BottomSheetProps) {
  const ref = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<SheetDrag | null>(null);
  const dragged = useRef(false);
  /** Çekerken sayfanın yüksekliği (parmağı izler); bırakınca null. */
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const onHeightRef = useRef(onHeight);
  onHeightRef.current = onHeight;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    onHeightRef.current(el.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      if (drag.current?.moved) return;
      onHeightRef.current(entries[0]?.target.getBoundingClientRect().height ?? 0);
    });
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

  // Yarım: en çok pencerenin yarısı (parça sayfasında biraz fazlası); tuvale en az 120 px kalsın.
  const halfMax = Math.max(PEEK_HEIGHT, Math.min(Math.round(window.innerHeight * halfRatio), areaHeight - 120));
  const fullHeight = Math.max(PEEK_HEIGHT, areaHeight - SHEET_FULL_TOP);
  const peekHeight = Math.min(areaHeight < 600 ? PEEK_HEIGHT_SMALL : PEEK_HEIGHT, areaHeight - 80);
  const heightOf = (s: SheetSize) => (s === 'full' ? fullHeight : s === 'peek' ? peekHeight : halfMax);
  const style =
    dragHeight !== null
      ? { height: dragHeight }
      : size === 'full'
        ? { height: fullHeight }
        : size === 'peek'
          ? { height: peekHeight }
          : { maxHeight: halfMax };

  // --- Çekme: tutamaç ya da başlık satırı ([data-sheet-grab]); başlıktaki öbür düğmeler hariç ----
  const grabbable = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    const button = target.closest('button');
    return button === handleRef.current || (button === null && target.closest('[data-sheet-grab]') !== null);
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!ref.current || !grabbable(e.target)) return;
    drag.current = { id: e.pointerId, y: e.clientY, height: ref.current.getBoundingClientRect().height, moved: false };
    dragged.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_START_PX) return;
      d.moved = true;
      // Yakalama ancak çekme başlayınca: dokunma, tutamacın tıklamasını bozmasın.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const heights = sizes.map(heightOf);
    const top = Math.max(...heights);
    const bottom = Math.min(Math.min(...heights), 120);
    setDragHeight(Math.min(top, Math.max(bottom, d.height - dy)));
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragHeight(null);
    if (!d.moved) return;
    dragged.current = true;
    const report = () => requestAnimationFrame(() => ref.current && onHeightRef.current(ref.current.getBoundingClientRect().height));
    const dy = e.clientY - d.y;
    if (e.type === 'pointercancel' || Math.abs(dy) < DRAG_PX) {
      // Konum değişmedi: tuval, sayfanın eski yüksekliğine göre yeniden sığsın.
      report();
      return;
    }
    const target = d.height - dy;
    if (onClose && target < Math.min(...sizes.map(heightOf)) - 60) {
      onClose();
      return;
    }
    let nearest = sizes[0]!;
    for (const s of sizes) if (Math.abs(heightOf(s) - target) < Math.abs(heightOf(nearest) - target)) nearest = s;
    if (nearest !== size) onSize(nearest);
    else if (Math.abs(dy) >= FLICK_PX) {
      const next = index + (dy < 0 ? 1 : -1);
      if (next >= 0 && next < sizes.length) onSize(sizes[next]!);
      else if (next < 0) onClose?.();
    }
    report();
  };

  return (
    <section
      ref={ref}
      role={role}
      aria-label={label}
      className={`sheet-in absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-xl shadow-[0_-4px_18px_rgba(29,39,51,0.14)] ${
        tone === 'rack' ? 'bg-rack' : 'bg-panel'
      } ${dimmed ? 'opacity-25' : ''}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`${tr.phone.sheetHandle} (${tr.phone.sheetSizes[size] ?? size})`}
        onClick={() => {
          // Çekme hareketinden sonra gelen tıklama ikinci kez adım attırmasın.
          if (dragged.current) dragged.current = false;
          else step(1);
        }}
        className="flex h-11 w-full shrink-0 touch-none items-center justify-center rounded-t-xl"
      >
        <i className={`block h-[5px] w-9 rounded-[3px] ${tone === 'rack' ? 'bg-muted' : 'bg-line-2'}`} aria-hidden="true" />
      </button>
      {children}
    </section>
  );
}

/** Alt sayfanın başlık satırı: başlık (ya da verilen içerik) ve kapat düğmesi. Tutamaç gibi çekilir. */
export function SheetHeader({ title, onClose, closeLabel, children }: { title?: string; onClose?: () => void; closeLabel?: string; children?: ReactNode }) {
  return (
    <div data-sheet-grab="" className="flex shrink-0 touch-none items-center gap-2 pr-2 pl-4">
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
