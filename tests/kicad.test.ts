// PCB aktarımı: her örnekte KiCad dosyası okunabilir, pedlerin ağları breadboard yerleşimiyle
// aynı, dışarı giden her tel bir klemens pedi, pedler kartın içinde ve birbirine değmiyor.

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { boardSize, boxOf, designPcb, kicadPcb, kicadProject, kicadZip, padNumber, slug } from '../src/bench3d/kicad';
import { crc32 } from '../src/bench3d/zip';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { pinKey } from '../src/model/connectivity';

type S = string | S[];

/** Küçük S-ifadesi okuyucu: parantezler dengeli değilse ya da tırnak kapanmamışsa hata verir. */
function parse(text: string): S {
  let i = 0;
  const skip = () => {
    while (i < text.length && /\s/.test(text[i]!)) i++;
  };
  const read = (): S => {
    skip();
    if (text[i] === '(') {
      i++;
      const list: S[] = [];
      for (;;) {
        skip();
        if (i >= text.length) throw new Error('kapanmamış parantez');
        if (text[i] === ')') {
          i++;
          return list;
        }
        list.push(read());
      }
    }
    if (text[i] === '"') {
      i++;
      let s = '';
      while (text[i] !== '"') {
        if (i >= text.length) throw new Error('kapanmamış tırnak');
        if (text[i] === '\\') i++;
        s += text[i++];
      }
      i++;
      return s;
    }
    const start = i;
    while (i < text.length && !/[\s()]/.test(text[i]!)) i++;
    if (start === i) throw new Error(`beklenmeyen karakter: ${text[i]}`);
    return text.slice(start, i);
  };
  const root = read();
  skip();
  if (i !== text.length) throw new Error('kökten sonra fazla metin');
  return root;
}

const lists = (s: S, head: string) => (Array.isArray(s) ? s.filter((c): c is S[] => Array.isArray(c) && c[0] === head) : []);
const one = (s: S, head: string) => lists(s, head)[0]!;
const num = (s: S | undefined) => Number(s);

interface Pad {
  ref: string;
  number: string;
  x: number;
  y: number;
  size: number;
  rect: boolean;
  npth: boolean;
  net: { code: number; name: string } | null;
}

function padsOf(root: S): Pad[] {
  return lists(root, 'footprint').flatMap((f) => {
    const at = one(f, 'at');
    const ref = lists(f, 'fp_text').find((t) => t[1] === 'reference')![2] as string;
    return lists(f, 'pad').map((p) => {
      const pos = one(p, 'at');
      const net = lists(p, 'net')[0];
      return {
        ref,
        number: p[1] as string,
        x: num(at[1]) + num(pos[1]),
        y: num(at[2]) + num(pos[2]),
        size: num(one(p, 'size')[1]),
        rect: p[3] === 'rect',
        npth: p[2] === 'np_thru_hole',
        net: net ? { code: num(net[1]), name: net[2] as string } : null,
      };
    });
  });
}

