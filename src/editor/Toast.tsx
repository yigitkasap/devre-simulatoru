// Kısa bildirim (ör. "Örnek yüklendi"). Birkaç saniye sonra kendiliğinden kaybolur.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastMessage {
  readonly text: string;
  readonly tone: 'info' | 'error';
  /** Aynı metin art arda gelirse de yeniden gösterilsin diye. */
  readonly id: number;
}

const DURATION_MS = 4000;

export function useToast(): [ToastMessage | null, (text: string, tone?: ToastMessage['tone']) => void] {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const counter = useRef(0);
  const show = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    counter.current += 1;
    setToast({ text, tone, id: counter.current });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return [toast, show];
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-none fixed bottom-28 left-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${
        toast.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-white'
      }`}
    >
      {toast.text}
    </div>
  );
}
