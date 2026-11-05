// Lojik entegrenin defter kartındaki ayrıntıları: bacakların anlık durumu
// (1 / 0 / belirsiz / boşta) ve gerilimi; kapı entegrelerinde seçilen kapının doğruluk tablosu (o anki
// satır vurgulu); 7474'te Q, CD4017'de sayaç, CD4511'de gösterilen rakam.

import { useId, useState } from 'react';
import { GATE_CHIPS, LOGIC_CHIPS, chipPinNames, gateOutput, isGateChip, type LogicChipType } from '../model/logicChips';
import { partProp } from '../model/catalog';
import type { Part } from '../model/types';
import type { PinState } from '../sim/devices/device';
import { formatSI } from '../sim/units';
import { tr } from '../i18n/tr';
import { useTouchUi } from './touchUi';
import type { SimFrame } from './useSimulation';

const t = () => tr.logic;

/** Durumun rengi: 1 kalın (yanında sembolle aynı turuncu nokta), belirsiz ve boşta uyarı tonunda. */
function stateTone(state: PinState): string {
  switch (state) {
    case 'high':
      return 'font-semibold text-ink';
    case 'undefined':
    case 'floating':
      return 'font-semibold text-warn';
    default:
      return 'text-ink-2';
  }
}

/** Durum yazısı; 1'de şemadaki gibi turuncu nokta. */
function StateText({ state }: { state: PinState }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {state === 'high' && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-paused" />}
      {t().states[state]}
    </span>
  );
}

function Name({ text, bar }: { text: string; bar: boolean }) {
  return <span className={bar ? 'overline' : undefined}>{text}</span>;
}

export function LogicDetails({ part, frame }: { part: Part; frame: SimFrame | null }) {
  const type = part.type as LogicChipType;
  const chip = LOGIC_CHIPS[type];
  const model = String(partProp(type, part.props, 'model'));
  const names = chipPinNames(type, model);
  const logic = frame?.statuses.get(part.id)?.logic;
  const touch = useTouchUi();
  return (
    <div className="flex flex-col gap-3">
      {logic && !logic.powered && <p className="m-0 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-label leading-snug text-ink-2">{t().unpowered}</p>}
      {isGateChip(type) && <TruthTable part={part} levels={logic?.powered ? logic.levels : null} />}
      {type === 'ic7474' && logic?.powered && logic.q && (
        <p className="m-0 font-mono text-[15px] tabular">
          {logic.q.map((q, k) => `${k + 1}Q = ${q}`).join(' · ')}
        </p>
      )}
      {type === 'cd4017' && logic?.powered && logic.count !== undefined && <p className="m-0 text-[15px]">{t().count(logic.count)}</p>}
      {type === 'cd4511' && logic?.powered && <p className="m-0 text-[15px]">{t().digit(logic.digit ?? null, logic.levels)}</p>}
      <section aria-label={t().pinsTitle} className="flex flex-col gap-1.5">
        <span className="text-label font-semibold text-muted">{t().pinsTitle}</span>
        <table className={`w-full border-collapse ${touch ? 'text-[14px]' : 'text-[13px]'}`}>
          <thead>
            <tr className="text-left text-[11px] text-muted">
              <th className="py-1 pr-2 font-medium">{t().columns.pin}</th>
              <th className="py-1 pr-2 font-medium">{t().columns.name}</th>
              <th className="py-1 pr-2 font-medium">{t().columns.state}</th>
              <th className="py-1 text-right font-medium">{t().columns.voltage}</th>
            </tr>
          </thead>
          <tbody>
            {names.map((name, i) => {
              const pin = i + 1;
              const status = logic?.pins[i];
              const floatingHigh = status?.state === 'floating' && logic?.levels[i] === 1;
              const role = pin === chip.vcc || pin === chip.gnd ? 'supply' : chip.outputs.includes(pin) ? 'output' : 'input';
              return (
                <tr key={pin} className="border-t border-line">
                  <td className="py-1 pr-2 font-mono text-muted tabular">{pin}</td>
                  <td className="py-1 pr-2 font-mono">
                    <Name text={name} bar={chip.bars.includes(pin)} /> <span className="font-sans text-[11px] text-muted">{t().roles[role]}</span>
                  </td>
                  <td className={`py-1 pr-2 ${status ? stateTone(status.state) : 'text-muted'}`}>{status ? floatingHigh ? t().floatingHigh : <StateText state={status.state} /> : '—'}</td>
                  <td className="py-1 text-right font-mono tabular">{status ? formatSI(status.voltage, 'V', { digits: 3 }) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** Kapı entegresinde bir kapının doğruluk tablosu; kapı seçilir, o anki satır vurgulu. */
function TruthTable({ part, levels }: { part: Part; levels: readonly (number | null)[] | null }) {
  const type = part.type as keyof typeof GATE_CHIPS;
  const chip = GATE_CHIPS[type];
  const [gate, setGate] = useState(0);
  const touch = useTouchUi();
  const id = useId();
  const g = chip.gates[gate]!;
  const n = g.inputs.length;
  const rows = Array.from({ length: 2 ** n }, (_, r) => Array.from({ length: n }, (_, k) => (r >> (n - 1 - k)) & 1));
  const current = levels ? g.inputs.map((p) => levels[p - 1] ?? null) : null;
  const names = chipPinNames(type, String(partProp(type, part.props, 'model')));
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5">
      <span id={id} className="text-label font-semibold text-muted">
        {t().truthTable}
      </span>
      <div role="group" aria-label={t().gatePicker} className="flex flex-wrap gap-1">
        {chip.gates.map((_, k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === gate}
            onClick={() => setGate(k)}
            className={`rounded-md border px-2.5 font-mono text-[13px] ${touch ? 'h-11 min-w-11' : 'h-7'} ${
              k === gate ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line-2 text-ink-2 hover:bg-app'
            }`}
          >
            {t().gate(k + 1)}
          </button>
        ))}
      </div>
      <table className="w-auto border-collapse font-mono text-[13px] tabular">
        <thead>
          <tr className="text-[11px] text-muted">
            {g.inputs.map((p) => (
              <th key={p} className="px-3 py-1 font-medium">
                {names[p - 1]}
              </th>
            ))}
            <th className="border-l border-line px-3 py-1 font-medium">{names[g.output - 1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ins) => {
            const on = current !== null && current.every((c, k) => c === ins[k]);
            return (
              <tr key={ins.join('')} aria-current={on || undefined} className={`border-t border-line ${on ? 'bg-accent-soft font-semibold text-accent-ink' : ''}`}>
                {ins.map((v, k) => (
                  <td key={k} className="px-3 py-1 text-center">
                    {v}
                  </td>
                ))}
                <td className="border-l border-line px-3 py-1 text-center">{gateOutput(chip.kind, ins)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {current !== null && current.some((c) => c === null) && <p className="m-0 text-label text-muted">{t().noRow}</p>}
    </section>
  );
}

