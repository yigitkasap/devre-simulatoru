// Arduino'nun İnceleme bölümü: Seri ekran (Serial.print çıktısı) ve yüklü programın kodu.

import { useEffect, useRef, type ReactNode } from 'react';
import { programFlash, programSource } from '../arduino/programs';
import { tr } from '../i18n/tr';
import { formatNumber } from '../sim/units';
import type { Part } from '../model/types';
import type { SimFrame, SimStatus } from './useSimulation';

const t = tr.arduino;

/** Arduino kodu için yalın bir renklendirme: açıklama, metin, sayı, anahtar sözcük ve Arduino işlevleri. */
const TOKEN =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")|(\b\d+(?:\.\d+)?\b)|\b(void|int|bool|float|const|unsigned|long|char|for|if|else|while|return|true|false|HIGH|LOW|OUTPUT|INPUT|INPUT_PULLUP|A[0-5])\b|\b(setup|loop|pinMode|digitalWrite|digitalRead|analogWrite|analogRead|delay|millis|tone|noTone|map|log|Serial\.(?:begin|print|println))\b/g;

function highlight(source: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of source.matchAll(TOKEN)) {
    if (m.index > last) out.push(source.slice(last, m.index));
    const [text, comment, string, number, keyword] = m;
    const tone = comment ? 'text-muted italic' : string ? 'text-ok-ink' : number ? 'text-warn' : keyword ? 'font-semibold text-ink' : 'text-accent-ink';
    out.push(
      <span key={key++} className={tone}>
        {text}
      </span>,
    );
    last = m.index + text.length;
  }
  if (last < source.length) out.push(source.slice(last));
  return out;
}

export function ArduinoSection({ part, frame, status, compact = false }: { part: Part; frame: SimFrame | null; status: SimStatus; compact?: boolean }) {
  const program = String(part.props.program ?? '');
  const source = programSource(program);
  const serial = frame?.statuses.get(part.id)?.arduino?.serial ?? '';
  const logRef = useRef<HTMLPreElement>(null);

  // Seri ekran en son satırı gösterir (kullanıcı yukarı kaydırmadıysa).
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) el.scrollTop = el.scrollHeight;
  }, [serial]);

  const text = compact ? 'text-[13px]' : 'text-label';
  return (
    <>
      <section className="flex flex-col gap-1.5" aria-label={t.serial}>
        <span className="text-label font-semibold text-muted">{t.serial}</span>
        <pre
          ref={logRef}
          role="log"
          aria-live="off"
          className={`max-h-40 min-h-16 overflow-y-auto overscroll-contain rounded-md border border-line-2 bg-panel-2 px-2.5 py-2 font-mono ${text} leading-normal whitespace-pre-wrap text-ink`}
        >
          {serial || <span className="text-muted">{status === 'stopped' ? t.serialStopped : t.serialEmpty}</span>}
        </pre>
      </section>
      <section className="flex flex-col gap-1.5" aria-label={t.code}>
        <span className="text-label font-semibold text-muted">
          {t.code} · {t.flash(formatNumber(programFlash(program), 0))}
        </span>
        <pre className={`max-h-72 overflow-auto overscroll-contain rounded-md border border-line-2 bg-panel px-2.5 py-2 font-mono ${text} leading-normal text-ink-2`}>
          <code>{source ? highlight(source) : t.noProgram}</code>
        </pre>
        <span className="text-label leading-normal text-muted">{t.precompiled}</span>
      </section>
    </>
  );
}
