// Tahtada kur, 2. aşama: kurulumdan netlist. Breadboard kuralları, takılmamış uçlar, sıfır düğümü ve
// bütün örneklerde planBreadboard yerleşimiyle Oynat'ın şemayla aynı sonucu vermesi.

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildFromPlan, emptyBuild, type Build } from '../src/model/build';
import { buildConnectivity, pinKey } from '../src/model/connectivity';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { boardCircuit, BOARD_GROUND_ID } from '../src/tahta/circuit';

const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;

describe('Tahtadaki bağlantılar', () => {
  /** Basit bir devre: 9 V pil (masada), R1 ve LED1 (tahtada), toprak. */
  const doc: CircuitDoc = exampleDoc('led-on-direnc')!;
  const plan = buildFromPlan(planBreadboard(doc));

  it('şeritte 5 delik bağlı, şeridin iki yarısı ayrı; raylar kesintisiz, dört ray ayrı', () => {
    const r = idOf(doc, 'R1');
    const node = (build: Build, pin: number) => boardCircuit(doc, build).nodeOf.get(pinKey(r, pin));
    const at = (a: string, b: string): Build => ({ ...emptyBuild(30), parts: { [r]: { holes: [a, b] } } });
    expect(node(at('5a', '5e'), 0)).toBe(node(at('5a', '5e'), 1));
    expect(node(at('5e', '5f'), 0)).not.toBe(node(at('5e', '5f'), 1));
    expect(node(at('5a', '6a'), 0)).not.toBe(node(at('5a', '6a'), 1));
    const rails = ['üst + rayı (2. sütun hizası)', 'üst + rayı (30. sütun hizası)'] as const;
    expect(node(at(rails[0], rails[1]), 0)).toBe(node(at(rails[0], rails[1]), 1));
    expect(node(at('üst + rayı (2. sütun hizası)', 'alt + rayı (2. sütun hizası)'), 0)).not.toBe(node(at('üst + rayı (2. sütun hizası)', 'alt + rayı (2. sütun hizası)'), 1));
    expect(node(at('üst + rayı (2. sütun hizası)', 'üst − rayı (2. sütun hizası)'), 0)).not.toBe(node(at('üst + rayı (2. sütun hizası)', 'üst − rayı (2. sütun hizası)'), 1));
    // Ara kablo iki iletkeni birleştirir.
    const wired: Build = { ...at('5a', '9a'), wires: [{ a: '5b', b: '9b', color: 'orange' }] };
    expect(node(wired, 0)).toBe(node(wired, 1));
  });

  it('takılmamış uç boşta kalır: kutudaki parçanın ve takılmamış alet kablosunun uçları', () => {
    const r = idOf(doc, 'R1');
    const b1 = idOf(doc, 'B1');
    const partial: Build = { ...plan, parts: Object.fromEntries(Object.entries(plan.parts).filter(([id]) => id !== r)), leads: plan.leads.filter((l) => l.part !== b1 || l.pin !== 0) };
    const c = boardCircuit(doc, partial);
    expect([...c.loosePins].sort()).toEqual([pinKey(b1, 0), pinKey(r, 0), pinKey(r, 1)].sort());
    const sim = new CircuitSimulator(c.netlist);
    expect(sim.runUntil(0.01).ok).toBe(true);
    expect(Math.abs(sim.measure(idOf(doc, 'LED1'))!.current)).toBeLessThan(1e-9);
    // Değerler şemadan gelir.
    expect(c.netlist.elements.find((e) => e.id === r)!.props).toEqual(doc.parts.find((p) => p.id === r)!.props);
  });

  it('basmalı düğmenin ikiz bacakları içten bağlı; DIP’in kullanılmayan bacakları hiçbir yere bağlı değil', () => {
    const tm = exampleDoc('tristor-mandal')!;
    const build = buildFromPlan(planBreadboard(tm));
    const bt = idOf(tm, 'BT1');
    const c = boardCircuit(tm, build);
    // İkiz bacağın şeridine takılan bir kablo ucu düğmenin o yanına bağlanır.
    const twin = build.parts[bt]!.extra![0]!;
    const near = twin.replace(/[a-j]$/, (r) => (r === 'd' ? 'a' : r === 'g' ? 'j' : r));
    const extra: Build = { ...build, parts: { ...build.parts, [idOf(tm, 'RG')]: { holes: [near, build.parts[idOf(tm, 'RG')]!.holes[1]!] } } };
    const c2 = boardCircuit(tm, extra);
    expect(c2.nodeOf.get(pinKey(idOf(tm, 'RG'), 0))).toBe(c2.nodeOf.get(pinKey(bt, 0)));
    expect(c.nodeOf.get(pinKey(bt, 0))).not.toBe(c.nodeOf.get(pinKey(bt, 1)));
    const op = exampleDoc('opamp-evirmeyen')!;
    const opBuild = buildFromPlan(planBreadboard(op));
    const u = op.parts.find((p) => p.type === 'opamp')!.id;
    const unused = opBuild.parts[u]!.extra!;
    expect(unused).toHaveLength(3);
    const opc = boardCircuit(op, opBuild);
    const nodes = new Set(opc.netlist.elements.find((e) => e.id === u)!.pins.map((pin) => opc.nodeOf.get(pin)));
    expect(nodes.size).toBe(5);
  });

  it('sıfır düğümü: şemada topraklı uçların tahtada en çok toplandığı düğüm', () => {
    const c = boardCircuit(doc, plan);
    const ground = c.netlist.elements.find((e) => e.id === BOARD_GROUND_ID)!;
    expect(ground.type).toBe('ground');
    // led-on-direnc: B1 − toprakta; tahtada B1 − kablosunun düğümü.
    expect(c.groundNode).toBe(c.nodeOf.get(pinKey(idOf(doc, 'B1'), 1)));
    // Topraklı uç takılmamışsa sıfır düğümü yok (motor kendi sıfır noktasını seçer).
    expect(boardCircuit(doc, emptyBuild(30)).groundNode).toBeNull();
  });
});

