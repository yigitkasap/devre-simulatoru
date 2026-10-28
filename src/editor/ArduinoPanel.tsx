// Arduino'nun İnceleme bölümü (tablet, telefon): Seri ekran (Serial.print çıktısı) ve yüklü programın
// kodu; masaüstünde defterin Arduino kartı (ArduinoCardBody).

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ARDUINO_PROGRAM_IDS, programFlash, programSource } from '../arduino/programs';
import { tr } from '../i18n/tr';
import { formatNumber, formatSI } from '../sim/units';
import { Icon } from './icons';
import { useTouchUi } from './touchUi';
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

// --- Defterdeki Arduino kartı (tasarım v3: D3) ------------------------------------------------

/** Çalışma anındaki pin numarası (D2…D13 = 2…13, A0…A5 = 14…19) → parçanın uç sırası. */
const partPinOf = (pin: number) => (pin >= 14 ? 3 + (pin - 14) : 9 + (pin - 2));
const pinName = (pin: number) => (pin >= 14 ? `A${pin - 14}` : `D${pin}`);
/** Kartın giriş/çıkış pinleri (D0, D1 seri hat için ayrılmış; şemada yok). */
const IO_PINS = Array.from({ length: 18 }, (_, i) => i + 2);

interface PinTile {
  readonly key: string;
  readonly name: string;
  readonly role: string;
  readonly value: string;
}

/**
 * Program seçimi; kullanılan pinlerin canlı değerleri (öbürleri "Diğer pinler" altında); seri ekran
 * (koyu zemin, eş genişlikli yazı, en alta kayar, Temizle); "Kod" satırı salt okunur kodu açar.
 */
