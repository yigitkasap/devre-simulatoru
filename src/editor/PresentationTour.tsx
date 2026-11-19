// Sunum turu ("sunum-turu", 2026-11-19): sınıfta canlı anlatım için adım adım tanıtım. Her adımda gösterilen öğe
// yuvarlak köşeli bir çerçeve içinde durur, ekranın geri kalanı %70 kararır; çerçeve adımdan adıma yumuşakça kayar.
// Çerçevenin yanında kısa bir kart (başlık, en çok iki cümle, "3 / 15", Geri / İleri). Çerçevenin içi tıklanabilir
// kalır (canlı gösterim); karanlık alana tıklamak turu kapatmaz. Hedef bulunamazsa kart ortada, çerçevesiz durur.
// Başlatma: "…" menüsünde "Tanıtım turu" ya da adres ?tur=sunum. Eski kısa tur (Welcome.tsx) ayrıdır.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tr } from '../i18n/tr';

/** Adımın görünümü: hangi örnek açık, şema mı 3B mi, Örnekler penceresi açık mı. */
export interface PresentationScene {
  readonly example?: 'diyot-dc' | 'yarim-dalga';
  readonly view?: 'schematic' | 'bench';
  readonly examples?: boolean;
}

export interface PresentationStep {
  readonly title: string;
  readonly text: string;
  /** Gösterilen öğe(ler); null: ortada çerçevesiz kart. */
  readonly target: (() => Element[]) | null;
  readonly scene: PresentationScene;
}

/** Görünür (boyutu olan, ekranda) öğeler. */
function visible(els: Iterable<Element>): Element[] {
  const out: Element[] = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) continue;
    out.push(el);
  }
  return out;
}

const all = (selector: string) => visible(document.querySelectorAll(selector));
const first = (...selectors: string[]) => {
  for (const s of selectors) {
    const found = all(s);
    if (found.length > 0) return [found[0]!];
  }
  return [];
};
/** Metni `pattern`e uyan en küçük görünür öğe (`selector` içinde). */
function byText(selector: string, pattern: RegExp): Element[] {
  const found = all(selector).filter((el) => pattern.test(el.textContent ?? ''));
  found.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return ra.width * ra.height - rb.width * rb.height;
  });
  return found.slice(0, 1);
}

const t = tr.presentation;

export const PRESENTATION_STEPS: readonly PresentationStep[] = [
  { ...t.steps.welcome, target: null, scene: {} },
  { ...t.steps.examples, target: () => first('button[aria-label="Örnekler"]'), scene: { examples: false } },
  { ...t.steps.folder, target: () => all('[data-tour="folder"]'), scene: { examples: true } },
  { ...t.steps.schematic, target: () => first('svg[aria-label="Devre şeması"]'), scene: { example: 'diyot-dc', view: 'schematic' } },
  { ...t.steps.play, target: () => first('[data-tour="play"]'), scene: { example: 'diyot-dc', view: 'schematic' } },
  { ...t.steps.supply, target: () => first('[aria-label^="PS1 ·"]', '[data-part-label="PS1"]'), scene: { example: 'diyot-dc', view: 'schematic' } },
  { ...t.steps.meters, target: () => [...first('[aria-label^="A1 ·"]'), ...first('[aria-label^="V1 ·"]')], scene: { example: 'diyot-dc', view: 'schematic' } },
  { ...t.steps.lab, target: () => first('[data-notebook="example"]'), scene: { example: 'diyot-dc', view: 'schematic' } },
  { ...t.steps.scope, target: () => first('[aria-label^="OSC1 ·"]'), scene: { example: 'yarim-dalga', view: 'schematic' } },
  { ...t.steps.view, target: () => first('[role=group][aria-label="Görünüm"]'), scene: { example: 'yarim-dalga', view: 'bench' } },
  { ...t.steps.bench, target: () => first('[data-tour="bench"]'), scene: { example: 'yarim-dalga', view: 'bench' } },
  { ...t.steps.board, target: () => [...first('button[aria-label="Tahtada kur"]'), ...byText('button', /^\s*Tahtada kur\s*$/)].slice(0, 1), scene: { example: 'yarim-dalga', view: 'bench' } },
  { ...t.steps.problems, target: () => first('[data-tour="problems"]'), scene: { example: 'yarim-dalga', view: 'schematic' } },
  { ...t.steps.analysis, target: () => first('button[aria-label="Analiz"]', 'button[aria-label^="Daha fazla"]'), scene: {} },
  { ...t.steps.end, target: null, scene: {} },
];

