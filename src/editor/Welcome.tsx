// İlk açılış (tasarım: M01, P01, N01): hoş geldin penceresi yalnızca ilk ziyarette açılır (Ayarlar →
// "İlk açılış turunu göster" ile yeniden). Kısa tur 4 adımdır: Parça ekle → Kablo çek → Oynat → İncele.
// Her adım gerçek eylemle ilerler; "İleri" ile atlanabilir. Tur kartı hedef öğenin yanında durur ve
// tuvali kapatmaz.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { ExampleId } from '../examples';
import { tr } from '../i18n/tr';
import { HintText } from './HintStrip';
import { Icon, type IconName } from './icons';

const WELCOME_KEY = 'devre-simulatoru:hosgeldin';

/** Hoş geldin penceresi daha önce kapatıldı mı? */
export function welcomeSeen(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true;
  }
}

export function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    // Depolama kapalı: pencere her açılışta gelebilir.
  }
}

const FIRST_TRY: ReadonlyArray<{ id: ExampleId; n: number }> = [
  { id: 'led-on-direnc', n: 1 },
  { id: 'gerilim-bolucu', n: 2 },
  { id: 'rc-dolma', n: 5 },
];

export interface WelcomeProps {
  readonly variant: 'desktop' | 'phone' | 'tablet';
  readonly onExamples: () => void;
  readonly onBlank: () => void;
  readonly onTour: () => void;
  readonly onExample: (id: ExampleId) => void;
  readonly onClose: () => void;
}

