// Görev oluştur (C1, N6): şu anki devreden görev. Alanlar: görev adı, yönerge, değiştirilebilir
// parçalar (çipler), "Yeni parça eklenebilir", hedefler (büyüklük, değer, tolerans; ±, ≥ ya da ≤).
// Uyarı: hedefler bağlantının içinde, öğrenci görebilir; notlu sınav için değil. Altta bağlantı
// (8 KB'yi aşarsa uyarı ve görev dosyası önerisi), Bağlantıyı kopyala, Görev dosyası (.json) ve
// Öğrenci gibi önizle.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import type { TraceDef } from '../../model/analysis';
import { LINK_LIMIT, taskPayload, taskUrl, type Target, type TargetOp, type TaskDef } from '../../model/task';
import type { CircuitDoc } from '../../model/types';
import { formatNumber } from '../../sim/units';
import { datedName, saveFile } from '../analysis/format';
import { parseTheory } from '../analysis/table';
import type { NetIndex } from '../analysis/traces';
import { newId } from '../analysis/useAnalysis';
import { Icon } from '../icons';
import { plainText } from '../Rich';
import { useTouchUi } from '../touchUi';
import { quantityKey, targetOptions, valueText } from './targets';

export interface TaskDialogProps {
  readonly doc: CircuitDoc;
  readonly title: string;
  readonly idx: NetIndex;
  readonly traces: readonly TraceDef[];
  /** Önceki taslak (pencere yeniden açılınca). */
  readonly draft: TaskDef | null;
  readonly onDraft: (task: TaskDef) => void;
  readonly onClose: () => void;
  readonly notify: (message: string) => void;
}

