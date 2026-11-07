// Yeni çizilen kablonun, kullanıcının bıraktığı iki uç dışında kurduğu bağlantılar (beklenmeyen
// bağlantı). Kablonun köşesi bir uca ya da başka bir kablonun köşesine denk gelirse, başka bir kablonun
// ucu yeni kablonun üstünde kalırsa (T) devre fark ettirmeden değişir: ör. multimetre LED yerine pilin
// − ucunu ölçer, fonksiyon üretecinin çıkışı ortak uca kısa devre olur.

import { KeyedUnionFind } from '../sim/unionFind';
import { buildConnectivity, pinKey, wireKey } from './connectivity';
import { onSegmentInterior, pinPositions, samePoint } from './geometry';
import type { CircuitDoc, Point } from './types';

/** Belgenin ağları: parça uçları ve kablolar (anahtarlarıyla) aynı ağdaysa aynı kökte. */
function nets(doc: CircuitDoc): KeyedUnionFind {
  const uf = new KeyedUnionFind();
  const { netlist } = buildConnectivity(doc);
  for (const element of netlist.elements) for (const pin of element.pins) uf.add(pin);
  for (const link of netlist.links) uf.union(link.a, link.b);
  return uf;
}

/**
 * Kullanıcının bir kablo ucunu bıraktığı yerde bağlamak istediği şeyler: o noktadaki uçlar ve köşesi o
 * noktada olan kablolar; nokta bir uç değilse üstünden geçtiği kablo da (T). Bir ucun üstünden geçen
 * (ona bağlı olmayan) kablo istenmiş sayılmaz: uca bırakılan kablo onunla da T bağlantısı kurar.
 */
function keysAt(doc: CircuitDoc, p: Point): string[] {
  const keys: string[] = [];
  for (const part of doc.parts) pinPositions(part).forEach((q, i) => samePoint(q, p) && keys.push(pinKey(part.id, i)));
  const onPin = keys.length > 0;
  for (const wire of doc.wires) {
    const touches = wire.points.some((q, i) => samePoint(q, p) || (!onPin && i > 0 && onSegmentInterior(p, wire.points[i - 1]!, q)));
    if (touches) keys.push(wireKey(wire.id));
  }
  return keys;
}

/**
 * `after` = `before` + `wireId` kablosu. Kablonun iki ucundaki ağlar dışında, kabloyla aynı ağa katılan
 * (önceden ayrı) her ağın parça uçları (pinKey) bir grup olarak döner; boşsa beklenmeyen bağlantı yok.
 */
export function unexpectedLinks(before: CircuitDoc, after: CircuitDoc, wireId: string): string[][] {
  const wire = after.wires.find((w) => w.id === wireId);
  if (!wire || wire.points.length < 2) return [];
  const old = nets(before);
  const now = nets(after);
  const ends = [wire.points[0]!, wire.points[wire.points.length - 1]!];
  const intended = new Set(ends.flatMap((p) => keysAt(before, p)).map((key) => old.findKey(key)));
  const root = now.findKey(wireKey(wireId));
  const groups = new Map<string, string[]>();
  for (const part of after.parts) {
    pinPositions(part).forEach((_, i) => {
      const key = pinKey(part.id, i);
      if (!old.has(key) || now.findKey(key) !== root) return;
      const net = old.findKey(key);
      if (intended.has(net)) return;
      groups.set(net, [...(groups.get(net) ?? []), key]);
    });
  }
  return [...groups.values()];
}
