// Tuvalin altındaki ipucu şeridi (28 px; tasarım: M01–M07). Tuvalin üstüne binmez. Metin, duruma
// göre (yerleştirme, kablo, seçim, simülasyon) değişir; tuşlar küçük tuş kutusu olarak gösterilir.

import { Fragment } from 'react';
import { tr } from '../i18n/tr';
import type { CanvasHint } from './Canvas';

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

type Tone = 'neutral' | 'ok' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-panel-2 text-muted [&_b]:text-ink',
  ok: 'border-ok-line bg-ok-soft text-ok-ink',
  accent: 'border-accent-line bg-accent-soft text-accent-ink',
};

function hintText(hint: CanvasHint): { text: string; tone: Tone } {
  switch (hint.kind) {
    case 'simulating':
      return { text: tr.hints.simulating, tone: 'ok' };
    case 'wiring':
      return { text: tr.hints.wiring, tone: 'accent' };
    case 'wireTool':
      return { text: tr.hints.wireIdle, tone: 'neutral' };
    case 'place':
      return { text: tr.hints.place(tr.devices.names[hint.type]), tone: 'neutral' };
    case 'selected':
      return { text: tr.hints.selected(hint.count), tone: 'neutral' };
    case 'empty':
      return { text: tr.hints.empty, tone: 'neutral' };
    default:
      return { text: tr.hints.select, tone: 'neutral' };
  }
}

export function HintStrip({ hint }: { hint: CanvasHint }) {
  const { text, tone } = hintText(hint);
  return (
    <div
      className={`flex h-7 shrink-0 items-center justify-between gap-3 overflow-hidden border-t px-3 text-small whitespace-nowrap max-desk:hidden ${TONES[tone]}`}
    >
      <p className="min-w-0 truncate">
        <HintText text={text} />
      </p>
    </div>
  );
}
