// Arıza bulma (B2): devreye gizlenen arızalar. Şema (belge) doğru hâliyle kalır; arıza yalnızca
// netlist kurulurken uygulanır (buildConnectivity), motor değişmez (v1). Türler: kopuk bağlantı ya da
// kötü temas (bir parça bacağı ya da kablo ucu), kısa devre (iki nokta arası), yanlış değerli parça,
// ters takılmış diyot ya da elektrolitik, yanmış LED ve atmış sigorta. Parça içi arızalar (ör.
// transistörde açık eklem) v2'de; çoğu dışarıdan "kopuk bacak" ile aynı ölçümü verir.

import type { DeviceType } from '../sim/netlist';
import { pinPositions } from './geometry';
import type { CircuitDoc, Part } from './types';

/** Şemada bir yer: parça bacağı ya da kablo (kopuk kablo ucunda hangi uç: 0 baş, 1 son). */
export type Spot = { readonly part: string; readonly pin: number } | { readonly wire: string; readonly end?: 0 | 1 };

export type Fault =
  /** Bacak ya da kablo ucu bağlı olduğu noktaya değmiyor (kopuk bağlantı ya da kötü temas). */
  | { readonly kind: 'open'; readonly at: Spot }
  /** İki nokta arasında kısa devre (ör. lehim köprüsü). */
  | { readonly kind: 'short'; readonly at: Spot; readonly to: Spot }
  /** Parçanın değeri şemadakinden farklı (ör. 5,6 kΩ yerine 560 Ω). */
  | { readonly kind: 'value'; readonly part: string; readonly value: number }
  /** Ters takılmış diyot, zener, LED ya da elektrolitik kondansatör. */
  | { readonly kind: 'reversed'; readonly part: string }
  /** Yanmış LED ya da atmış sigorta: iki ucu arası açık. */
  | { readonly kind: 'burnt'; readonly part: string };

export type FaultKind = Fault['kind'];
export const FAULT_KINDS: readonly FaultKind[] = ['open', 'short', 'value', 'reversed', 'burnt'];

/** Yanlış değer arızasında değişen özellik (parçanın ana değeri). */
export const VALUE_PROP: Partial<Record<DeviceType, string>> = {
  resistor: 'resistance',
  capacitor: 'capacitance',
  inductor: 'inductance',
};

const REVERSIBLE: ReadonlySet<DeviceType> = new Set(['diode', 'zener', 'led']);
const BURNABLE: ReadonlySet<DeviceType> = new Set(['led', 'fuse']);

/** Bu parçada bu tür arıza olabilir mi (açık ve kısa devre her bacakta olur). */
export function faultFits(kind: FaultKind, part: Part): boolean {
  switch (kind) {
    case 'open':
    case 'short':
      return true;
    case 'value':
      return VALUE_PROP[part.type] !== undefined;
    case 'reversed':
      return REVERSIBLE.has(part.type) || (part.type === 'capacitor' && part.props.kind === 'electrolytic');
    case 'burnt':
      return BURNABLE.has(part.type);
  }
}

/** Arızanın bulunduğu parça ya da kablo (yer seçiminde ve "Bulundu" halkasında). */
export function faultSpot(fault: Fault): Spot {
  switch (fault.kind) {
    case 'open':
    case 'short':
      return fault.at;
    default:
      return { part: fault.part, pin: 0 };
  }
}

/** Arıza belgeyle uyumlu mu: andığı parça, bacak ve kablolar var, tür parçaya uygun. */
export function faultValid(fault: Fault, doc: CircuitDoc): boolean {
  const spotOk = (s: Spot): boolean => {
    if ('part' in s) {
      const part = doc.parts.find((p) => p.id === s.part);
      return part !== undefined && Number.isInteger(s.pin) && s.pin >= 0 && s.pin < pinPositions(part).length;
    }
    return doc.wires.some((w) => w.id === s.wire);
  };
  switch (fault.kind) {
    case 'open':
      return spotOk(fault.at) && ('part' in fault.at || fault.at.end === 0 || fault.at.end === 1);
    case 'short':
      return spotOk(fault.at) && spotOk(fault.to);
    default: {
      const part = doc.parts.find((p) => p.id === fault.part);
      if (!part || !faultFits(fault.kind, part)) return false;
      return fault.kind !== 'value' || (Number.isFinite(fault.value) && fault.value > 0);
    }
  }
}
