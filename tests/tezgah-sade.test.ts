// 3B tezgâh, "okunurluk önce" (2026-11-12): parçalar sade, tanınır ve birbirine değmez. Bütün örnekler (81).
//   1. Ayak izi: tahtadaki her parçanın gövdesi, bacaklarının kapladığı deliklerin her yönde en çok yarım delik
//      (1,27 mm) ötesine taşar; yüksekliği en çok 4 delik aralığı (kondansatörde 6).
//   2. Çakışma yok: hiçbir iki parçanın gövde kutusu birbirine değmez (tahtadakiler, masadakiler, direkler).
//   3. Tahta dışı parçalar tahtanın solunda ya da sağında (önünde değil); en büyük boyutları yarım boy tahtanın
//      genişliğinin dörtte birini geçmez (cihazlar ve Arduino dışında).
//   4. Bağlantı direkleri: bağlı her alet ucuna bir direk ("tahta düzeni", 2026-11-14; ayrıntısı tahta-duzen.test.ts),
//      plakanın arka kenarında; cihaz kabloları yalnızca direklere gider; direkten o ucun deliğine bir tel; bir
//      delikte tek şey; teller ve köprüler hiçbir şeyin içinden geçmez.

import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { BB, SIDE_MAX, boardWidth, boardZ, holeXZ, isSidePart, planBreadboard, type BreadboardPlan, type Hole } from '../src/bench3d/breadboard';
import { JUMPER_RADIUS, jumperLift } from '../src/bench3d/breadboardModel';
import { boardPrims, primsOverlap, type BoardBody, type Prim } from '../src/bench3d/jumpers';
import { CABLE, INSTRUMENTS, POST, POST_WIRE, holesUsed, instrumentLeads, layoutPosts, plateRect, postKey } from '../src/bench3d/posts';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildFromPlan } from '../src/model/build';
import type { CircuitDoc } from '../src/model/types';
import { planFromBuild } from '../src/tahta/plan';

// Modeller yazı dokusu çizer: düğümde boş bir tuval yeter (yalnızca geometri gerekir).
const ctx2d: unknown = new Proxy(
  {},
  {
    get: (_t, key) =>
      key === 'measureText' ? () => ({ width: 10 }) : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined,
    set: () => true,
  },
);
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

const { placeBoardPart, placeTablePart } = await import('../src/bench3d/placement');

/** Yarım delik (birim) ve değmeme payı. */
const HALF = 0.5;
const EPS = 1e-6;
/** En çok yükseklik (kartın üstünden, birim): 4 delik aralığı; kondansatörde 6. */
const heightLimit = (type: string) => (type === 'capacitor' ? 6 : 4);

interface Placed {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly onBoard: boolean;
  readonly body: Box3;
  readonly box: Box3;
  readonly holes: Vector3[];
}

function place(doc: CircuitDoc, plan: BreadboardPlan): Placed[] {
  const out: Placed[] = [];
  for (const part of doc.parts) {
    const at = plan.onBoard.get(part.id);
    const table = plan.table.get(part.id);
    if (at) {
      const p = placeBoardPart(part, at, plan.cols);
      const holes = [...at.holes, ...(at.extraHoles ?? [])].map((h) => {
        const { x, z } = holeXZ(h, plan.cols);
        return new Vector3(x, BB.height, z);
      });
      out.push({ id: part.id, label: part.label, type: part.type, onBoard: true, body: p.body, box: p.box, holes });
    } else if (table) {
      const p = placeTablePart(part, table);
      out.push({ id: part.id, label: part.label, type: part.type, onBoard: false, body: p.box, box: p.box, holes: [] });
    }
  }
  return out;
}

/** İki kutu birbirine değiyor ya da iç içe mi (aralarında boşluk yoksa). */
const touch = (a: Box3, b: Box3) => a.min.x <= b.max.x + EPS && b.min.x <= a.max.x + EPS && a.min.y <= b.max.y + EPS && b.min.y <= a.max.y + EPS && a.min.z <= b.max.z + EPS && b.min.z <= a.max.z + EPS;

