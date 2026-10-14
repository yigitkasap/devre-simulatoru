// Kısa bildirim (ör. "Örnek yüklendi."). Birkaç saniye sonra kendiliğinden kaybolur. Geri alınabilir
// işlemlerde (örnek, yeni devre, içe aktarma, silme) yanında Geri al düğmesi olur (N01, N03: 5 s).

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface ToastMessage {
  readonly text: string;
  readonly tone: 'info' | 'error';
  readonly action?: ToastAction;
  /** Aynı metin art arda gelirse de yeniden gösterilsin diye. */
  readonly id: number;
}

const DURATION_MS = 4000;
const ACTION_DURATION_MS = 5000;

export function useToast(): [ToastMessage | null, (text: string, tone?: ToastMessage['tone'], action?: ToastAction) => void, () => void] {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const counter = useRef(0);
  const show = useCallback((text: string, tone: ToastMessage['tone'] = 'info', action?: ToastAction) => {
    counter.current += 1;
    setToast({ text, tone, id: counter.current, ...(action ? { action } : {}) });
  }, []);
  const hide = useCallback(() => setToast(null), []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), toast.action ? ACTION_DURATION_MS : DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return [toast, show, hide];
}

/** `offset`: alttan uzaklık (px); telefonda alt çubuğun ve alt sayfanın üstünde. */
export function Toast({ toast, offset = 112, onDone }: { toast: ToastMessage | null; offset?: number; onDone?: () => void }) {
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      style={{ bottom: `calc(${Math.round(offset)}px + env(safe-area-inset-bottom))` }}
      className={`fixed left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg py-2 pl-4 text-sm shadow-lg ${
        toast.action ? 'pr-1.5' : 'pointer-events-none pr-4'
      } ${toast.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-white'}`}
    >
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onDone?.();
          }}
          className="h-9 shrink-0 rounded-md px-3 font-semibold text-[#9cc3ff] hover:bg-white/10"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