describe('PCB aktarımı (KiCad)', () => {
  it('CRC-32 bilinen değer', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('dosya adı Türkçe karakterleri sadeleştirir', () => {
    expect(slug('Çift kırpıcı: 555 ile ışık')).toBe('cift-kirpici-555-ile-isik');
    expect(slug('***')).toBe('devre');
  });

  for (const id of EXAMPLE_IDS) {
    it(`${id}: KiCad dosyası geçerli, ağlar yerleşimle aynı, pedler kartta ve ayrık`, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      const result = designPcb(doc, plan);
      if (doc.parts.some((p) => p.type === 'transformer')) {
        expect(result.ok).toBe(false);
        expect(kicadZip(doc, id).ok).toBe(false);
        return;
      }
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const text = kicadPcb(result.design, id);
      const root = parse(text);
      expect((root as S[])[0]).toBe('kicad_pcb');
      expect(one(root, 'version')[1]).toBe('20221018');

      // Ağ bildirimleri 0'dan ardışık; pedlerin ağ kodu ve adı bildirimle aynı.
      const declared = lists(root, 'net').map((n) => [num(n[1]), n[2] as string] as const);
      declared.forEach(([code], i) => expect(code).toBe(i));
      expect(declared[0]![1]).toBe('');
      const byCode = new Map(declared);
      const pads = padsOf(root);
      for (const p of pads) if (p.net) expect(byCode.get(p.net.code), `${p.ref}.${p.number}`).toBe(p.net.name);
      // Her bildirilen ağın en az bir pedi var.
      for (const [code] of declared.slice(1)) expect(pads.some((p) => p.net?.code === code)).toBe(true);

      // Breadboard'a takılı her pinin pedi: aynı ağdaki pinler aynı PCB ağında, farklılar farklı.
      const byId = new Map(doc.parts.map((p) => [p.id, p]));
      const pcbNet = new Map<string, string>();
      const planNet = new Map<string, string>();
      for (const [partId, placed] of plan.onBoard) {
        const part = byId.get(partId)!;
        const footprint = result.design.footprints.find((f) => f.partId === partId)!;
        expect(footprint.ref).toBe(part.label);
        placed.holes.forEach((_, i) => {
          const net = plan.netOf.get(pinKey(partId, i));
          if (net === undefined) return;
          const dip = padNumber(part.type, i);
          const pad = pads.find((p) => p.ref === part.label && p.number === dip)!;
          expect(pad, `${part.label}.${dip}`).toBeDefined();
          const name = pad.net!.name;
          if (planNet.has(name)) expect(planNet.get(name), `${part.label}.${dip}`).toBe(net);
          if (pcbNet.has(net)) expect(pcbNet.get(net)).toBe(name);
          planNet.set(name, net);
          pcbNet.set(net, name);
        });
      }
      // Dışarı giden her tel bir bağlantı pedi (klemens ya da pin başlık) ve aynı ağda.
      for (const partId of new Set(plan.leads.map((l) => l.partId))) {
        const label = byId.get(partId)!.label;
        const connector = result.design.footprints.find((f) => f.value.startsWith(`${label} `) && f.ref.startsWith('J'))!;
        expect(connector, `${id}: ${label}`).toBeDefined();
        const leads = plan.leads.filter((l) => l.partId === partId).sort((a, b) => a.pin - b.pin);
        expect(connector.pads.length).toBe(leads.length);
        leads.forEach((lead, i) => {
          const name = connector.pads[i]!.net!;
          if (planNet.has(name)) expect(planNet.get(name), `${label}.${lead.pin}`).toBe(lead.net);
          if (pcbNet.has(lead.net)) expect(pcbNet.get(lead.net), `${label}.${lead.pin}`).toBe(name);
          planNet.set(name, lead.net);
          pcbNet.set(lead.net, name);
        });
      }
      // Ground ağı GND adını alır.
      for (const [net, role] of plan.roles) if (pcbNet.has(net)) expect(pcbNet.get(net)).toBe(role === 'ground' ? 'GND' : 'VCC');

      // Kart kenarı ve pedler.
      const edge = lists(root, 'gr_rect').find((r) => one(r, 'layer')[1] === 'Edge.Cuts')!;
      const [x0, y0] = [num(one(edge, 'start')[1]), num(one(edge, 'start')[2])];
      const [x1, y1] = [num(one(edge, 'end')[1]), num(one(edge, 'end')[2])];
      for (const p of pads) {
        const r = p.size / 2 + 0.5;
        expect(p.x - r >= x0 && p.x + r <= x1 && p.y - r >= y0 && p.y + r <= y1, `${p.ref}.${p.number} kart dışında`).toBe(true);
      }
      // Kılıfların gövdeleri çakışmaz (aralarında en az 0,8 mm).
      const fps = result.design.footprints;
      for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
          const a = boxOf(fps[i]!, 0.39);
          const b = boxOf(fps[j]!, 0.39);
          expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, `${fps[i]!.ref} ↔ ${fps[j]!.ref}`).toBe(false);
        }
      }
      // Farklı ağların pedleri arasında en az 0,25 mm bakır aralığı (kare pedde köşegen).
      const reach = (p: Pad) => (p.rect ? (p.size / 2) * Math.SQRT2 : p.size / 2);
      for (let i = 0; i < pads.length; i++) {
        for (let j = i + 1; j < pads.length; j++) {
          const a = pads[i]!;
          const b = pads[j]!;
          if (a.net && b.net && a.net.code === b.net.code) continue;
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - reach(a) - reach(b);
          expect(gap, `${a.ref}.${a.number} ↔ ${b.ref}.${b.number}`).toBeGreaterThanOrEqual(a.npth || b.npth ? 0.5 : 0.25);
        }
      }
    });
  }

  it('ped numaraları standart KiCad kılıflarıyla aynı: diyot ve LED’de 1 = katot, kare ped 1', () => {
    expect(padNumber('led', 0)).toBe('2');
    expect(padNumber('diode', 1)).toBe('1');
    expect(padNumber('opamp', 0)).toBe('2');
    expect(padNumber('timer555', 7)).toBe('8');
    expect(padNumber('resistor', 1)).toBe('2');
    const doc = exampleDoc('ard-blink')!;
    const result = designPcb(doc);
    if (!result.ok) throw new Error(result.reason);
    const led = result.design.footprints.find((f) => f.ref === 'LED1')!;
    const cathode = led.pads.find((p) => p.number === '1')!;
    expect(cathode.shape).toBe('rect');
    expect(cathode.net).toBe('GND');
    expect(boardSize(result.design)).toMatch(/^\d+(,\d)? × \d+(,\d)? mm$/);
  });

  it('555: besleme ile toprak arasına 100 nF dekuplaj eklenir', () => {
    const id = EXAMPLE_IDS.find((e) => exampleDoc(e)!.parts.some((p) => p.type === 'timer555'))!;
    const doc = exampleDoc(id)!;
    const result = designPcb(doc);
    if (!result.ok) throw new Error(result.reason);
    const ic = result.design.footprints.find((f) => f.partId && doc.parts.find((p) => p.id === f.partId)?.type === 'timer555')!;
    const c = result.design.footprints.find((f) => f.ref.startsWith('C_D') && f.value === '100 nF')!;
    expect(c).toBeDefined();
    const nets = c.pads.map((p) => p.net).sort();
    const want = [ic.pads.find((p) => p.number === '8')!.net, ic.pads.find((p) => p.number === '1')!.net].sort();
    expect(nets).toEqual(want);
    expect(result.design.added.some((a) => a.includes('dekuplaj'))).toBe(true);
  });

  it('zip: dosyalar, CRC ve aynı devre için aynı bayt', () => {
    const doc = exampleDoc(EXAMPLE_IDS.find((e) => !exampleDoc(e)!.parts.some((p) => p.type === 'transformer'))!)!;
    const a = kicadZip(doc, 'Deneme devresi');
    const b = kicadZip(doc, 'Deneme devresi');
    if (!a.ok || !b.ok) throw new Error('aktarılamadı');
    expect(a.name).toBe('deneme-devresi-kicad.zip');
    expect([...a.data]).toEqual([...b.data]);
    const view = new DataView(a.data.buffer, a.data.byteOffset, a.data.byteLength);
    const decoder = new TextDecoder();
    const names: string[] = [];
    let at = 0;
    while (view.getUint32(at, true) === 0x04034b50) {
      const crc = view.getUint32(at + 14, true);
      const size = view.getUint32(at + 18, true);
      const nameLength = view.getUint16(at + 26, true);
      const name = decoder.decode(a.data.subarray(at + 30, at + 30 + nameLength));
      const body = a.data.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
      expect(crc32(body), name).toBe(crc);
      names.push(name);
      if (name.endsWith('.kicad_pro')) expect(() => JSON.parse(decoder.decode(body))).not.toThrow();
      if (name.endsWith('.kicad_pcb')) expect(() => parse(decoder.decode(body))).not.toThrow();
      at += 30 + nameLength + size;
    }
    expect(names).toEqual(['deneme-devresi/deneme-devresi.kicad_pro', 'deneme-devresi/deneme-devresi.kicad_pcb', 'deneme-devresi/malzeme-listesi.csv', 'deneme-devresi/OKU.txt']);
    // Merkezi dizinin sonu: kayıt sayısı.
    const end = a.data.byteLength - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(4);
  });

  it('proje dosyası: güç ağları kalın yol sınıfında', () => {
    const pro = JSON.parse(kicadProject('x.kicad_pro'));
    const classes = pro.net_settings.classes as Array<{ name: string; track_width: number }>;
    expect(classes.find((c) => c.name === 'Guc')!.track_width).toBeGreaterThanOrEqual(0.78);
    expect(pro.net_settings.netclass_patterns.map((p: { pattern: string }) => p.pattern)).toEqual(['GND', 'VCC']);
  });
});