export function ArduinoCardBody({
  part,
  frame,
  status,
  pinConnected,
  onProgram,
}: {
  part: Part;
  frame: SimFrame | null;
  status: SimStatus;
  pinConnected: (pin: number) => boolean;
  onProgram: (program: string) => void;
}) {
  const touch = useTouchUi();
  const program = String(part.props.program ?? '');
  const source = programSource(program);
  const baud = /Serial\.begin\((\d+)\)/.exec(source ?? '')?.[1];
  const ard = frame?.statuses.get(part.id)?.arduino;
  const m = frame?.measurements.get(part.id);
  const running = Boolean(ard?.running);
  const serialAll = ard?.serial ?? '';
  const [clearedAt, setClearedAt] = useState(0);
  const serial = serialAll.length >= clearedAt ? serialAll.slice(clearedAt) : serialAll;
  const [morePins, setMorePins] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const selectId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) el.scrollTop = el.scrollHeight;
  }, [serial]);
  // Simülasyon yeniden başlayınca (seri metin kısalınca) Temizle sıfırlanır.
  useEffect(() => {
    if (serialAll.length < clearedAt) setClearedAt(0);
  }, [serialAll.length, clearedAt]);

  const volt = (v: number) => formatSI(v, 'V', { digits: 3 });
  const pinTile = (pin: number): PinTile => {
    const state = ard?.pins.find((p) => p.pin === pin);
    const output = state ? state.mode >= 2 : false;
    const role = !state ? t.pinUnused : output ? t.pinOutput : state.mode === 1 ? t.pinPullup : t.pinInput;
    const value = !running || !state ? '– – –' : output ? `${volt(state.voltage)} · ${formatSI(Math.abs(state.current), 'A', { digits: 3 })}` : volt(state.voltage);
    return { key: `p${pin}`, name: pinName(pin), role, value };
  };
  const used = IO_PINS.filter((pin) => pinConnected(partPinOf(pin)));
  const others = IO_PINS.filter((pin) => !used.includes(pin));
  const tiles: PinTile[] = [
    ...(pinConnected(0) ? [{ key: '5v', name: '5V', role: t.pinSupply, value: running && m ? `${volt(m.voltage)} · ${formatSI(Math.abs(m.current), 'A', { digits: 3 })}` : '– – –' }] : []),
    ...(pinConnected(1) ? [{ key: '3v3', name: '3V3', role: t.pinSupply, value: running ? volt(3.3) : '– – –' }] : []),
    ...used.map(pinTile),
  ];
  const tile = (x: PinTile) => (
    <span key={x.key} className="flex min-w-0 flex-col gap-0.5 rounded-md bg-panel-2 px-2.5 py-2">
      <span className="truncate text-[11px] text-muted">
        {x.name} · {x.role}
      </span>
      <span className="font-mono text-sm break-words tabular">{x.value}</span>
    </span>
  );
  const lines = serial.replace(/\n$/, '').split('\n');
  return (
    <>
      <div className="flex items-center gap-2.5">
        <label htmlFor={selectId} className="w-16 shrink-0 text-small font-semibold">
          {tr.properties.fieldLabel('arduino', 'program')}
        </label>
        <select
          id={selectId}
          value={program}
          onChange={(e) => onProgram(e.target.value)}
          className={`min-w-0 flex-1 rounded-md border border-line-2 bg-panel px-3 ${touch ? 'h-11 text-base' : 'h-10 text-sm'}`}
        >
          {ARDUINO_PROGRAM_IDS.map((id) => (
            <option key={id} value={id}>
              {tr.properties.optionLabel('program', id)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map(tile)}
        {others.length > 0 && (
          <button
            type="button"
            onClick={() => setMorePins((o) => !o)}
            aria-expanded={morePins}
            className="flex min-w-0 flex-col gap-0.5 rounded-md border border-dashed border-line-2 px-2.5 py-2 text-left"
          >
            <span className="text-[11px] text-muted">{t.otherPins}</span>
            <span className="text-small font-medium text-accent-ink">{morePins ? t.hidePins : t.morePins(others.length)}</span>
          </button>
        )}
        {morePins && others.map((pin) => tile(pinTile(pin)))}
      </div>
      <section className="flex flex-col gap-1.5" aria-label={t.serial}>
        <div className="flex items-center justify-between">
          <span className="text-small font-semibold">
            {t.serial} {baud && <span className="text-[11px] font-normal text-muted">{t.baud(baud)}</span>}
          </span>
          <button type="button" onClick={() => setClearedAt(serialAll.length)} disabled={!serial} className={`text-label text-accent-ink disabled:text-stopped ${touch ? 'h-11 px-2' : 'h-7'}`}>
            {t.clear}
          </button>
        </div>
        <div
          ref={logRef}
          role="log"
          aria-live="off"
          className="flex h-32 flex-col overflow-y-auto overscroll-contain rounded-md bg-ink px-3 py-2.5 font-mono text-label leading-[1.5] text-line"
        >
          <span className="mt-auto" />
          {serial ? (
            lines.map((line, i) => (
              <span key={i} className={`whitespace-pre-wrap ${i === lines.length - 1 ? 'text-white' : ''}`}>
                {line}
              </span>
            ))
          ) : (
            <span className="text-stopped">{status === 'stopped' ? t.serialStopped : t.serialEmpty}</span>
          )}
        </div>
      </section>
      <div className="flex flex-col border-t border-line">
        <button
          type="button"
          onClick={() => setCodeOpen((o) => !o)}
          aria-expanded={codeOpen}
          className={`flex items-center justify-between text-left text-small ${touch ? 'h-11' : 'h-10'}`}
        >
          <span>
            <b className="font-semibold">{t.code}</b> <span className="text-muted">· {t.codeNote}</span>
          </span>
          <Icon name={codeOpen ? 'chevronDown' : 'chevron'} className="h-4 w-4" />
        </button>
        {codeOpen && (
          <div className="flex flex-col gap-1.5 pb-1">
            <pre className="max-h-72 overflow-auto overscroll-contain rounded-md border border-line-2 bg-panel px-2.5 py-2 font-mono text-label leading-normal text-ink-2">
              <code>{source ? highlight(source) : t.noProgram}</code>
            </pre>
            <span className="text-label leading-normal text-muted">
              {t.flash(formatNumber(programFlash(program), 0))} · {t.precompiled}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
