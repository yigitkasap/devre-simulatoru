// Çözücünün girdisi: bağlantı listesi (netlist).
//
// Çözücü geometri bilmez. Her bileşenin her pini bir "ağ anahtarı"na (string) bağlanır;
// aynı anahtarı paylaşan pinler aynı düğümdedir. Kablolar `links` ile iki anahtarı birleştirir
// (union-find); matrise eleman olarak girmez.

/** v1'de desteklenen bileşen türleri. Yeni bileşenler buraya ve devices/index.ts'e eklenir. */
export type DeviceType =
  | 'battery'
  | 'ground'
  | 'resistor'
  | 'capacitor'
  | 'diode'
  | 'led'
  | 'switch'
  | 'voltmeter'
  | 'ammeter';

export type PropValue = number | string | boolean;
export type Props = Readonly<Record<string, PropValue>>;

export interface NetlistElement {
  readonly id: string;
  readonly type: DeviceType;
  readonly props: Props;
  /** Pin sırası her bileşen türü için sabittir (ör. pil: [+, −]). */
  readonly pins: readonly string[];
}

export interface NetlistLink {
  readonly a: string;
  readonly b: string;
}

export interface Netlist {
  readonly elements: readonly NetlistElement[];
  readonly links: readonly NetlistLink[];
}

/** Toprak sembollerinin bağlandığı özel ağ anahtarı. */
export const GROUND_NET = '__toprak__';

// Özellik okuma yardımcıları: eksik ya da hatalı değerde varsayılanı döndürür.
export function numProp(props: Props, key: string, fallback: number): number {
  const v = props[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function boolProp(props: Props, key: string, fallback: boolean): boolean {
  const v = props[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function strProp<T extends string>(props: Props, key: string, allowed: readonly T[], fallback: T): T {
  const v = props[key];
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
