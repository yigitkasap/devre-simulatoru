// "Tahta sütunu" (2026-11-16): bir parçanın bacağı başka bir parçanın aynı ağdaki bacağıyla aynı şeride doğrudan
// takılır; köprü teli yalnızca şeritte yer kalmayınca ya da bacak o şeride fiziksel olarak gelemeyince. 81 örnekte:
//   - köprü teli sayısı önce/sonra (önce: main be97340'ın planı; hiçbir örnekte artmaz);
//   - "aynı şeride takılabilecekken köprüyle bağlanmış" bacak yok: hiçbir parça, tek başına başka bir yere taşınınca
//     aynı şeritte buluşan bacak sayısı artacak biçimde yerleştirilmemiş (planlayıcıdan bağımsız kaba kuvvet arama);
//   - BF245A'lı FET yükselteçlerinde RG gate şeridinde, RD drain şeridinde, RS varsa source şeridinde.
// Netlistin şemayla aynı olduğu (tahta-duzen), parçaların çakışmadığı (tezgah-sade, yuvarlak-govde) ve Tahtada kur'un
// planı sorunsuz kabul ettiği (tahta-denetle) kendi testlerinde.
// FOY_KOPRU ortam değişkeni verilirse örnek başına önce/sonra sayılar o dosyaya yazılır (rapor için).

import { describe, expect, it } from 'vitest';
import { LEG_ORDER, dipShape, mountOf, planBreadboard, planSpan, shadeRows, type BreadboardPlan, type Hole } from '../src/bench3d/breadboard';
import { transistorPackage } from '../src/bench3d/dimensions';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { pinKey } from '../src/model/connectivity';
import type { CircuitDoc, Part } from '../src/model/types';
import { legRange } from '../src/tahta/rules';

/** main be97340'ın planında örnek başına köprü teli sayısı (şerit–şerit, şerit–ray, ray–ray). */
const BEFORE: Record<string, number> = {"led-on-direnc":0,"gerilim-bolucu":0,"voltmetre-yukleme":0,"ampermetre-etkisi":0,"rc-dolma":0,"rc-kare-dalga":0,"rl-devresi":0,"bobin-serbest-gecis":1,"diyot-yonu":0,"akim-kaynagi-ohm":1,"toprak-tuzagi":2,"transformator":0,"adaptor":4,"transformator-dc":0,"role":0,"role-transistor":2,"role-muhurleme":2,"dc-motor":0,"motor-jenerator":1,"motor-h-koprusu":1,"potansiyometre":1,"ldr-gece-lambasi":3,"ntc-termometre":0,"lamba-ani-akim":0,"hoparlor":0,"buzzer-sicaklik":3,"sigorta":0,"opamp-evirmeyen":4,"opamp-eviren":3,"opamp-karsilastirici":11,"555-astabil":14,"555-monostabil":16,"555-ses":13,"7805-besleme":6,"lm317-ayarli":3,"optokuplor-led":3,"ve-kapisi":18,"nand-kapilar":20,"yarim-toplayici":30,"sr-mandal":19,"frekans-bolucu":22,"yuruyen-isik":33,"bcd-7-segment":31,"ard-blink":0,"ard-dugme":0,"ard-sayac":0,"ard-trafik-isigi":4,"ard-fade":0,"ard-potansiyometre":1,"ard-gece-lambasi":0,"ard-termometre":0,"ard-pwm-filtre":0,"ard-melodi":0,"ard-role":2,"diyot-dc":0,"diyot-karakteristigi":0,"zener-karakteristigi":0,"led-karakteristigi":0,"schottky-1n4001":2,"yarim-dalga":8,"kopru-dogrultmac":3,"kopru-diyot":3,"negatif-kenetleyici":1,"pozitif-kenetleyici":2,"gerilim-katlayici":2,"seri-kirpici":0,"paralel-kirpici":0,"cift-kirpici":1,"alt-kirpici":1,"jfet-karakteristik":1,"fet-yukseltec":2,"fet-yukseltec-kuplajli":1,"bjt-yukseltec":2,"bjt-yukseltec-kuplajli":2,"mosfet-yukseltec":2,"mosfet-yukseltec-rs":1,"bjt-anahtar":3,"bjt-anahtar-emetor":1,"tristor-mandal":4,"baraj-cubuk":20,"baraj-tek-isik":25};

