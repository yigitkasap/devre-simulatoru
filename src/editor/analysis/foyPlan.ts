// Föy grafiğinin planı (i18n/foyGraphs) devrede: parça adları kimliğe, uçlar düğüm anahtarına çevrilir.
// Devrede adı geçen parça yoksa (kullanıcı silmiş ya da yeniden adlandırmış) plan kurulamaz (null).
// Föydeki adlar da buradan: grafikte föy planındaki büyüklük (ya da taranan değer) duruyorsa föydeki
// adıyla yazılır; kullanıcının eklediği ya da değiştirdiği büyüklük devredeki adını korur.

import { foyEyebrow, foyGraph, FOY_GRAPHS, type FoyGraphDef, type FoyParam, type FoyQuantity } from '../../i18n/foyGraphs';
import type { FoyGraphRef, Quantity, SweepParam, SweepSpec } from '../../model/analysis';
import { pinKey } from '../../model/connectivity';
import { pinPositions } from '../../model/geometry';
import type { CircuitDoc } from '../../model/types';
import { quantityKey } from './quantities';

export type ResolvedFoyPlan =
  | { readonly kind: 'time'; readonly y: readonly Quantity[]; readonly x: Quantity | null }
  | { readonly kind: 'sweep'; readonly sweep: SweepSpec }
  | { readonly kind: 'bode' };

const partId = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)?.id ?? null;

/** Föy planındaki büyüklük devrede (parçası yoksa null). */
export function resolveFoyQuantity(f: FoyQuantity, doc: CircuitDoc): Quantity | null {
  if (f.kind === 'pins') {
    const pin = (label: string, n: number) => {
      const part = doc.parts.find((p) => p.label === label);
      const at = part ? pinPositions(part)[n] : undefined;
      return part && at ? { key: pinKey(part.id, n), at } : null;
    };
    const a = pin(f.a.part, f.a.pin);
    const b = f.b ? pin(f.b.part, f.b.pin) : null;
    if (!a || (f.b && !b)) return null;
    return { kind: 'voltage', node: a.key, at: a.at, ref: b?.key ?? null, refAt: b?.at ?? null };
  }
  const part = partId(doc, f.part);
  if (!part) return null;
  switch (f.kind) {
    case 'scope':
      return { kind: 'scope', part, channel: f.channel };
    case 'terminal':
      return { kind: 'terminal', part, quantity: f.quantity };
    default:
      return { kind: f.kind, part };
  }
}

export function resolveFoyPlan(def: FoyGraphDef, doc: CircuitDoc): ResolvedFoyPlan | null {
  const q = (f: FoyQuantity) => resolveFoyQuantity(f, doc);
  const all = <T,>(list: readonly (T | null)[]): T[] | null => (list.every((x) => x !== null) ? (list as T[]) : null);
  const plan = def.plan;
  if (plan.kind === 'bode') return { kind: 'bode' };
  if (plan.kind === 'time') {
    const y = all(plan.y.map(q));
    const x = plan.x ? q(plan.x) : null;
    if (!y || (plan.x && !x)) return null;
    return { kind: 'time', y, x };
  }
  const param = partId(doc, plan.param.part);
  const familyPart = plan.family ? partId(doc, plan.family.param.part) : null;
  const y = all(plan.y.map(q));
  const x = plan.x ? q(plan.x) : null;
  if (!param || !y || (plan.family && !familyPart) || (plan.x && !x)) return null;
  return {
    kind: 'sweep',
    sweep: {
      param: { part: param, prop: plan.param.prop },
      ranges: plan.ranges,
      family: plan.family && familyPart ? { param: { part: familyPart, prop: plan.family.param.prop }, values: plan.family.values } : null,
      x,
      y,
    },
  };
}

/** Taranan değerin föydeki adı ve işareti (V_{GS} = −V_{GG}: −1). */
export interface FoyParamName {
  readonly param: SweepParam;
  readonly name: string;
  readonly sign: 1 | -1;
}

export interface FoyNames {
  /** Büyüklüğün anahtarı (quantityKey) → föydeki adı. */
  readonly quantities: ReadonlyMap<string, string>;
  readonly param: FoyParamName | null;
  readonly family: FoyParamName | null;
  /** Bode'da girişin ve çıkışın seçenek anahtarı (useBode) ve föydeki adları; kazancın adı. */
  readonly bode: { readonly inputKey: string | null; readonly input: string; readonly outputKey: string | null; readonly output: string; readonly gain: string } | null;
}

/** Föy grafiğinin devredeki adları (föy grafiği değilse null). */
export function foyNames(ref: FoyGraphRef | undefined, doc: CircuitDoc): FoyNames | null {
  const def = ref ? foyGraph(ref) : null;
  if (!def) return null;
  const plan = def.plan;
  const quantities = new Map<string, string>();
  const add = (f: FoyQuantity | null | undefined) => {
    const q = f ? resolveFoyQuantity(f, doc) : null;
    if (f && q) quantities.set(quantityKey(q), f.name);
  };
  const param = (p: FoyParam | undefined): FoyParamName | null => {
    const part = p ? partId(doc, p.part) : null;
    return p && part ? { param: { part, prop: p.prop }, name: p.name, sign: p.sign ?? 1 } : null;
  };
  if (plan.kind === 'bode') {
    const osc = partId(doc, plan.output.part);
    const bode = { inputKey: partId(doc, plan.input.part), input: plan.input.name, outputKey: osc ? `${osc}:${plan.output.channel === 1 ? 'B' : 'A'}` : null, output: plan.output.name, gain: plan.gain };
    return { quantities, param: null, family: null, bode };
  }
  plan.y.forEach(add);
  add(plan.x);
  if (plan.kind === 'time') return { quantities, param: null, family: null, bode: null };
  return { quantities, param: param(plan.param), family: param(plan.family?.param), bode: null };
}

/** Değer föy planındaki taranan değer mi (aynı parça ve özellik). */
export const sameParam = (a: SweepParam, b: FoyParamName | null): b is FoyParamName => b !== null && a.part === b.param.part && a.prop === b.param.prop;

/** Başlangıç ekranının föy kartları için: örneğin föy grafikleri, üst yazılarıyla. */
export function foyCards(example: string | null): readonly (FoyGraphDef & { readonly eyebrow: string })[] {
  return example ? (FOY_GRAPHS[example] ?? []).map((g) => ({ ...g, eyebrow: foyEyebrow(g) })) : [];
}