/** Çerçeve: öğe(ler)in kapladığı dikdörtgen, kenarında 8 px boşluk, ekranın içinde. */
const PAD = 8;
const CARD_W = 340;
const GAP = 12;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function frameOf(els: readonly Element[]): Box | null {
  if (els.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    x0 = Math.min(x0, r.left);
    y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right);
    y1 = Math.max(y1, r.bottom);
  }
  const W = window.innerWidth;
  const H = window.innerHeight;
  const x = Math.max(2, x0 - PAD);
  const y = Math.max(2, y0 - PAD);
  return { x, y, w: Math.min(W - 2, x1 + PAD) - x, h: Math.min(H - 2, y1 + PAD) - y };
}

/** Kartın yeri: çerçeveyi örtmeden ekranın içinde (telefonda altta ya da üstte, tam genişlik). */
export function cardPlace(frame: Box | null, card: { w: number; h: number }, screen: { w: number; h: number }, phone: boolean): { x: number; y: number } {
  const margin = 12;
  if (phone) {
    const w = screen.w - 2 * margin;
    const bottom = screen.h - card.h - margin;
    if (!frame) return { x: margin, y: bottom };
    // Altta yer varsa altta; çerçeve alttaysa üstte.
    if (frame.y + frame.h + GAP <= bottom) return { x: margin, y: bottom };
    if (frame.y - GAP - card.h >= margin) return { x: margin, y: margin };
    // Çerçeve neredeyse bütün ekransa (şema, 3B sahne) kart altta, öğenin üstünde durur.
    return { x: margin, y: w > 0 && frame.y + frame.h / 2 > screen.h * 0.6 ? margin : bottom };
  }
  if (!frame) return { x: (screen.w - card.w) / 2, y: (screen.h - card.h) / 2 };
  const clampY = (y: number) => Math.max(margin, Math.min(screen.h - card.h - margin, y));
  const clampX = (x: number) => Math.max(margin, Math.min(screen.w - card.w - margin, x));
  const candidates = [
    { x: frame.x + frame.w + GAP, y: clampY(frame.y) },
    { x: frame.x - GAP - card.w, y: clampY(frame.y) },
    { x: clampX(frame.x), y: frame.y + frame.h + GAP },
    { x: clampX(frame.x), y: frame.y - GAP - card.h },
  ];
  const fits = (c: { x: number; y: number }) => c.x >= margin && c.y >= margin && c.x + card.w <= screen.w - margin && c.y + card.h <= screen.h - margin;
  const overlaps = (c: { x: number; y: number }) => c.x < frame.x + frame.w && c.x + card.w > frame.x && c.y < frame.y + frame.h && c.y + card.h > frame.y;
  const ok = candidates.find((c) => fits(c) && !overlaps(c));
  if (ok) return ok;
  // Büyük öğe (şema, 3B sahne): kart öğenin içinde, sağ alt köşede (öğenin kendisi bu kadar geniş).
  return { x: clampX(frame.x + frame.w - card.w - GAP), y: clampY(frame.y + frame.h - card.h - GAP) };
}