/** Bir şeride takılabilecek en çok parça bacağı: şeritte 5 delik var, biri (ağın alet kablosu çoksa ikisi) kabloya kalır. */
const MAX_LEGS = 4;
const FIRST = 2;

type Strip = Hole & { kind: 'strip' };
const halfOf = (h: Strip) => (h.row >= 5 ? 1 : 0);
const stripKey = (b: number, half: number, col: number) => `${b}:${half}:${col}`;
const cellKey = (b: number, row: number, col: number) => `${b}:${row}:${col}`;

/** Sıralı bacaklı (şekli serbest) parça: iki bacaklılar, transistör, trimpot, köprü diyot, TO-220. */
const movable = (part: Part) => {
  const mount = mountOf(part.type);
  return mount !== undefined && !dipShape(mount) && mount !== 'button' && mount !== 'seg10';
};

/** Parçanın denenen sütun dizilişleri (her pinin ilk bacağa göre sütunu). */
function shapes(part: Part): number[][] {
  const span = planSpan(part.type);
  if (span !== undefined) {
    const fixed = ['resistor', 'diode', 'schottky', 'zener', 'led', 'capacitor', 'ldr', 'ntc'].includes(part.type);
    const range = fixed ? legRange(part.type) : { min: span, max: span };
    const out: number[][] = [];
    for (let s = range.min; s <= range.max; s++) out.push([0, s], [s, 0]);
    return out;
  }
  const pins = part.type === 'bridge' ? 4 : 3;
  const physical = LEG_ORDER[part.type] ?? Array.from({ length: pins }, (_, i) => i);
  const forward: number[] = [];
  const backward: number[] = [];
  physical.forEach((pin, k) => {
    forward[pin] = k;
    backward[pin] = pins - 1 - k;
  });
  return [forward, backward];
}

/** Gövdenin kapladığı delikler: bacakların satır ve sütun aralığı; buzzer'da iki, TO-18'de öndeki komşu satır. */
function footprint(part: Part, holes: readonly Strip[]): string[] {
  if (holes.length === 0) return [];
  const rows = holes.map((h) => h.row);
  const cols = holes.map((h) => h.col);
  const buzzer = part.type === 'buzzer';
  const to18 = mountOf(part.type) === 'to92' && transistorPackage(typeof part.props.model === 'string' ? part.props.model : '') === 'to18';
  const r0 = Math.max(0, Math.min(...rows) - (buzzer ? 1 : 0));
  const r1 = Math.min(9, Math.max(...rows) + (buzzer || to18 ? 1 : 0));
  const out: string[] = [];
  for (let r = r0; r <= r1; r++) {
    if ((buzzer || to18) && (r >= 5) !== (rows[0]! >= 5)) continue;
    for (let c = Math.min(...cols); c <= Math.max(...cols); c++) out.push(cellKey(holes[0]!.board, r, c));
  }
  return out;
}

/** Yüksek parçanın gölgesi (kamera önden bakar): arkasındaki satırlar (shadeRows: yüksekliğe göre 0–2). */
function shadeOf(part: Part, holes: readonly Strip[]): string[] {
  if (holes.length === 0) return [];
  const behind = shadeRows(part);
  const row = Math.min(...holes.map((h) => h.row));
  const out: string[] = [];
  // Kollu anahtarın önündeki satır da (gövdesi geniş ve kısa).
  const front = part.type === 'switch' ? 1 : 0;
  for (let r = row - behind; r <= row + front; r++) {
    if (r === row) continue;
    if (r < 0 || (r >= 5) !== (row >= 5)) continue;
    for (let c = Math.min(...holes.map((h) => h.col)); c <= Math.max(...holes.map((h) => h.col)); c++) out.push(cellKey(holes[0]!.board, r, c));
  }
  return out;
}