const docs = EXAMPLE_IDS.map((id) => {
  const doc = exampleDoc(id)!;
  const plan = planBreadboard(doc);
  return { id, doc, plan, parts: place(doc, plan), posts: layoutPosts(doc, plan) };
});

describe('3B: okunurluk önce', () => {
  it('ayak izi: tahtadaki parçanın gövdesi bacak deliklerinin her yönde en çok yarım delik ötesine taşar; yükseklik en çok 4 delik (kondansatör 6)', () => {
    const bad: string[] = [];
    for (const { id, parts } of docs) {
      for (const p of parts) {
        if (!p.onBoard) continue;
        const holes = new Box3().setFromPoints(p.holes);
        const over = Math.max(holes.min.x - p.body.min.x, p.body.max.x - holes.max.x, holes.min.z - p.body.min.z, p.body.max.z - holes.max.z);
        const height = p.body.max.y - BB.height;
        if (over > HALF + EPS) bad.push(`${id} ${p.label} (${p.type}): gövde deliklerden ${(over * 2.54).toFixed(2)} mm taşıyor`);
        if (height > heightLimit(p.type) + EPS) bad.push(`${id} ${p.label} (${p.type}): ${height.toFixed(2)} delik yüksek`);
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
  });

  it('çakışma yok: hiçbir iki parçanın gövde kutusu birbirine değmez (81 örnek; tahtadakiler, masadakiler, direkler)', () => {
    const bad: string[] = [];
    for (const { id, parts, posts, plan } of docs) {
      const boxes = parts.map((p) => ({ name: `${p.label} (${p.type})`, box: p.body }));
      for (const post of posts.posts) {
        boxes.push({ name: `direk ${post.name}`, box: new Box3(new Vector3(post.x - POST.radius - 0.18, 0, post.z - POST.radius - 0.18), new Vector3(post.x + POST.radius + 0.18, POST.top, post.z + POST.radius + 0.18)) });
      }
      // Tahtanın kendisi: masadaki parçalar plakanın dışında durur.
      const plate = plateRect(plan.cols, boardZ(plan.boards - 1) + BB.depth / 2);
      const plateBox = new Box3(new Vector3(plate.x0, 0, plate.z0), new Vector3(plate.x1, BB.height, plate.z1));
      for (const p of parts) if (!p.onBoard && touch(p.box, plateBox)) bad.push(`${id}: ${p.label} (${p.type}) taban plakasına değiyor`);
      for (let i = 0; i < boxes.length; i++) {
        for (let k = i + 1; k < boxes.length; k++) {
          if (touch(boxes[i]!.box, boxes[k]!.box)) bad.push(`${id}: ${boxes[i]!.name} ↔ ${boxes[k]!.name}`);
        }
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
  });

  it('tahta dışı parçalar ve Arduino tahtanın solunda ya da sağında, ön kenarını geçmez (81 örnek); en büyük boyutları tahta genişliğinin dörtte birini geçmez', () => {
    expect(SIDE_MAX).toBeLessThanOrEqual(boardWidth(30) / 4);
    const bad: string[] = [];
    for (const { id, parts, plan } of docs) {
      const half = boardWidth(plan.cols) / 2;
      const front = boardZ(plan.boards - 1) + BB.depth / 2;
      for (const p of parts) {
        if (p.onBoard) continue;
        const size = p.box.getSize(new Vector3());
        const center = p.box.getCenter(new Vector3());
        if (INSTRUMENTS.has(p.type as never)) {
          // Cihazlar arkada (tahtanın arka kenarının gerisinde).
          if (p.box.max.z > -BB.depth / 2) bad.push(`${id}: ${p.label} (${p.type}) tahtanın arka kenarının önüne taşıyor`);
          continue;
        }
        if (Math.abs(center.x) < half) bad.push(`${id}: ${p.label} (${p.type}) tahtanın yanında değil`);
        // Tahta dışı parçalar ve Arduino hiçbir zaman tahtanın önünde (kameraya bakan yanda) durmaz: gövdenin hiçbir
        // noktası ön kenarı geçmez (yanda ya da arkada).
        if (p.box.max.z > front + 0.05) bad.push(`${id}: ${p.label} (${p.type}) tahtanın ön kenarını ${(p.box.max.z - front).toFixed(2)} birim geçiyor`);
        if (isSidePart(p.type as never) && Math.max(size.x, size.y, size.z) > SIDE_MAX + 1e-3) bad.push(`${id}: ${p.label} (${p.type}) ${Math.max(size.x, size.y, size.z).toFixed(2)} birim`);
      }
    }
    expect(bad.slice(0, 40)).toEqual([]);
  });

  it('bağlantı direkleri: bağlı her alet ucuna bir direk, plakanın arka kenarında bir sırada; kablolar yalnızca direklere', () => {
    let total = 0;
    for (const { id, doc, plan, posts } of docs) {
      const leads = instrumentLeads(doc, plan);
      // Her alet ucunun kendi direği ve kendi kablosu (direkte tek fiş).
      expect(posts.posts.map((p) => postKey(p)).sort(), id).toEqual(leads.map((i) => `${plan.leads[i]!.partId}#${plan.leads[i]!.pin}`).sort());
      total += posts.posts.length;
      expect(posts.cables.length, id).toBe(leads.length);
      posts.cables.forEach((c, k) => {
        const post = posts.posts[c.post]!;
        expect([post.partId, post.pin, post.net, c.level, c.post], id).toEqual([c.partId, c.pin, c.net, 0, k]);
      });
      // Bir sırada, arka kenarın gerisinde, plakanın içinde; soldan sağa tellerinin sırasıyla; aralık en az POST.tight.
      const plate = plateRect(plan.cols, boardZ(plan.boards - 1) + BB.depth / 2);
      for (const p of posts.posts) {
        expect(p.z, id).toBeCloseTo(-BB.depth / 2 - POST.behind, 6);
        expect(p.x - POST.radius, id).toBeGreaterThan(plate.x0);
        expect(p.x + POST.radius, id).toBeLessThan(plate.x1);
        expect(p.z - POST.radius, id).toBeGreaterThan(plate.z0);
        expect(p.name.length, `${id} ${p.name}`).toBeGreaterThan(0);
        expect(p.name.length, `${id} ${p.name}`).toBeLessThanOrEqual(10);
      }
      for (let k = 1; k < posts.posts.length; k++) expect(posts.posts[k]!.x - posts.posts[k - 1]!.x, id).toBeGreaterThanOrEqual(POST.tight - 1e-9);
      // Adlar örnek içinde tekil.
      expect(new Set(posts.posts.map((p) => p.name)).size, `${id}: ${posts.posts.map((p) => p.name).join(', ')}`).toBe(posts.posts.length);
    }
    expect(total).toBeGreaterThan(380);
  });

  it('renkler: toprak kabloları siyah; güç kaynağı + ve üreteç çıkışı kırmızı; osiloskop CH1 sarı, CH2 mavi; tel direğinin renginde', () => {
    let checked = 0;
    for (const { id, doc, plan, posts } of docs) {
      const parts = new Map(doc.parts.map((p) => [p.id, p]));
      for (const c of posts.cables) {
        const part = parts.get(c.partId)!;
        const ground = plan.roles.get(c.net) === 'ground';
        const want = ground
          ? CABLE.black
          : part.type === 'oscilloscope'
            ? [CABLE.yellow, CABLE.blue, CABLE.black][c.pin]
            : part.type === 'funcgen'
              ? [CABLE.red, CABLE.orange, CABLE.black][c.pin]
              : part.type === 'dcsupply'
                ? [CABLE.red, CABLE.black][c.pin % 2]
                : [CABLE.red, CABLE.black, CABLE.green, CABLE.purple, CABLE.white][c.pin];
        expect(c.color, `${id} ${part.label} uç ${c.pin}`).toBe(want);
        checked++;
      }
      for (const w of posts.wires) expect(w.color, id).toBe(posts.posts[w.post]!.color);
      for (const p of posts.posts) if (plan.roles.get(p.net) === 'ground') expect(p.color, id).toBe(CABLE.black);
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('direkten tahtaya tel: direk başına bir tel, o ucun deliğine, kartın hemen üstünde; izler arka kanala sığar; köprüler ince ve alçak', () => {
    expect(POST_WIRE.radius * 2 * 2.54).toBeLessThanOrEqual(0.65);
    expect(JUMPER_RADIUS * 2 * 2.54).toBeLessThanOrEqual(0.65);
    // En uzun köprü (30 delik) bile kartın 5 mm üstünü geçmez; kısa köprü 1 mm.
    expect(jumperLift(new Vector3(0, 0, 0), new Vector3(30, 0, 0)) * 2.54).toBeLessThanOrEqual(5);
    expect(jumperLift(new Vector3(0, 0, 0), new Vector3(2, 0, 0)) * 2.54).toBeLessThanOrEqual(1.1);
    let total = 0;
    for (const { id, plan, posts } of docs) {
      expect(posts.wires.length, id).toBe(posts.posts.length);
      posts.wires.forEach((w, k) => {
        const post = posts.posts[k]!;
        expect(w.post, id).toBe(k);
        // Tel, planın o alet ucuna verdiği deliğe gider.
        const lead = plan.leads[w.leads[0]!]!;
        expect([lead.partId, lead.pin], `${id} ${post.name}`).toEqual([post.partId, post.pin]);
        expect(w.hole, `${id} ${post.name}`).toEqual(lead.hole);
        const pts = w.points;
        // Yatık: kartın en çok 1 mm üstünde.
        expect(Math.max(...pts.map((p) => p.y)) - BB.height, id).toBeLessThanOrEqual(0.4);
        const length = pts.slice(1).reduce((sum, b, i) => sum + b.distanceTo(pts[i]!), 0);
        expect(length, `${id} ${post.name}`).toBeLessThanOrEqual(POST.behind + BB.depth + boardWidth(plan.cols) / 2);
        // İz, direklerin tabanı ile tahtanın arka kenarı arasındaki kanalın içinde (kalabalık devrede izler arası
        // aralık daralır; tellerin üst üste binmediğini çakışma testi denetler).
        expect(Math.min(...pts.slice(1).map((p) => p.z)), `${id} ${post.name}: iz ${w.track}`).toBeGreaterThanOrEqual(post.z + POST.radius + 0.45 - 1e-9);
        total++;
      });
    }
    expect(total).toBeGreaterThan(380);
  });

  it('bir delikte tek şey; teller, köprüler, fişler ve parça gövdeleri birbirinin içine girmez (81 örnek)', () => {
    const bad: string[] = [];
    for (const { id, doc, plan, parts, posts } of docs) {
      const used = holesUsed(doc, plan, posts);
      if (new Set(used).size !== used.length) bad.push(`${id}: bir delikte iki şey`);
      const bodies = new Map<string, BoardBody>(parts.filter((p) => p.onBoard).map((p) => [p.id, { body: p.body }]));
      const wires = posts.wires.map((w) => w.points);
      const prims = boardPrims(plan, bodies, new Set(instrumentLeads(doc, plan)), undefined, wires);
      const hits = new Set<string>();
      for (let i = 0; i < prims.length; i++) {
        for (let k = i + 1; k < prims.length; k++) {
          const a: Prim = prims[i]!;
          const b: Prim = prims[k]!;
          if (a.owner === b.owner) continue;
          // Parça gövdeleri arasındaki boşluk ayrı testte; burada teller, köprüler ve fişler.
          if (a.owner.startsWith('part:') && b.owner.startsWith('part:')) continue;
          if (primsOverlap(a, b)) hits.add(`${a.owner} ↔ ${b.owner}`);
        }
      }
      for (const h of hits) bad.push(`${id}: ${h}`);
    }
    expect(bad.slice(0, 40)).toEqual([]);
  });

  it('tahta dışı parçaların (pil, motor, röle…) kabloları da direklere gider; deliğe doğrudan giden yalnızca Arduino’nun telleri', () => {
    let side = 0;
    for (const { id, doc, plan, posts } of docs) {
      const types = new Map(doc.parts.map((p) => [p.id, p.type]));
      const cabled = new Set(posts.cables.map((c) => `${c.partId}#${c.pin}`));
      for (const lead of plan.leads) {
        const type = types.get(lead.partId)!;
        if (type === 'arduino') {
          expect(cabled.has(`${lead.partId}#${lead.pin}`), `${id} Arduino`).toBe(false);
          continue;
        }
        expect(cabled.has(`${lead.partId}#${lead.pin}`), `${id} ${type} uç ${lead.pin}`).toBe(true);
        if (isSidePart(type)) side++;
      }
    }
    expect(side).toBeGreaterThan(60);
  });

  it('direklerin açık adı: kısa adın yanında cihazın ya da parçanın etiketi, türü ve ucun açık adı (dokununca ya da üstüne gelince görünür)', () => {
    const titles = new Map<string, string>();
    for (const { id, posts } of docs) {
      for (const p of posts.posts) {
        expect(p.title.length, `${id} ${p.name}`).toBeGreaterThan(p.name.length);
        expect(p.title, `${id} ${p.name}`).toContain(' · ');
        titles.set(`${id}:${p.name}`, p.title);
      }
      // Açık adlar da örnek içinde tekil.
      expect(new Set(posts.posts.map((p) => p.title)).size, id).toBe(posts.posts.length);
    }
    expect(titles.get('role:K1 NA')).toBe('K1 röle · normalde açık uç');
    expect(titles.get('role:K1 NK')).toBe('K1 röle · normalde kapalı uç');
    expect(titles.get('adaptor:T1 S1')).toBe('T1 trafo · sekonder 1');
    expect(titles.get('led-on-direnc:B1 −')).toBe('B1 pil · − uç');
    expect(titles.get('led-on-direnc:B1 +')).toBe('B1 pil · + uç (5 V)');
    expect(titles.get('role-transistor:PS1 +')).toBe('PS1 güç kaynağı · + çıkış (12 V)');
    expect(titles.get('toprak-tuzagi:FG1 OUT')).toBe('FG1 fonksiyon üreteci · çıkış (OUT)');
    expect(titles.get('rc-kare-dalga:CH1')).toBe('OSC1 osiloskop · 1. kanal (CH1)');
    expect(titles.get('diyot-dc:V1 +')).toBe('V1 voltmetre · + uç');
    expect(titles.get('diyot-dc:A1 −')).toBe('A1 ampermetre · − uç');
  });

  it('Tahtada kur kurulumu: direkler şemanın planındaki yerde; takılı her cihaz kablosu için direkten o deliğe bir tel', () => {
    let wires = 0;
    for (const { id, doc, plan, posts } of docs) {
      const build = buildFromPlan(plan);
      const built = planFromBuild(doc, build, plan);
      const layout = layoutPosts(doc, built, plan);
      expect(layout.posts, id).toEqual(posts.posts);
      const leads = instrumentLeads(doc, built);
      expect(layout.wires.length, id).toBe(leads.length);
      for (const w of layout.wires) expect(built.leads[w.leads[0]!]!.hole, id).toEqual(w.hole);
      wires += layout.wires.length;
      // Boş kurulum: bütün cihaz kabloları direğinde, tel yok.
      const empty = planFromBuild(doc, { ...build, parts: {}, wires: [], leads: [] }, plan);
      const loose = layoutPosts(doc, empty, plan);
      expect(loose.wires.length, id).toBe(0);
      expect(loose.cables.length, id).toBe(posts.cables.length);
      expect(loose.cables.every((c) => c.lead === null), id).toBe(true);
    }
    expect(wires).toBeGreaterThan(380);
  });
});

export type { Hole };
