// Açılır menüler (arayüz v4): devre menüsü, Daha fazla, hız. Görünüm: 12 px köşe, gölge, 6 px iç boşluk;
// öğeler 36 px tek satır, solda 16 px simge, sağda kısayol; açıklamalar title ipucunda. Dışarı tıklayınca
// ya da Esc ile kapanır (Esc odağı menünün düğmesine geri verir); ok tuşları, Home, End.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Icon, type IconName } from './icons';

/** Menünün açık / kapalı durumu, dışarı tıklama ve Esc; açılınca ilk (ya da seçili) öğeye odak. */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    // Belge sırasıyla ilk öğe: seçili radyo (Daha fazla'nın tema satırı) ya da ilk etkin öğe.
    menuRef.current?.querySelector<HTMLElement>('[role=menuitemradio][aria-checked=true], [role=radio][aria-checked=true], [role=menuitem]:not([aria-disabled=true])')?.focus();
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, rootRef, triggerRef, menuRef };
}

/** Menüde ok tuşlarıyla gezinme (yukarı / aşağı, Home / End) bütün öğeler arasında. */
export function menuKeys(e: ReactKeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true]), [role=menuitemradio]')];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const go = (i: number) => {
    e.preventDefault();
    items[(i + items.length) % items.length]?.focus();
  };
  if (e.key === 'ArrowDown') go(index + 1);
  else if (e.key === 'ArrowUp') go(index - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(items.length - 1);
}

/** Açılır panel: düğmenin altında, sağa ya da sola hizalı. */
export function MenuPanel({
  menuRef,
  label,
  align = 'left',
  width = 'w-72',
  children,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  label: string;
  align?: 'left' | 'right';
  width?: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={menuKeys}
      className={`absolute top-[calc(100%+6px)] z-50 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-panel p-1.5 shadow-lg ${width} ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  shortcut,
  title,
  disabled = false,
  touch = false,
  onSelect,
}: {
  icon?: IconName;
  label: string;
  shortcut?: string;
  /** Açıklama (ipucu). */
  title?: string;
  disabled?: boolean;
  touch?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onSelect()}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm whitespace-nowrap outline-none ${touch ? 'h-11' : 'h-9'} ${
        disabled ? 'text-muted' : 'text-ink hover:bg-panel-2 focus-visible:bg-panel-2'
      }`}
    >
      {icon && <Icon name={icon} className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && !touch && <kbd className="shrink-0 font-mono text-label text-muted">{shortcut}</kbd>}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-1 my-1.5 h-px bg-line" />;
}

/** Menünün başlığı (ör. "Devre"). */
export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-1 pb-1.5 text-label font-semibold text-muted">{children}</div>;
}