describe('Bütün örneklerde planBreadboard yerleşimi: Oynat şemayla aynı', { timeout: 120_000 }, () => {
  for (const id of EXAMPLE_IDS) {
    it(id, () => {
      const doc = exampleDoc(id)!;
      const build = buildFromPlan(planBreadboard(doc));
      const board = boardCircuit(doc, build);
      // Boşta kalan uçlar şemada da başka bir uca bağlı değil (Arduino'nun ikinci GND'si: tek kablo yeter).
      const { netlist } = buildConnectivity(doc);
      const groups = new Map<string, string>();
      const find = (k: string): string => (groups.get(k) && groups.get(k) !== k ? find(groups.get(k)!) : k);
      for (const l of netlist.links) groups.set(find(l.a), find(l.b));
      const pinsOfNet = new Map<string, number>();
      for (const el of netlist.elements) if (el.type !== 'ground') for (const pin of el.pins) pinsOfNet.set(find(pin), (pinsOfNet.get(find(pin)) ?? 0) + 1);
      const arduinoGnd = new Set(netlist.elements.filter((e) => e.type === 'arduino').flatMap((e) => [e.pins[2], e.pins[21]]));
      const lonely = (pin: string) => (pinsOfNet.get(find(pin)) ?? 0) <= 1 || arduinoGnd.has(pin);
      expect([...board.loosePins].filter((pin) => !lonely(pin)), id).toEqual([]);
      const a = new CircuitSimulator(buildConnectivity(doc).netlist);
      const b = new CircuitSimulator(board.netlist);
      const t = id.startsWith('ard-') ? 0.02 : 0.05;
      expect(a.runUntil(t).ok, id).toBe(true);
      expect(b.runUntil(t).ok, id).toBe(true);
      const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6 + 1e-4 * Math.max(Math.abs(x), Math.abs(y));
      for (const part of doc.parts) {
        if (part.type === 'ground') continue;
        const ma = a.measure(part.id);
        const mb = b.measure(part.id);
        if (!ma || !mb) continue;
        expect(close(ma.voltage, mb.voltage) && close(ma.current, mb.current), `${id} ${part.label}: ${ma.voltage} V ${ma.current} A ↔ ${mb.voltage} V ${mb.current} A`).toBe(true);
        const ra = a.status(part.id).reading;
        const rb = b.status(part.id).reading;
        if (ra !== undefined && rb !== undefined) expect(close(ra, rb), `${id} ${part.label} okuma`).toBe(true);
      }
    });
  }
});
