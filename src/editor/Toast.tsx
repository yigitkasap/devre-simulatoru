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

/** Bildirimi gösterir; bildirimin kimliğini döndürür (yalnızca o bildirimi kapatmak için: hideToast(id)). */
export function useToast(): [ToastMessage | null, (text: string, tone?: ToastMessage['tone'], action?: ToastAction) => number, (id?: number) => void] {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const counter = useRef(0);
  const show = useCallback((text: string, tone: ToastMessage['tone'] = 'info', action?: ToastAction) => {
    counter.current += 1;
    setToast({ text, tone, id: counter.current, ...(action ? { action } : {}) });
    return counter.current;
  }, []);
  /** Bildirimi kapatır; `id` verilirse yalnızca hâlâ o bildirim gösteriliyorsa. */
  const hide = useCallback((id?: number) => setToast((t) => (id === undefined || t?.id === id ? null : t)), []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), toast.action ? ACTION_DURATION_MS : DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return [toast, show, hide];
}

/** Bildirimle alt sayfanın üst kenarı arasındaki boşluk (px). */
const SHEET_GAP = 12;
/** Açık alt sayfayı arama aralığı (ms): sayfa bildirim görünürken açılabilir, kapanabilir ya da kayarak gelir. */
const SHEET_POLL_MS = 100;

/**
 * Telefonda açık alt sayfaların ([data-sheet]: alttan açılan sayfa, menü, not) en üstteki kenarı (px, görünümün
 * üstünden); açık sayfa yoksa null. Yalnızca bildirim görünürken bakılır; sayfa yokken (masaüstü) yerleşim
 * hesaplatılmaz.
 */
function useSheetTop(active: boolean): number | null {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    if (!active) {
      setTop(null);
      return undefined;
    }
    const measure = () => {
      let edge: number | null = null;
      for (const el of document.querySelectorAll<HTMLElement>('[data-sheet]')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < window.innerHeight) edge = edge === null ? r.top : Math.min(edge, r.top);
      }
      const value = edge === null ? null : Math.round(edge);
      setTop((old) => (old === value ? old : value));
    };
    measure();
    const timer = window.setInterval(measure, SHEET_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active]);
  return top;
}

/**
 * `offset`: alttan uzaklık (px); telefonda alt çubuğun ve alt sayfanın üstünde. Genişlik içeriğe göre (w-max):
 * left: 50% ile kendiliğinden genişlik ekranın yarısında kalır, kısa bildirim de iki satıra bölünürdü.
 * `inline`: sayfanın akışında, bulunduğu sütunun altında (telefonda defterin altı, alttaki çubuğun hemen
 * üstü): içeriğin üstüne binmez, görünürken defter kısalır.
 * Alttan açılan bir sayfa ([data-sheet]) açıkken bildirim (inline olsa da) o sayfanın üst kenarının hemen üstünde
 * yüzer, sayfanın ve karartının üstünde: sayfanın yazısını örtmez, karartının arkasında da kalmaz.
 */
export function Toast({ toast, offset = 112, inline = false, onDone }: { toast: ToastMessage | null; offset?: number; inline?: boolean; onDone?: () => void }) {
  const sheetTop = useSheetTop(toast !== null);
  if (!toast) return null;
  const aboveSheet = sheetTop !== null;
  const floating = !inline || aboveSheet;
  const box = (
    <div
      key={toast.id}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      data-toast=""
      style={
        aboveSheet ? { top: `${sheetTop - SHEET_GAP}px` } : floating ? { bottom: `calc(${Math.round(offset)}px + env(safe-area-inset-bottom))` } : undefined
      }
      className={`${aboveSheet ? 'fixed left-1/2 z-[60] -translate-x-1/2 -translate-y-full ' : floating ? 'fixed left-1/2 z-50 -translate-x-1/2 ' : ''}flex w-max max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg pl-4 text-sm shadow-lg ${
        toast.action ? 'py-0.5 pr-1' : 'pointer-events-none py-2 pr-4'
      } ${toast.tone === 'error' ? 'bg-danger text-on-ink' : 'bg-ink text-on-ink'}`}
    >
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onDone?.();
          }}
          className="h-11 shrink-0 rounded-md px-3 font-semibold whitespace-nowrap text-on-ink-accent hover:bg-on-ink/10"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
  return !floating ? (
    <div data-toast-slot="" className="flex shrink-0 justify-center bg-panel px-4 pt-1.5 pb-2">
      {box}
    </div>
  ) : (
    box
  );
}