/** Gövdenin ortası: eksenli parçada bacakların arası, öbürlerinde bütün kapsam (gölgeye yalnızca bacak ucu girer). */
function middleOf(part: Part, holes: readonly Strip[]): string[] {
  if (holes.length === 0) return [];
  const lo = Math.min(...holes.map((h) => h.col));
  const hi = Math.max(...holes.map((h) => h.col));
  // Kısa açıklıklı eksenli parçanın (anahtar) gövdesi bacaklarına kadar uzanır.
  if (mountOf(part.type) !== 'axial' || hi - lo <= 2) return footprint(part, holes);
  const out: string[] = [];
  for (let c = lo + 1; c < hi; c++) out.push(cellKey(holes[0]!.board, holes[0]!.row, c));
  return out;
}

interface Board {
  /** Şerit → ağ. */
  readonly net: Map<string, string>;
  /** Şeritteki parça bacakları. */
  readonly legs: Map<string, number>;
  /** Dolu delikler (bacak, alet kablosu, köprü ucu). */
  readonly used: Set<string>;
  /** Gövdelerin kapladığı delikler. */
  readonly cells: Map<string, string>;
  /** Ampermetrenin girdiği yerdeki boş şerit. */
  readonly gaps: Set<string>;
  /** Yüksek parçaların gölgeleri ve gövdelerin ortaları ([delik, parça]). */
  readonly shade: Array<[string, string]>;
  readonly middle: Array<[string, string]>;
}

function boardOf(doc: CircuitDoc, plan: BreadboardPlan): Board {
  const net = new Map<string, string>();
  const legs = new Map<string, number>();
  const used = new Set<string>();
  const cells = new Map<string, string>();
  const shade: Array<[string, string]> = [];
  const middle: Array<[string, string]> = [];
  const strip = (h: Hole, n: string | null) => {
    if (h.kind !== 'strip') return;
    used.add(cellKey(h.board, h.row, h.col));
    if (n !== null) net.set(stripKey(h.board, halfOf(h), h.col), n);
  };
  for (const part of doc.parts) {
    const at = plan.onBoard.get(part.id);
    if (!at) continue;
    at.holes.forEach((h, pin) => {
      strip(h, plan.netOf.get(pinKey(part.id, pin))!);
      if (h.kind === 'strip') legs.set(stripKey(h.board, halfOf(h), h.col), (legs.get(stripKey(h.board, halfOf(h), h.col)) ?? 0) + 1);
    });
    for (const h of at.extraHoles ?? []) strip(h, null);
    for (const k of footprint(part, [...at.holes, ...(at.extraHoles ?? [])].filter((h): h is Strip => h.kind === 'strip'))) cells.set(k, part.id);
    const own = at.holes.filter((h): h is Strip => h.kind === 'strip');
    for (const k of shadeOf(part, own)) shade.push([k, part.id]);
    for (const k of middleOf(part, own)) middle.push([k, part.id]);
  }
  for (const l of plan.leads) strip(l.hole, l.net);
  for (const j of plan.jumpers) {
    strip(j.a, j.net);
    strip(j.b, j.net);
  }
  // Ampermetrenin iki ucu aynı yarıda iki sütun arayla: aradaki şerit boş kalır.
  const gaps = new Set<string>();
  for (const part of doc.parts) {
    if (part.type !== 'ammeter' && !(part.type === 'multimeter' && part.props.mode === 'a')) continue;
    const ends = plan.leads.filter((l) => l.partId === part.id).map((l) => l.hole).filter((h): h is Strip => h.kind === 'strip');
    if (ends.length === 2 && ends[0]!.board === ends[1]!.board && halfOf(ends[0]!) === halfOf(ends[1]!) && Math.abs(ends[0]!.col - ends[1]!.col) === 2) {
      gaps.add(stripKey(ends[0]!.board, halfOf(ends[0]!), (ends[0]!.col + ends[1]!.col) / 2));
    }
  }
  return { net, legs, used, cells, gaps, shade, middle };
}

/** Şeritlerde buluşan bacak sayısı: her şeritte parça bacağı − 1 (köprüsüz kurulan bağlantılar). */
const sharedLegs = (legs: ReadonlyMap<string, number>) => [...legs.values()].reduce((n, k) => n + Math.max(0, k - 1), 0);

