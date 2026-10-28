// İpucu metni ("**kalın** ve [[tuş]]") ve klavye tuşu kutusu: tuvalin bilgi kartlarında, kısa turda,
// yardımda ve kablo bağlamanın durum satırında.

import { Fragment } from 'react';

/** Klavye tuşu kutusu. */
export function Kbd({ children, size = 'md' }: { children: string; size?: 'sm' | 'md' }) {
  return (
    <kbd
      className={`inline-block rounded-xs border border-b-2 border-line-2 bg-panel font-mono ${
        size === 'sm' ? 'px-1 text-[11px] leading-4 text-muted' : 'px-[5px] text-[11.5px] leading-[18px] text-ink'
      }`}
    >
      {children}
    </kbd>
  );
}

/** "**kalın** ve [[tuş]]" biçimli ipucu metni. */
export function HintText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**')) return <b key={i} className="font-semibold">{part.slice(2, -2)}</b>;
        if (part.startsWith('[[')) return <Kbd key={i}>{part.slice(2, -2)}</Kbd>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
