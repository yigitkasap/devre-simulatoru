// "ⓘ" ile açılan ipucu (Analiz → Bode): uzun açıklamalar sol sütunda yer kaplamasın. Masaüstünde
// düğmenin altında yüzen kutu (sabit konumlu: kaydırılabilir sütunlar kesmesin); dar görünümde (telefon
// alt sayfası) düğmenin altında akışın içinde açılır. Dışarı tıklayınca ya da Esc ile kapanır.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../icons';

export function InfoTip({ label, children, inline = false, touch = false }: { label: string; children: ReactNode; inline?: boolean; touch?: boolean }) {
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
    if (!inline) {
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
  }, [open, inline]);
  // Yüzen kutunun yeri: düğmenin altında, pencereye sığacak biçimde (altta yer yoksa üstünde).
  useLayoutEffect(() => {
    if (!open || inline) return;
    const b = button.current?.getBoundingClientRect();
    const p = panel.current?.getBoundingClientRect();
    if (!b || !p) return;
    const left = Math.max(8, Math.min(b.left, window.innerWidth - p.width - 8));
    const below = b.bottom + 6;
    const top = below + p.height > window.innerHeight - 8 ? Math.max(8, b.top - p.height - 6) : below;
    setPos({ left, top });
  }, [open, inline]);
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
      {open && (
        <div
          ref={panel}
          id={id}
          role="note"
          aria-label={label}
          className={
            inline
              ? 'basis-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-label leading-snug whitespace-normal text-ink-2'
              : 'fixed z-50 w-[300px] rounded-xl border border-line bg-panel px-3.5 py-3 text-label leading-snug whitespace-normal text-ink-2 shadow-lg'
          }
          style={inline ? undefined : { left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        >
          {children}
        </div>
      )}
    </>
  );
}