/** Ağın şeridinde kablolara kalan delik: ağın alet kabloları ve raya inen köprüsü (en az 1, en çok 2). */
function reserveOf(plan: BreadboardPlan, doc: CircuitDoc): (net: string) => number {
  const arduino = new Set(doc.parts.filter((p) => p.type === 'arduino').map((p) => p.id));
  const leads = new Map<string, number>();
  for (const l of plan.leads) if (!arduino.has(l.partId)) leads.set(l.net, (leads.get(l.net) ?? 0) + 1);
  const railed = new Set(plan.jumpers.filter((j) => (j.a.kind === 'rail') !== (j.b.kind === 'rail')).map((j) => j.net));
  return (net) => Math.min(2, Math.max(1, (leads.get(net) ?? 0) + (railed.has(net) ? 1 : 0)));
}

/**
 * Parçanın bacaklarından birini aynı ağın başka bir şeridine takan ve ortak bacak sayısını arttıran yer (yoksa null).
 * Parça tahtadan kaldırılır; öbür her şey (parçalar, alet kabloları, köprüler) yerinde kalır.
 */
function betterSpot(plan: BreadboardPlan, board: Board, part: Part, reserve: (net: string) => number): string | null {
  const at = plan.onBoard.get(part.id)!;
  const holes = at.holes.filter((h): h is Strip => h.kind === 'strip');
  if (holes.length !== at.holes.length) return null;
  const nets = at.holes.map((_, pin) => plan.netOf.get(pinKey(part.id, pin))!);
  const legs = new Map(board.legs);
  for (const h of holes) legs.set(stripKey(h.board, halfOf(h), h.col), legs.get(stripKey(h.board, halfOf(h), h.col))! - 1);
  const used = new Set(board.used);
  for (const h of holes) used.delete(cellKey(h.board, h.row, h.col));
  const before = sharedLegs(board.legs);
  // Parçanın kendi şeritleri boşalıyorsa (yalnızca o parçanın bacağı) o şerit artık boş sütundur.
  const ownOnly = new Set(holes.filter((h) => legs.get(stripKey(h.board, halfOf(h), h.col)) === 0 && [0, 1, 2, 3, 4].every((r) => {
    const row = halfOf(h) * 5 + r;
    return !used.has(cellKey(h.board, row, h.col));
  })).map((h) => stripKey(h.board, halfOf(h), h.col)));
  for (const shape of shapes(part)) {
    for (const [key, n] of board.net) {
      const [b, half, col] = key.split(':').map(Number) as [number, number, number];
      for (let pin = 0; pin < nets.length; pin++) {
        if (nets[pin] !== n) continue;
        const c0 = col - shape[pin]!;
        const cols = shape.map((o) => c0 + o);
        if (Math.min(...cols) < FIRST || Math.max(...cols) > plan.cols - 1) continue;
        for (let r = half * 5; r < half * 5 + 5; r++) {
          const trial = cols.map((c) => ({ kind: 'strip' as const, board: b, col: c, row: r }));
          if (footprint(part, trial).some((k) => (board.cells.has(k) && board.cells.get(k) !== part.id) || (used.has(k) && !trial.some((t) => cellKey(t.board, t.row, t.col) === k)))) continue;
          // Yüksek parçanın gölgesine gövdenin ortası girmez; kendi gölgesi başka bir gövdenin ortasına düşmez.
          const shaded = new Set(board.shade.filter(([, id]) => id !== part.id).map(([k]) => k));
          const middles = new Set(board.middle.filter(([, id]) => id !== part.id).map(([k]) => k));
          if (middleOf(part, trial).some((k) => shaded.has(k)) || shadeOf(part, trial).some((k) => middles.has(k))) continue;
          let ok = true;
          const next = new Map(legs);
          cols.forEach((c, k) => {
            if (!ok) return;
            const sk = stripKey(b, half, c);
            if (used.has(cellKey(b, r, c)) || board.gaps.has(sk)) ok = false;
            else if (board.net.has(sk) && !ownOnly.has(sk)) {
              const count = legs.get(sk) ?? 0;
              if (board.net.get(sk) !== nets[k] || count >= Math.min(MAX_LEGS, 5 - reserve(nets[k]!))) ok = false;
            }
            if (ok) next.set(sk, (next.get(sk) ?? 0) + 1);
          });
          if (!ok) continue;
          if (sharedLegs(next) > before) return `${part.label} → ${cols.map((c) => `${c}${'abcdefghij'[r]}`).join(' ')}`;
        }
      }
    }
  }
  return null;
}