export function WelcomeDialog({ variant, onExamples, onBlank, onTour, onExample, onClose }: WelcomeProps) {
  const titleId = useId();
  const firstRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Odak "Örnekle başla"da (N01); Esc = Atla.
    firstRef.current?.focus({ preventScroll: true });
  }, []);
  const phone = variant === 'phone';
  const options: Array<{ icon: IconName; title: string; text: string; run: () => void }> = [
    { icon: 'book', title: tr.welcome.examples, text: tr.welcome.examplesText, run: onExamples },
    { icon: 'plus', title: tr.welcome.blank, text: variant === 'desktop' ? tr.welcome.blankText : tr.welcome.blankTextTouch, run: onBlank },
    { icon: 'help', title: tr.welcome.tour, text: tr.welcome.tourText, run: onTour },
  ];
  const body = (
    <>
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className={`font-semibold ${phone ? 'text-[21px]' : 'text-[24px]'}`}>
          {tr.welcome.title}
        </h2>
        <span className={`text-ink-2 ${phone ? 'text-sm' : 'text-[15px]'}`}>{tr.welcome.subtitle}</span>
      </div>
      <div className="flex flex-col gap-2">
        {options.map((o, i) => (
          <button
            key={o.title}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            onClick={o.run}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-left ${
              i === 0 ? 'border-2 border-accent bg-accent-soft/50' : 'border border-line hover:bg-panel-2'
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${i === 0 ? 'bg-accent text-white' : 'bg-app text-ink'}`}>
              <Icon name={o.icon} />
            </span>
            <span className="flex flex-col">
              <b className={`font-semibold ${i === 0 ? 'text-accent-ink' : ''}`}>{o.title}</b>
              <span className="text-small text-ink-2">{o.text}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-semibold text-muted">{tr.welcome.firstTry}</span>
        <div className="flex flex-wrap gap-1.5">
          {FIRST_TRY.map(({ id, n }) => (
            <button
              key={id}
              type="button"
              onClick={() => onExample(id)}
              className="flex h-11 items-center gap-2 rounded-full border border-line-2 bg-panel px-3 text-sm font-medium hover:bg-panel-2"
            >
              {!phone && <span className="font-mono text-label text-muted">{n}</span>}
              {tr.examples.texts[id].title}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-muted">{tr.welcome.reopen}</span>
        <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-lg px-4 text-[15px] font-medium text-muted hover:bg-app">
          {tr.welcome.skip}
        </button>
      </div>
    </>
  );
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
    if (e.key === 'Tab') {
      const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  if (phone) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="scrim-in absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
        <div
          ref={rootRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={onKeyDown}
          className="sheet-in absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-60px)] flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-xl bg-panel px-4 pt-5"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        >
          {body}
        </div>
      </div>
    );
  }
  return (
    <div className="scrim-in fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="flex max-h-[calc(100dvh-2rem)] w-[min(520px,100%)] flex-col gap-4 overflow-y-auto rounded-2xl bg-panel p-6 shadow-[0_16px_40px_rgba(29,39,51,0.2)]"
      >
        {body}
      </div>
    </div>
  );
}

// --- Kısa tur ----------------------------------------------------------------------------

export type TourStep = 0 | 1 | 2 | 3;
/** Adımların hedefleri (data-tour). */
const TARGETS = ['parts', 'canvas', 'play', 'inspect'] as const;

export function Tour({ step, variant, onNext, onClose }: { step: TourStep; variant: 'desktop' | 'phone' | 'tablet'; onNext: () => void; onClose: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 320, h: 160 });
  const target = TARGETS[step];
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      const next = el?.getBoundingClientRect() ?? null;
      setRect((r) =>
        r && next && Math.abs(r.x - next.x) < 1 && Math.abs(r.y - next.y) < 1 && Math.abs(r.width - next.width) < 1 && Math.abs(r.height - next.height) < 1 ? r : next,
      );
      frame = window.requestAnimationFrame(update);
    };
    update();
    return () => window.cancelAnimationFrame(frame);
  }, [target]);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCardSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [step, rect === null]);

  const texts = tr.tour.steps[step];
  const text = variant === 'desktop' ? texts.desktop : variant === 'phone' ? texts.phone : texts.tablet;
  // Kartın yeri: hedefin sağında, sığmazsa solunda, sonra altında ya da üstünde.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 12;
  let left = vw / 2 - cardSize.w / 2;
  let top = vh / 2 - cardSize.h / 2;
  if (rect) {
    // Tuval gibi büyük hedeflerde kart hedefin içinde, üst kenarda durur.
    const big = rect.width > vw * 0.5 && rect.height > vh * 0.4;
    if (big) {
      left = rect.left + rect.width / 2 - cardSize.w / 2;
      top = rect.top + 12;
    } else if (rect.right + gap + cardSize.w <= vw - 8) {
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - cardSize.h / 2;
    } else if (rect.left - gap - cardSize.w >= 8) {
      left = rect.left - gap - cardSize.w;
      top = rect.top + rect.height / 2 - cardSize.h / 2;
    } else if (rect.top - gap - cardSize.h >= 8) {
      left = rect.left + rect.width / 2 - cardSize.w / 2;
      top = rect.top - gap - cardSize.h;
    } else {
      left = rect.left + rect.width / 2 - cardSize.w / 2;
      top = rect.bottom + gap;
    }
  }
  if (variant === 'phone') {
    // Telefonda alt çubuk ve alt sayfa açık kalsın: kart üst şeridin hemen altında.
    left = vw / 2 - cardSize.w / 2;
    top = 60;
  }
  left = Math.max(8, Math.min(vw - cardSize.w - 8, left));
  top = Math.max(8, Math.min(vh - cardSize.h - 8, top));
  const last = step === 3;
  return (
    <>
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[55] rounded-xl border-[3px] border-accent shadow-[0_0_0_4px_rgba(31,111,235,0.18)]"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={tr.tour.label}
        aria-live="polite"
        className="fixed z-[56] flex w-[min(320px,calc(100vw-16px))] flex-col gap-2 rounded-xl border border-accent-line bg-panel p-4 shadow-[0_16px_40px_rgba(29,39,51,0.2)]"
        style={{ left, top }}
      >
        <div className="flex items-center justify-between">
          <span className="text-label font-semibold text-accent-ink">{tr.tour.step(step + 1, 4)}</span>
          <button type="button" onClick={onClose} aria-label={tr.tour.close} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-app">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <b className="text-base font-semibold">{texts.title}</b>
        <p className="text-sm leading-normal text-ink-2">
          <HintText text={text} />
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-11 rounded-lg px-3 text-sm font-medium text-muted hover:bg-app">
            {tr.tour.end}
          </button>
          <button type="button" onClick={last ? onClose : onNext} className="h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:brightness-110">
            {last ? tr.tour.finish : tr.tour.next}
          </button>
        </div>
      </div>
    </>
  );
}
