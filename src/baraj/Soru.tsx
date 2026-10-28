// Soru: "Tahmin et" sorusu ve cevabı. Kapalı açılır; cevap yalnızca "Cevabı göster" ile açılır
// (öğretmen ne zaman açılacağına karar verir), açıkken "Cevabı gizle". Masaüstü ve tablette başlığın
// altında bir şerit, telefonda alt sayfa (sahne ve kumanda açık kalır).

import { useEffect, useRef } from 'react';
import { tr } from '../i18n/tr';
import { Icon } from '../editor/icons';
import { Rich } from '../editor/Rich';

export interface SoruProps {
  readonly question: string;
  readonly answer: string;
  readonly revealed: boolean;
  readonly onReveal: (revealed: boolean) => void;
  readonly onClose: () => void;
  readonly variant: 'strip' | 'sheet';
  /** Projeksiyon: yazılar büyük. */
  readonly big?: boolean;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={tr.baraj.soru.close}
      title={tr.baraj.soru.close}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-panel-2"
    >
      <Icon name="close" />
    </button>
  );
}

export function Soru({ question, answer, revealed, onReveal, onClose, variant, big = false }: SoruProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.contains(document.activeElement)) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const answerBox = revealed ? (
    <div role="status" className="flex min-w-0 flex-1 flex-col gap-1 overflow-auto overscroll-contain rounded-[10px] border border-ok-line bg-ok-soft px-4 pt-2.5 pb-3">
      <div className="flex h-[22px] items-center">
        <span className="text-[12.5px] font-semibold text-ok">{tr.baraj.soru.answer}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => onReveal(false)} className="-mr-2 inline-flex h-11 items-center rounded-md px-2 text-small font-medium text-ok hover:bg-ok-line/40">
          {tr.baraj.soru.hide}
        </button>
      </div>
      <span className={big ? 'text-[17px] leading-normal' : 'text-[15px] leading-[1.5]'}>
        <Rich text={answer} />
      </span>
    </div>
  ) : null;

  if (variant === 'sheet') {
    return (
      <section
        ref={ref}
        role="dialog"
        aria-label={tr.baraj.soru.title}
        className="absolute inset-x-0 -top-2 bottom-0 z-20 flex flex-col overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line-2 bg-panel px-4 pb-3.5 shadow-[0_-6px_24px_rgba(29,39,51,.18)]"
      >
        <span aria-hidden="true" className="mx-auto mt-2 mb-1 h-[5px] w-10 shrink-0 rounded-full bg-line-2" />
        <div className="flex items-center">
          <span className="text-small font-semibold text-warn">{tr.baraj.soru.predict}</span>
          <span className="flex-1" />
          <span className="-mr-2">
            <CloseButton onClose={onClose} />
          </span>
        </div>
        <p className="m-0 text-[17px] leading-[1.45]">
          <Rich text={question} />
        </p>
        <div className="mt-auto flex flex-col pt-3">
          {revealed ? (
            answerBox
          ) : (
            <button
              type="button"
              onClick={() => onReveal(true)}
              className="h-12 w-full shrink-0 rounded-md border border-line-2 bg-panel text-[16px] font-semibold hover:bg-panel-2"
            >
              {tr.baraj.soru.show}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} aria-label={tr.baraj.soru.title} className="flex max-h-[34vh] shrink-0 gap-3 border-b border-line bg-panel-2 p-3">
      <div className="flex w-[500px] max-w-[42%] shrink-0 flex-col gap-1.5 overflow-auto rounded-[10px] border border-warn-line bg-warn-soft px-4 pt-2.5 pb-3">
        <span className="text-[12.5px] leading-[22px] font-semibold text-warn">{tr.baraj.soru.predict}</span>
        <span className={big ? 'text-[19px] leading-[1.45]' : 'text-[17px] leading-[1.45]'}>
          <Rich text={question} />
        </span>
      </div>
      {answerBox ?? (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-[10px] border border-dashed border-line-2 bg-panel">
          <button type="button" onClick={() => onReveal(true)} className="h-11 rounded-md border border-line-2 bg-panel px-4 text-body font-semibold hover:bg-panel-2">
            {tr.baraj.soru.show}
          </button>
        </div>
      )}
      <CloseButton onClose={onClose} />
    </section>
  );
}
