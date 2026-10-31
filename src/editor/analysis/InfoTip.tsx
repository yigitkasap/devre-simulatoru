// "ⓘ" ile açılan ipucu (Analiz → Bode): uzun açıklamalar sol sütunda yer kaplamasın. Masaüstünde
// düğmenin üstünde yüzen kutu: grafiklerin dışında kalır, eksen yazılarını örtmez (üstte yer yoksa
// pencerenin sağ üstünde, düğmenin altında). Sabit konumlu: kaydırılabilir sütunlar kesmesin. Telefonda
// ekranın altından açılan küçük sayfa: yalnızca metnin yüksekliği kadar, grafikleri aşağı itmez
// (analiz düzeltmeleri, ikinci tur). Dışarı dokununca, Esc ile ya da Kapat ile kapanır.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../icons';

export function InfoTip({
  label,
  closeLabel,
  children,
  sheet = false,
  touch = false,
}: {
  label: string;
  closeLabel: string;
  children: ReactNode;
  sheet?: boolean;
  touch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    if (!sheet) {
      window.addEventListener('resize', close);
      // Kaydırılan bir sütun kutuyu düğmeden ayırmasın.
      window.addEventListener('scroll', close, true);
    }
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, sheet]);
  // Yüzen kutunun yeri: düğmenin üstünde, sağ kenarı düğmeyle hizalı (grafikler düğmenin altında
  // başlar); üstte yer yoksa pencerenin sağ üstünde, düğmenin altında.
  useLayoutEffect(() => {
    if (!open || sheet) return;
    const b = button.current?.getBoundingClientRect();
    const p = panel.current?.getBoundingClientRect();
    if (!b || !p) return;
    const above = b.top - 6 - p.height;
    if (above >= 8) setPos({ left: Math.max(8, Math.min(b.right - p.width, window.innerWidth - p.width - 8)), top: above });
    else setPos({ left: Math.max(8, window.innerWidth - p.width - 8), top: b.bottom + 6 });
  }, [open, sheet]);
  const closeAndFocus = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setPos(null);
          setOpen((o) => !o);
        }}
        className={`flex shrink-0 items-center justify-center rounded-full text-muted hover:bg-panel-2 hover:text-ink ${open ? 'bg-accent-soft text-accent-ink' : ''} ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}
      >
        <Icon name="info" className="h-4 w-4" />
      </button>
      {open &&
        (sheet ? (
          // Telefon: alt sayfa (body'de; telefondaki Analiz sayfasının kaydırması ve kırpması etkilemesin).
          createPortal(
            <div
              ref={panel}
              id={id}
              role="note"
              aria-label={label}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-1 rounded-t-xl border-t border-line bg-panel px-4 pt-1 pb-[max(16px,env(safe-area-inset-bottom))] text-small leading-snug whitespace-normal text-ink-2 shadow-[0_-4px_18px_rgba(29,39,51,0.14)]"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 font-semibold text-ink">{label}</span>
                <button
                  type="button"
                  aria-label={closeLabel}
                  onClick={closeAndFocus}
                  className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-panel-2 hover:text-ink"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </span>
              {children}
            </div>,
            document.body,
          )
        ) : (
          <div
            ref={panel}
            id={id}
            role="note"
            aria-label={label}
            className="fixed z-50 w-[300px] rounded-xl border border-line bg-panel px-3.5 py-3 text-label leading-snug whitespace-normal text-ink-2 shadow-lg"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
          >
            {children}
          </div>
        ))}
    </>
  );
}
