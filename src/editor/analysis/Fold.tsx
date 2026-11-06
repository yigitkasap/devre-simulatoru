// Telefonda grafiğin altındaki katlı ayarlar (analiz v2): başlığa dokununca açılır, kapanır.

import { useId, useState, type ReactNode } from 'react';
import { Icon } from '../icons';

export function Fold({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  return (
    <div className="flex flex-col rounded-xl border border-line">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex h-11 items-center gap-2 px-3 text-left text-small font-semibold">
        <Icon name={open ? 'chevronDown' : 'chevron'} className="h-4 w-4 shrink-0 text-muted" />
        {title}
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-3 border-t border-line p-3">
          {children}
        </div>
      )}
    </div>
  );
}
