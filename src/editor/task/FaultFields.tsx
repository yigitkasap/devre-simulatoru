// Görev oluştur → Arıza bulma (R4): belirti (öğrenci görür), gizli arıza satırları (yer, tür; yer
// şemadan da seçilir), Arıza ekle, Rastgele seç, öğrencinin ölçü aletleri, "Otomatik göstergeleri
// gizle", "Önce beklenen değeri sor" ve uyarı (arıza bağlantının içinde durur, not vermez).

import { useMemo } from 'react';
import { tr } from '../../i18n/tr';
import { VALUE_PROP, type Fault, type Spot } from '../../model/faults';
import type { FaultTask, FaultTools } from '../../model/task';
import type { CircuitDoc } from '../../model/types';
import { formatSI } from '../../sim/units';
import { parseTheory } from '../analysis/table';
import type { NetIndex } from '../analysis/traces';
import { randomFault } from '../fault/judge';
import { Icon } from '../icons';
import { endKey, firstFault, kindsFor, legKey, makeFault, placeOptions, rowKey, spotOfKey, type PlaceOption } from './faultRows';

const UNITS: Record<string, string> = { resistance: 'Ω', capacitance: 'F', inductance: 'H' };
const spotKey = (s: Spot) => ('part' in s ? legKey(s.part, s.pin) : endKey(s.wire, s.end ?? 0));

