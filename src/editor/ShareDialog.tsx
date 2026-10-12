// Paylaşım bağlantısı penceresi: bağlantıyı gösterir ve panoya kopyalar.

import { useEffect, useId, useRef, useState } from 'react';
import { tr } from '../i18n/tr';
import { Icon } from './icons';

export function ShareDialog({ link, onClose }: { link: string; onClose: () => void }) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  /** Bağlantıyı seç (iOS Safari salt okunur alanda select() ile seçmiyor; aralık da verilir). */
  const selectLink = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
  };

  useEffect(() => {
    selectLink();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setState('copied');
    } catch {
      selectLink();
      setState('failed');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-[min(32rem,100%)] rounded-xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="flex items-center gap-2 font-semibold">
            <Icon name="share" className="h-4 w-4" />
            {tr.shareDialog.title}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-app" aria-label={tr.shareDialog.close}>
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm">
          <p className="text-muted">{tr.shareDialog.description}</p>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              readOnly
              value={link}
              onFocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
              className="min-w-0 flex-1 rounded-md border border-line bg-app px-3 py-1.5 font-mono text-xs"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
            >
              {state === 'copied' ? tr.shareDialog.copied : tr.shareDialog.copy}
            </button>
          </div>
          <p className="text-xs text-muted">
            {state === 'failed' ? tr.shareDialog.copyFailed : tr.shareDialog.length(link.length)}
          </p>
        </div>
      </div>
    </div>
  );
}