export function PresentationTour({
  step,
  phone,
  onStep,
  onClose,
}: {
  step: number;
  phone: boolean;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const steps = PRESENTATION_STEPS;
  const current = steps[step]!;
  const [rawFrame, setFrame] = useState<Box | null>(null);
  const [screen, setScreen] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState({ w: CARD_W, h: 170 });
  const nextRef = useRef<HTMLButtonElement>(null);

  // Hedef her karede yeniden ölçülür (adım görünümü değiştirir, öğe sonradan belirebilir); bulunamazsa çerçeve yok.
  useLayoutEffect(() => {
    let raf = 0;
    const tick = () => {
      const els = current.target ? current.target() : [];
      const next = frameOf(els);
      setFrame((f) => (f && next && Math.abs(f.x - next.x) < 0.5 && Math.abs(f.y - next.y) < 0.5 && Math.abs(f.w - next.w) < 0.5 && Math.abs(f.h - next.h) < 0.5 ? f : next));
      setScreen((s) => (s.w === window.innerWidth && s.h === window.innerHeight ? s : { w: window.innerWidth, h: window.innerHeight }));
      const r = cardRef.current?.getBoundingClientRect();
      if (r) setCard((c) => (Math.abs(c.w - r.width) < 0.5 && Math.abs(c.h - r.height) < 0.5 ? c : { w: r.width, h: r.height }));
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [current]);

  // Klavye: Sağ ok / Boşluk / Enter ileri, Sol ok geri, Esc çık (uygulamanın kısayollarından önce).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));
      if (e.key === 'Escape') onClose();
      else if (!typing && (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter')) {
        if (step < steps.length - 1) onStep(step + 1);
        else onClose();
      } else if (!typing && e.key === 'ArrowLeft') {
        if (step > 0) onStep(step - 1);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, steps.length, onStep, onClose]);

  // Odak İleri düğmesinde: adımın açtığı pencere (Örnekler aramasına odaklanır) odağı alsa da klavye turu sürdürür.
  useEffect(() => {
    const focus = () => nextRef.current?.focus({ preventScroll: true });
    focus();
    const timer = window.setTimeout(focus, 250);
    return () => window.clearTimeout(timer);
  }, [step]);

  const W = screen.w;
  const H = screen.h;
  const place = cardPlace(rawFrame, card, { w: W, h: H }, phone);
  // Telefonda büyük öğe kartın altına uzanıyorsa çerçeve kartın kenarında kesilir (kart çerçeveyi örtmez).
  const frame = phone && rawFrame && place.y > rawFrame.y && rawFrame.y + rawFrame.h > place.y - GAP / 2
    ? { ...rawFrame, h: Math.max(24, place.y - GAP / 2 - rawFrame.y) }
    : phone && rawFrame && place.y < rawFrame.y && place.y + card.h + GAP / 2 > rawFrame.y
      ? { ...rawFrame, y: place.y + card.h + GAP / 2, h: Math.max(24, rawFrame.y + rawFrame.h - place.y - card.h - GAP / 2) }
      : rawFrame;
  const move = 'top 250ms ease, left 250ms ease, width 250ms ease, height 250ms ease';
  // Karartma: çerçevenin çevresindeki dört dikdörtgen (çerçevenin içi tıklanabilir kalır).
  const f = frame ?? { x: W / 2, y: H / 2, w: 0, h: 0 };
  const shade = 'pointer-events-auto absolute bg-black/70';
  const last = step === steps.length - 1;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" data-presentation-step={step + 1}>
      <div className={shade} style={{ left: 0, top: 0, width: W, height: f.y, transition: move }} />
      <div className={shade} style={{ left: 0, top: f.y + f.h, width: W, height: Math.max(0, H - f.y - f.h), transition: move }} />
      <div className={shade} style={{ left: 0, top: f.y, width: f.x, height: f.h, transition: move }} />
      <div className={shade} style={{ left: f.x + f.w, top: f.y, width: Math.max(0, W - f.x - f.w), height: f.h, transition: move }} />
      {frame && (
        <div
          data-presentation-frame=""
          className="absolute rounded-[10px] border border-white/80"
          style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, transition: move }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={current.title}
        data-presentation-card=""
        className="pointer-events-auto absolute flex flex-col gap-2 rounded-xl border border-line bg-panel p-4 text-ink shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        style={{ left: place.x, top: place.y, width: phone ? W - 24 : CARD_W, transition: 'top 250ms ease, left 250ms ease' }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-semibold leading-snug">{current.title}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-app">
            ×
          </button>
        </div>
        <p className="text-[15px] leading-relaxed text-ink-2">{current.text}</p>
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="font-mono text-small text-muted tabular" aria-label={t.counter(step + 1, steps.length)}>
            {step + 1} / {steps.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => onStep(step - 1)}
              className="h-11 rounded-lg border border-line px-4 text-[15px] font-medium hover:bg-app disabled:opacity-40"
            >
              {t.back}
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={() => (last ? onClose() : onStep(step + 1))}
              className="h-11 rounded-lg bg-accent px-4 text-[15px] font-semibold text-white hover:brightness-110"
            >
              {last ? t.finish : t.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