export function FaultFields({
  doc,
  idx,
  value,
  onChange,
  onPick,
  touch,
}: {
  doc: CircuitDoc;
  idx: NetIndex;
  value: FaultTask;
  onChange: (next: FaultTask) => void;
  /** Satırın yerini şemadan seç (pencere kapanır, seçince geri açılır). */
  onPick?: (row: number, which: 'at' | 'to') => void;
  touch: boolean;
}) {
  const t = tr.fault.dialog;
  const options = useMemo(() => placeOptions(doc, idx), [doc, idx]);
  const field = `min-w-0 rounded-lg border border-line-2 bg-panel px-3 ${touch ? 'h-11 text-[16px]' : 'h-10 text-sm'}`;
  const set = (patch: Partial<FaultTask>) => onChange({ ...value, ...patch });
  const setRow = (i: number, f: Fault | null) => f && set({ faults: value.faults.map((x, j) => (j === i ? f : x)) });
  const toggle = (key: keyof FaultTools) => set({ tools: { ...value.tools, [key]: !value.tools[key] } });
  const pickButton = (i: number, which: 'at' | 'to') =>
    onPick && (
      <button type="button" onClick={() => onPick(i, which)} aria-label={t.pick} title={t.pick} className={`flex shrink-0 items-center justify-center rounded-lg border border-line-2 text-muted hover:bg-panel-2 hover:text-ink ${touch ? 'h-11 w-11' : 'h-10 w-10'}`}>
        <Icon name="pointer" className="h-4 w-4" />
      </button>
    );
  const placeSelect = (current: string, onKey: (key: string) => void, label: string, only?: PlaceOption['group'][]) => (
    <select aria-label={label} value={current} onChange={(e) => onKey(e.target.value)} className={`${field} flex-1 text-ink`}>
      {(['leg', 'part', 'wire'] as const)
        .filter((g) => !only || only.includes(g))
        .map((g) => (
          <optgroup key={g} label={t.groups[g]}>
            {options
              .filter((o) => o.group === g)
              .map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  );
  const switchRow = (on: boolean, label: string, note: string, onToggle: () => void) => (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className={`flex w-full items-center justify-between gap-3 text-left text-small ${touch ? 'min-h-11' : 'min-h-9'}`}>
      <span className="flex min-w-0 flex-col">
        <span>{label}</span>
        <span className="text-label text-muted">{note}</span>
      </span>
      <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-line-2'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-panel shadow ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );

  return (
    <>
      <label className="flex flex-col gap-1.5 text-small font-semibold">
        <span>
          {t.symptom} <span className="font-normal text-muted">{t.symptomNote}</span>
        </span>
        <input value={value.symptom} onChange={(e) => set({ symptom: e.target.value })} placeholder={t.symptomHint} className={`${field} w-full font-normal`} />
      </label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-small font-semibold">
          {t.hidden} <span className="font-normal text-muted">{t.hiddenNote}</span>
        </legend>
        {value.faults.length === 0 && <p className="m-0 text-small text-warn">{t.none}</p>}
        {value.faults.map((f, i) => {
          const key = rowKey(f);
          const kinds = kindsFor(key, doc);
          const part = 'part' in f ? doc.parts.find((p) => p.id === f.part) : undefined;
          const prop = part ? VALUE_PROP[part.type] : undefined;
          const unit = prop ? (UNITS[prop] ?? '') : '';
          return (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {placeSelect(key, (k) => setRow(i, makeFault(k, kindsFor(k, doc).includes(f.kind) ? f.kind : kindsFor(k, doc)[0]!, doc, f)), t.placeLabel(i + 1))}
                {pickButton(i, 'at')}
                <select aria-label={t.kindLabel(i + 1)} value={f.kind} onChange={(e) => setRow(i, makeFault(key, e.target.value as Fault['kind'], doc, f))} className={`${field} w-[168px] text-ink`}>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {t.kinds[k]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => set({ faults: value.faults.filter((_, j) => j !== i) })}
                  aria-label={t.remove(i + 1)}
                  className={`flex shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel-2 hover:text-ink ${touch ? 'h-11 w-11' : 'h-10 w-10'}`}
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              {f.kind === 'short' && key.split(':').length === 3 && (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-small text-muted">{t.with}</span>
                  {placeSelect(spotKey(f.to), (k) => {
                    const to = spotOfKey(k);
                    if (to) setRow(i, { ...f, to });
                  }, t.toLabel(i + 1), ['leg', 'wire'])}
                  {pickButton(i, 'to')}
                </div>
              )}
              {f.kind === 'value' && (
                <label className="flex items-center gap-2 text-small text-muted">
                  {t.actual}
                  <input
                    key={`${f.part}${f.value}`}
                    aria-label={t.valueLabel(i + 1)}
                    defaultValue={formatSI(f.value, unit, { trim: true })}
                    inputMode="decimal"
                    onBlur={(e) => {
                      const v = parseTheory(e.target.value, unit);
                      if (v !== null && v > 0) setRow(i, { ...f, value: v });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className={`${field} w-32 font-mono text-ink`}
                  />
                </label>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-x-4">
          <button
            type="button"
            onClick={() => {
              const f = firstFault(doc, idx);
              if (f) set({ faults: [...value.faults, f] });
            }}
            className={`flex items-center gap-1.5 rounded-lg px-1 text-small font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-8'}`}
          >
            <Icon name="plus" className="h-4 w-4" />
            {t.add}
          </button>
          <button
            type="button"
            onClick={() => {
              const f = randomFault(doc, idx, Math.random, value.faults[0]);
              if (f) set({ faults: [f] });
            }}
            className={`flex items-center gap-1.5 rounded-lg px-1 text-small font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-8'}`}
          >
            <Icon name="restart" className="h-4 w-4" />
            {t.random}
          </button>
        </div>
        <p className="m-0 text-label text-muted">{t.help}</p>
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-small font-semibold">{t.tools}</legend>
        <div className="flex flex-wrap gap-1.5">
          {(['voltage', 'resistance', 'scope', 'ammeter'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={value.tools[k]}
              onClick={() => toggle(k)}
              className={`rounded-full border px-3.5 text-small ${touch ? 'h-11' : 'h-8'} ${value.tools[k] ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line-2 text-ink hover:bg-panel-2'}`}
            >
              {t.toolNames[k]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-x-6 max-sm:grid-cols-1">
        {switchRow(value.hideIndicators, t.hideIndicators, t.hideIndicatorsNote, () => set({ hideIndicators: !value.hideIndicators }))}
        {switchRow(value.askExpected, t.askExpected, t.askExpectedNote, () => set({ askExpected: !value.askExpected }))}
      </div>
      <p role="note" className="m-0 flex gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5 text-small text-warn">
        <Icon name="warning" className="mt-px h-4 w-4 shrink-0" />
        {t.visible}
      </p>
    </>
  );
}