const all = EXAMPLE_IDS.map((id) => {
  const doc = exampleDoc(id)!;
  return { id, doc, plan: planBreadboard(doc) };
});

describe('Tahta sütunu: bacaklar aynı ağın şeridine doğrudan', () => {
  it('köprü teli sayısı önce/sonra: hiçbir örnekte artmaz, toplamda belirgin azalır', async () => {
    const rows = all.map(({ id, plan }) => {
      const kind = (j: (typeof plan.jumpers)[number]) => [j.a.kind, j.b.kind].sort().join('-');
      return { id, before: BEFORE[id]!, after: plan.jumpers.length, stripToStrip: plan.jumpers.filter((j) => kind(j) === 'strip-strip').length };
    });
    expect(rows.length).toBe(Object.keys(BEFORE).length);
    expect(rows.filter((r) => r.after > r.before).map((r) => `${r.id}: ${r.before} → ${r.after}`)).toEqual([]);
    const before = rows.reduce((s, r) => s + r.before, 0);
    const after = rows.reduce((s, r) => s + r.after, 0);
    expect(before).toBe(361);
    expect(after).toBeLessThan(before * 0.7);
    const out = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOY_KOPRU;
    if (out) {
      const fs = (await import('node:fs' as string)) as { writeFileSync(p: string, d: string): void };
      fs.writeFileSync(out, JSON.stringify(rows, null, 1));
    }
  });

  it('aynı şeride takılabilecekken köprüyle bağlanmış bacak yok: hiçbir parça, taşınınca şeritte buluşan bacak sayısı (köprüsüz bağlantı) artacak bir yerde değil (81 örnek)', { timeout: 120_000 }, () => {
    const bad: string[] = [];
    let checked = 0;
    for (const { id, doc, plan } of all) {
      const board = boardOf(doc, plan);
      const reserve = reserveOf(plan, doc);
      for (const part of doc.parts) {
        if (!plan.onBoard.has(part.id) || !movable(part)) continue;
        checked++;
        const spot = betterSpot(plan, board, part, reserve);
        if (spot) bad.push(`${id}: ${spot}`);
      }
    }
    expect(checked).toBeGreaterThan(250);
    expect(bad.slice(0, 40)).toEqual([]);
  });

  it('FET yükselteçleri (BF245A): RG gate şeridinde, RD drain şeridinde, RS source şeridinde; Deney 6 devresinde hiç köprü yok', () => {
    let fets = 0;
    for (const { id, doc, plan } of all) {
      const fet = doc.parts.find((p) => p.type === 'njfet' && plan.onBoard.has(p.id));
      if (!fet || !id.startsWith('fet-yukseltec')) continue;
      fets++;
      const strips = plan.onBoard.get(fet.id)!.holes as Strip[];
      // BF245A'nın pinleri: 0 drain, 1 gate, 2 source (sim/devices/jfet).
      const at = (pin: number) => stripKey(strips[pin]!.board, halfOf(strips[pin]!), strips[pin]!.col);
      const netOf = (p: Part, pin: number) => plan.netOf.get(pinKey(p.id, pin));
      // RD'nin bacağı drain, RG'ninki gate, RS'ninki source şeridinde (RG'nin öbür ucu toprakta: gate ile source
      // yan yana olduğu için iki bacağı da transistörün şeridine gelemez, en çok bir köprü).
      for (const [label, fetPin] of [['RD', 0], ['RG', 1], ['RS', 2]] as const) {
        const part = doc.parts.find((p) => p.label === label && plan.onBoard.has(p.id));
        if (!part) continue;
        const holes = plan.onBoard.get(part.id)!.holes as Strip[];
        const pin = [0, 1].find((k) => netOf(part, k) === netOf(fet, fetPin));
        expect(pin, `${id} ${label}`).toBeDefined();
        const h = holes[pin!]!;
        expect(stripKey(h.board, halfOf(h), h.col), `${id} ${label} → ${['D', 'G', 'S'][fetPin]}`).toBe(at(fetPin));
      }
      expect(plan.jumpers.filter((j) => j.a.kind === 'strip' && j.b.kind === 'strip').length, id).toBeLessThanOrEqual(id === 'fet-yukseltec' ? 0 : 1);
    }
    expect(fets).toBeGreaterThanOrEqual(2);
  });
});
