// Föy grafiğinin planı (i18n/foyGraphs) devrede: parça adları kimliğe, uçlar düğüm anahtarına çevrilir.
// Devrede adı geçen parça yoksa (kullanıcı silmiş ya da yeniden adlandırmış) plan kurulamaz (null).

import { foyEyebrow, FOY_GRAPHS, type FoyGraphDef, type FoyQuantity } from '../../i18n/foyGraphs';
import type { Quantity, SweepSpec } from '../../model/analysis';
import { pinKey } from '../../model/connectivity';
import { pinPositions } from '../../model/geometry';
import type { CircuitDoc } from '../../model/types';

export type ResolvedFoyPlan =
  | { readonly kind: 'time'; readonly y: readonly Quantity[]; readonly x: Quantity | null }
  | { readonly kind: 'sweep'; readonly sweep: SweepSpec }
  | { readonly kind: 'bode' };

export function resolveFoyPlan(def: FoyGraphDef, doc: CircuitDoc): ResolvedFoyPlan | null {
  const id = (label: string) => doc.parts.find((p) => p.label === label)?.id ?? null;
  const pin = (label: string, n: number) => {
    const part = doc.parts.find((p) => p.label === label);
    const at = part ? pinPositions(part)[n] : undefined;
    return part && at ? { key: pinKey(part.id, n), at } : null;
  };
  const q = (f: FoyQuantity): Quantity | null => {
    if (f.kind === 'pins') {
      const a = pin(f.a.part, f.a.pin);
      const b = f.b ? pin(f.b.part, f.b.pin) : null;
      if (!a || (f.b && !b)) return null;
      return { kind: 'voltage', node: a.key, at: a.at, ref: b?.key ?? null, refAt: b?.at ?? null };
    }
    const part = id(f.part);
    if (!part) return null;
    switch (f.kind) {
      case 'scope':
        return { kind: 'scope', part, channel: f.channel };
      case 'terminal':
        return { kind: 'terminal', part, quantity: f.quantity };
      default:
        return { kind: f.kind, part };
    }
  };
  const all = <T,>(list: readonly (T | null)[]): T[] | null => (list.every((x) => x !== null) ? (list as T[]) : null);
  const plan = def.plan;
  if (plan.kind === 'bode') return { kind: 'bode' };
  if (plan.kind === 'time') {
    const y = all(plan.y.map(q));
    const x = plan.x ? q(plan.x) : null;
    if (!y || (plan.x && !x)) return null;
    return { kind: 'time', y, x };
  }
  const param = id(plan.param.part);
  const familyPart = plan.family ? id(plan.family.param.part) : null;
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

/** Başlangıç ekranının föy kartları için: örneğin föy grafikleri, üst yazılarıyla. */
export function foyCards(example: string | null): readonly (FoyGraphDef & { readonly eyebrow: string })[] {
  return example ? (FOY_GRAPHS[example] ?? []).map((g) => ({ ...g, eyebrow: foyEyebrow(g) })) : [];
}