/** Görev adından dosya adı: küçük harf, Türkçe harfler sadeleştirilmiş, tire ile. */
export function slug(text: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return (
    text
      .toLocaleLowerCase('tr')
      .replace(/[çğıöşü]/g, (c) => map[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'gorev'
  );
}

export function TaskDialog({ doc, title, idx, traces, draft, onDraft, onClose, notify }: TaskDialogProps) {
  const t = tr.task.dialog;
  const titleId = useId();
  const touch = useTouchUi();
  const options = useMemo(() => targetOptions(doc, idx, traces), [doc, idx, traces]);
  const [task, setTask] = useState<TaskDef>(
    () => draft ?? { name: title, instruction: '', editable: [], allowNew: false, targets: [] },
  );
  useEffect(() => onDraft(task), [task, onDraft]);
  const set = (patch: Partial<TaskDef>) => setTask((x) => ({ ...x, ...patch }));
  const setTarget = (id: string, patch: Partial<Target>) => set({ targets: task.targets.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const url = useMemo(() => taskUrl(task, doc, window.location.href), [task, doc]);
  const tooLong = url.length > LINK_LIMIT;
  const [copied, setCopied] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      notify(t.copied);
    } catch {
      notify(t.copyFailed);
    }
  };
  const file = () => void saveFile(datedName(`gorev-${slug(task.name)}`, 'json'), new Blob([`${JSON.stringify(taskPayload(task, doc), null, 2)}\n`], { type: 'application/json' }));
  const field = `w-full min-w-0 rounded-lg border border-line-2 bg-panel px-3 ${touch ? 'h-11 text-[16px]' : 'h-10 text-sm'}`;
  const parts = doc.parts.filter((p) => p.type !== 'ground');
  const unitOf = (target: Target) => options.find((o) => o.key === quantityKey(target.q))?.unit ?? '';
  const groups = [...new Set(options.map((o) => o.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[min(860px,100%)] w-[min(40rem,100%)] flex-col rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-2 px-6 pt-5 pb-2">
          <div className="min-w-0">
            <h2 id={titleId} className="m-0 text-[20px] font-semibold">
              {t.title}
            </h2>
            <p className="m-0 mt-0.5 truncate text-small text-muted">{t.start(title)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className={`flex shrink-0 items-center justify-center rounded-lg text-muted hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}>
            <Icon name="close" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 pb-4">
          <label className="flex flex-col gap-1.5 text-small font-semibold">
            {t.name}
            <input ref={first} value={task.name} onChange={(e) => set({ name: e.target.value })} className={`${field} font-normal`} />
          </label>
          <label className="flex flex-col gap-1.5 text-small font-semibold">
            {t.instruction}
            <textarea value={task.instruction} onChange={(e) => set({ instruction: e.target.value })} rows={3} placeholder={t.instructionHint} className={`w-full rounded-lg border border-line-2 bg-panel px-3 py-2 font-normal ${touch ? 'text-[16px]' : 'text-sm'}`} />
          </label>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 p-0 text-small font-semibold">{t.editable}</legend>
            <div className="flex flex-wrap gap-1.5">
              {parts.map((p) => {
                const on = task.editable.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ editable: on ? task.editable.filter((x) => x !== p.id) : [...task.editable, p.id] })}
                    className={`rounded-full border px-3.5 font-mono text-small ${touch ? 'h-11' : 'h-8'} ${on ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line-2 text-ink hover:bg-panel-2'}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <button
            type="button"
            role="switch"
            aria-checked={task.allowNew}
            onClick={() => set({ allowNew: !task.allowNew })}
            className={`flex w-full items-center justify-between gap-3 text-left text-small ${touch ? 'min-h-11' : 'min-h-9'}`}
          >
            {t.allowNew}
            <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full ${task.allowNew ? 'bg-accent' : 'bg-line-2'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-panel shadow ${task.allowNew ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
          </button>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_136px_80px_40px] items-end gap-2 text-small max-sm:grid-cols-1">
              <span className="font-semibold">{t.targets}</span>
              <span className="text-label text-muted max-sm:hidden">{t.value}</span>
              <span className="text-label text-muted max-sm:hidden">{t.tolerance}</span>
              <span className="max-sm:hidden" />
            </div>
            {task.targets.map((target) => (
              <TargetRow key={target.id} target={target} unit={unitOf(target)} options={options} groups={groups} touch={touch} onChange={(patch) => setTarget(target.id, patch)} onRemove={() => set({ targets: task.targets.filter((x) => x.id !== target.id) })} />
            ))}
            <button
              type="button"
              disabled={options.length === 0}
              onClick={() => set({ targets: [...task.targets, { id: newId('h'), q: options[0]!.q, op: 'tol', value: 0, tol: 10 }] })}
              className={`flex items-center gap-1.5 self-start rounded-lg px-1 text-small font-semibold text-accent-ink hover:bg-accent-soft disabled:opacity-50 ${touch ? 'h-11' : 'h-8'}`}
            >
              <Icon name="plus" className="h-4 w-4" />
              {t.addTarget}
            </button>
            {!traces.some((x) => x.kind === 'voltage' && x.ref) && <p className="m-0 text-label text-muted">{t.nodeHint}</p>}
          </div>
          <p role="note" className="m-0 flex gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5 text-small text-warn">
            <Icon name="warning" className="mt-px h-4 w-4 shrink-0" />
            {t.visible}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-line px-6 py-4">
          {tooLong && (
            <p role="alert" className="m-0 flex gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-small text-warn">
              <Icon name="warning" className="mt-px h-4 w-4 shrink-0" />
              {t.tooLong(formatNumber(url.length / 1024, 1))}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={url} aria-label={t.link} onFocus={(e) => e.target.select()} className={`min-w-0 flex-1 rounded-lg bg-app px-3 font-mono text-label text-ink-2 ${touch ? 'h-11 text-[16px]' : 'h-11'}`} />
            <button type="button" onClick={() => void copy()} className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-4 text-small font-semibold h-11 ${tooLong ? 'border border-line-2 bg-panel text-ink' : 'bg-accent text-white'}`}>
              <Icon name="copy" className="h-4 w-4" />
              {copied ? t.copiedShort : t.copy}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href={url} target="_blank" rel="noopener" className={`flex items-center gap-1.5 text-small font-medium text-accent-ink hover:underline ${touch ? 'min-h-11' : 'min-h-8'}`}>
              <Icon name="external" className="h-4 w-4" />
              {t.preview}
            </a>
            <button type="button" onClick={file} className={`flex items-center gap-1.5 rounded-lg text-small font-medium ${tooLong ? 'font-semibold text-accent-ink' : 'text-ink-2'} hover:underline ${touch ? 'min-h-11' : 'min-h-8'}`}>
              <Icon name="download" className="h-4 w-4" />
              {t.file}
            </button>
            <span className="text-label text-muted">{t.size(formatNumber(url.length / 1024, 1))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TargetRow({
  target,
  unit,
  options,
  groups,
  touch,
  onChange,
  onRemove,
}: {
  target: Target;
  unit: string;
  options: ReturnType<typeof targetOptions>;
  groups: readonly string[];
  touch: boolean;
  onChange: (patch: Partial<Target>) => void;
  onRemove: () => void;
}) {
  const t = tr.task.dialog;
  const field = `min-w-0 rounded-lg border border-line-2 bg-panel px-2 ${touch ? 'h-11 text-[16px]' : 'h-10 text-sm'}`;
  const key = quantityKey(target.q);
  const name = options.find((o) => o.key === key)?.name ?? '';
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_136px_80px_40px] items-center gap-2 max-sm:grid-cols-[minmax(0,1fr)_96px_44px] max-sm:border-b max-sm:border-line max-sm:pb-2">
      <select aria-label={t.quantityLabel} value={key} onChange={(e) => onChange({ q: options.find((o) => o.key === e.target.value)!.q })} className={`${field} w-full max-sm:col-span-3`}>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {options
              .filter((o) => o.group === g)
              .map((o) => (
                <option key={o.key} value={o.key}>
                  {plainText(o.name)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <span className="flex min-w-0 items-center gap-1">
        <select aria-label={t.opLabel(plainText(name))} value={target.op} onChange={(e) => onChange({ op: e.target.value as TargetOp })} className={`${field} shrink-0 px-1 ${touch ? 'w-14' : 'w-11'}`}>
          <option value="tol">±</option>
          <option value="ge">≥</option>
          <option value="le">≤</option>
        </select>
        <input
          key={`${key}${target.value}`}
          aria-label={t.valueLabel(plainText(name))}
          placeholder={unit}
          defaultValue={target.value === 0 ? '' : valueText(target.value, unit)}
          onBlur={(e) => {
            const v = parseTheory(e.target.value.replace(/^[≥≤±]\s*/, ''), unit === 'dB' ? '' : unit);
            if (v !== null) onChange({ value: v });
          }}
          className={`${field} w-0 flex-1 font-mono`}
        />
      </span>
      <input
        aria-label={t.toleranceLabel(plainText(name))}
        disabled={target.op !== 'tol'}
        defaultValue={target.op === 'tol' ? `%${formatNumber(target.tol, 0)}` : '–'}
        key={`${target.op}${target.tol}`}
        onBlur={(e) => {
          const v = Number(e.target.value.replace(/[%±\s]/g, '').replace(',', '.'));
          if (Number.isFinite(v) && v >= 0) onChange({ tol: v });
        }}
        className={`${field} w-full font-mono disabled:opacity-50`}
      />
      <button type="button" onClick={onRemove} aria-label={t.removeTarget(plainText(name))} className={`flex items-center justify-center rounded-lg text-muted hover:bg-app ${touch ? 'h-11 w-11' : 'h-10 w-10'}`}>
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}
