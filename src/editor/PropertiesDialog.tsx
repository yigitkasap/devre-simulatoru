// Özellik penceresi: bir parçaya çift tıklayınca açılır. Değerler SI önekleriyle yazılır;
// hatalı girişte alanın altında Türkçe bir uyarı çıkar.

import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { tr } from '../i18n/tr';
import { CATALOG, type NumberPropDef } from '../model/catalog';
import type { Part } from '../model/types';
import { LED_MODELS, type LedColor } from '../sim/devices/led';
import type { PropValue } from '../sim/netlist';
import { formatEditable, formatSI, parseValue } from '../sim/units';
import { Icon } from './icons';
import { Rich } from './Rich';

export interface PropertiesDialogProps {
  readonly part: Part;
  /** Aynı ad kontrolü için diğer parçaların adları. */
  readonly otherLabels: ReadonlySet<string>;
  readonly onCancel: () => void;
  readonly onSave: (patch: { label: string; props: Record<string, PropValue> }) => void;
}

function validateNumber(def: NumberPropDef, text: string): { value: number } | { error: string } {
  const parsed = parseValue(text, def.unit);
  if (!parsed.ok) {
    if (parsed.error === 'empty') return { error: tr.properties.errors.empty };
    if (parsed.error === 'wrong-unit') return { error: tr.properties.errors.wrongUnit(def.unit) };
    return { error: tr.properties.errors.invalid };
  }
  if (def.min) {
    if (def.min.exclusive && parsed.value <= def.min.value) return { error: tr.properties.errors.positive };
    if (!def.min.exclusive && parsed.value < def.min.value) return { error: tr.properties.errors.nonNegative };
  }
  return { value: parsed.value };
}

export function PropertiesDialog({ part, otherLabels, onCancel, onSave }: PropertiesDialogProps) {
  const def = CATALOG[part.type];
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState(part.label);
  const [values, setValues] = useState<Record<string, PropValue>>(() => {
    const initial: Record<string, PropValue> = {};
    for (const prop of def.propDefs) {
      const current = part.props[prop.key] ?? def.defaultProps[prop.key];
      initial[prop.key] = prop.kind === 'number' && typeof current === 'number' ? formatEditable(current) : (current ?? '');
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, []);

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    const props: Record<string, PropValue> = { ...part.props };
    const trimmed = label.trim();
    if (trimmed === '') nextErrors.label = tr.properties.errors.labelEmpty;
    else if (otherLabels.has(trimmed)) nextErrors.label = tr.properties.errors.labelTaken;
    for (const prop of def.propDefs) {
      const value = values[prop.key];
      if (prop.kind === 'number') {
        if (prop.disabledWhen && values[prop.disabledWhen] === true) continue;
        const result = validateNumber(prop, String(value ?? ''));
        if ('error' in result) nextErrors[prop.key] = result.error;
        else props[prop.key] = result.value;
      } else if (value !== undefined) {
        props[prop.key] = value;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSave({ label: trimmed, props });
  };

  const note = part.type === 'led' ? ledNote(values.color) : tr.properties.notes[part.type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        className="w-[min(26rem,100%)] rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="font-semibold">
            {tr.properties.title(part.label)}
            <span className="ml-2 text-sm font-normal text-muted">{tr.devices.names[part.type]}</span>
          </h2>
          <button type="button" onClick={onCancel} className="rounded p-1 text-muted hover:bg-app" aria-label={tr.properties.cancel}>
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <Field label={tr.properties.name} error={errors.label}>
            {(id) => (
              <input
                id={id}
                ref={def.propDefs.some((p) => p.kind === 'number') ? undefined : firstFieldRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={12}
                className={inputClass(Boolean(errors.label))}
              />
            )}
          </Field>

          {def.propDefs.map((prop, index) => {
            const firstNumber = def.propDefs.findIndex((p) => p.kind === 'number') === index;
            if (prop.kind === 'number') {
              const disabled = Boolean(prop.disabledWhen && values[prop.disabledWhen] === true);
              return (
                <Field key={prop.key} label={tr.properties.fieldLabel(part.type, prop.key)} error={disabled ? undefined : errors[prop.key]}>
                  {(id) => (
                    <div className="relative">
                      <input
                        id={id}
                        ref={firstNumber ? firstFieldRef : undefined}
                        value={String(values[prop.key] ?? '')}
                        disabled={disabled}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => setValues((v) => ({ ...v, [prop.key]: e.target.value }))}
                        className={`${inputClass(Boolean(errors[prop.key]) && !disabled)} pr-10 tabular`}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">
                        {prop.unit}
                      </span>
                    </div>
                  )}
                </Field>
              );
            }
            if (prop.kind === 'boolean') {
              return (
                <label key={prop.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values[prop.key] === true}
                    onChange={(e) => setValues((v) => ({ ...v, [prop.key]: e.target.checked }))}
                    className="h-4 w-4 accent-accent"
                  />
                  {tr.properties.fieldLabel(part.type, prop.key)}
                </label>
              );
            }
            return (
              <fieldset key={prop.key}>
                <legend className="mb-1.5 text-sm font-medium">{tr.properties.fieldLabel(part.type, prop.key)}</legend>
                <div className="flex gap-2">
                  {prop.options.map((option) => {
                    const checked = values[prop.key] === option;
                    const swatch = part.type === 'led' ? LED_MODELS[option as LedColor]?.lightColor : undefined;
                    return (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                          checked ? 'border-accent bg-accent-soft' : 'border-line hover:bg-app'
                        }`}
                      >
                        <input
                          type="radio"
                          name={prop.key}
                          value={option}
                          checked={checked}
                          onChange={() => setValues((v) => ({ ...v, [prop.key]: option }))}
                          className="sr-only"
                        />
                        {swatch && <span className="h-3 w-3 rounded-full" style={{ background: swatch }} />}
                        {tr.devices.ledColors[option] ?? option}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {def.propDefs.some((p) => p.kind === 'number') && <p className="text-xs text-muted">{tr.properties.unitHint}</p>}
          {note && (
            <p className="rounded-md bg-app px-3 py-2 text-xs leading-relaxed text-ink">
              <Rich text={note} />
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm hover:bg-app">
            {tr.properties.cancel}
          </button>
          <button type="submit" className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:brightness-110">
            {tr.properties.ok}
          </button>
        </div>
      </form>
    </div>
  );
}

function ledNote(color: PropValue | undefined): string {
  const model = LED_MODELS[(typeof color === 'string' && color in LED_MODELS ? color : 'red') as LedColor];
  return tr.properties.ledSpec(
    formatSI(model.forwardVoltage, 'V', { trim: true }),
    formatSI(model.maxCurrent, 'A', { trim: true }),
  );
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 disabled:bg-app disabled:text-muted ${
    hasError ? 'border-danger focus:ring-danger/20' : 'border-line focus:border-accent focus:ring-accent/20'
  }`;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
