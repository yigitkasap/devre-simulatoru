// Testler için Netlist → SPICE (ngspice) netlist'i dönüştürücü (Fizik 6). Karşılaştırma adil
// olsun diye bileşen parametreleri bizim modelimizden aynen alınır:
//   - Diyot (1N4001 ve genel): IS, N; yük modeli varsa CJO, VJ, M, TT, FC = 0,5.
//   - LED: seri dirençli diyot (IS, N, RS); Is, 20 mA'de veri sayfası ileri gerilimini verecek
//     biçimde hesaplanmış olandır.
//   - Zener: bizdeki gibi 1 Ω seri direnç + ileri diyot + ters yönde "kırılma" diyodu.
//   - BJT: Gummel-Poon (IS, BF, BR, VAF; NF = NR = 1; IKF, ISE, ISC, VAR yok): bu durumda bizim
//     Early'li Ebers-Moll taşıma modelimizle aynı denklemlerdir. Yük modeli varsa CJE, VJE, MJE,
//     TF, CJC, VJC, MJC.
//   - MOSFET: LEVEL 1, W = L, KP = 2β (bizde I_D = β·(V_GS − V_T)²), VTO, LAMBDA; gövde source'a
//     bağlı.
//   - Bobin: sargı direnci + L + uçlar arasındaki sargı kapasitesi (bizdeki yapı).
//   - Transformatör: iki sargı (direnç + L + sargı kapasitesi) ve aralarında K bağlaşımı.
// Sıcaklık 300 K (bizim VT'miz): TEMP = TNOM = 26,85 °C. ngspice her eklemin paralelinde GMIN =
// 10⁻¹² S kullanır (bizdeki gibi).

import { compileNetlist, type CompiledCircuit, type Netlist } from '../../src/sim';
import { THERMAL_VOLTAGE } from '../../src/sim/constants';
import { AcSourceDevice } from '../../src/sim/devices/acsource';
import { BatteryDevice } from '../../src/sim/devices/battery';
import { BJT_PARAMS, BjtDevice } from '../../src/sim/devices/bjt';
import { CapacitorDevice } from '../../src/sim/devices/capacitor';
import type { Device } from '../../src/sim/devices/device';
import { DIODE_MODEL_PARAMS, DiodeDevice } from '../../src/sim/devices/diode';
import { INDUCTOR_WINDING_CAPACITANCE, InductorDevice } from '../../src/sim/devices/inductor';
import { LED_MODELS, LedDevice } from '../../src/sim/devices/led';
import { ResistorDevice } from '../../src/sim/devices/resistor';
import { TransformerDevice } from '../../src/sim/devices/transformer';
import { ZenerDevice } from '../../src/sim/devices/zener';

const GROUND = -1;

/** SPICE'ta bir düğümün adı: toprak 0, öbürleri n<indeks>. */
export const nodeName = (node: number): string => (node === GROUND ? '0' : `n${node}`);

/** Netlist'teki bir pin ya da kablo anahtarının SPICE düğüm adı. */
export function spiceNode(compiled: CompiledCircuit, key: string): string {
  const node = compiled.nodeOfRoot.get(compiled.nets.findKey(key));
  if (node === undefined) throw new Error(`düğüm yok: ${key}`);
  return nodeName(node);
}

const num = (v: number) => v.toExponential(10);

/** Bir diyot modeli kartı. */
function diodeCard(name: string, is: number, nvt: number, extra: Record<string, number> = {}): string {
  const params: Record<string, number> = { IS: is, N: nvt / THERMAL_VOLTAGE, ...extra };
  return `.model ${name} D(${Object.entries(params).map(([k, v]) => `${k}=${num(v)}`).join(' ')})`;
}

export interface SpiceCircuit {
  readonly compiled: CompiledCircuit;
  /** Bileşen satırları ve model kartları (analiz satırı hariç). */
  readonly lines: readonly string[];
}

/**
 * Netlist'i SPICE satırlarına çevirir. Desteklenen türler: pil, AC kaynak (sinüs), direnç,
 * kondansatör, diyot, LED, zener, NPN/PNP, N kanallı MOSFET, toprak. `acMagnitude` verilirse
 * AC kaynaklar küçük sinyal analizi için "AC 1" de alır.
 */
export function toSpice(netlist: Netlist, options: { acMagnitude?: boolean } = {}): SpiceCircuit {
  const compiled = compileNetlist(netlist);
  const lines: string[] = [];
  const models = new Map<string, string>();
  const n = (d: Device, k: number) => nodeName(d.nodes[k]!);
  for (const device of compiled.devices) {
    const id = device.id.replace(/[^A-Za-z0-9_]/g, '_');
    if (device instanceof ResistorDevice) {
      lines.push(`R${id} ${n(device, 0)} ${n(device, 1)} ${num(device.resistance)}`);
    } else if (device instanceof CapacitorDevice) {
      lines.push(`C${id} ${n(device, 0)} ${n(device, 1)} ${num(device.capacitance)} IC=${num(device.voltage)}`);
    } else if (device instanceof InductorDevice) {
      // uç 0 ── R_dc ── iç düğüm ── L ── uç 1; sargı kapasitesi uçlar arasında.
      const start = device.dcResistance > 0 ? n(device, 2) : n(device, 0);
      if (device.dcResistance > 0) lines.push(`R${id}_dc ${n(device, 0)} ${start} ${num(device.dcResistance)}`);
      lines.push(`L${id} ${start} ${n(device, 1)} ${num(device.inductance)} IC=${num(device.current)}`);
      lines.push(`C${id}_p ${n(device, 0)} ${n(device, 1)} ${num(INDUCTOR_WINDING_CAPACITANCE)} IC=0`);
    } else if (device instanceof TransformerDevice) {
      // P• ── R₁ ── iç 1 ── L₁ ── P;  S• ── R₂ ── iç 2 ── L₂ ── S;  K = M / √(L₁L₂).
      const windings = [
        { l: device.l1, r: device.r1, c: device.c1, a: 0, b: 1, inner: 4 },
        { l: device.l2, r: device.r2, c: device.c2, a: 2, b: 3, inner: 5 },
      ];
      windings.forEach((w, k) => {
        const start = w.r > 0 ? n(device, w.inner) : n(device, w.a);
        if (w.r > 0) lines.push(`R${id}_${k} ${n(device, w.a)} ${start} ${num(w.r)}`);
        lines.push(`L${id}_${k} ${start} ${n(device, w.b)} ${num(w.l)} IC=0`);
        lines.push(`C${id}_${k} ${n(device, w.a)} ${n(device, w.b)} ${num(w.c)} IC=0`);
      });
      lines.push(`K${id} L${id}_0 L${id}_1 ${num(device.mutual / Math.sqrt(device.l1 * device.l2))}`);
    } else if (device instanceof BatteryDevice) {
      // (−) ── ideal kaynak ── iç düğüm ── R_iç ── (+)
      if (device.internalResistance > 0) {
        lines.push(`V${id} ${n(device, 2)} ${n(device, 1)} DC ${num(device.voltage)}`);
        lines.push(`R${id}_ic ${n(device, 2)} ${n(device, 0)} ${num(device.internalResistance)}`);
      } else {
        lines.push(`V${id} ${n(device, 0)} ${n(device, 1)} DC ${num(device.voltage)}`);
      }
    } else if (device instanceof AcSourceDevice) {
      if (device.waveform !== 'sine') throw new Error('yalnızca sinüs');
      const source = `SIN(${num(device.offset)} ${num(device.amplitude)} ${num(device.frequency)} 0 0 0)${options.acMagnitude ? ' AC 1' : ''}`;
      if (device.internalResistance > 0) {
        lines.push(`V${id} ${n(device, 2)} ${n(device, 1)} DC ${num(device.offset)} ${source}`);
        lines.push(`R${id}_ic ${n(device, 2)} ${n(device, 0)} ${num(device.internalResistance)}`);
      } else {
        lines.push(`V${id} ${n(device, 0)} ${n(device, 1)} DC ${num(device.offset)} ${source}`);
      }
    } else if (device instanceof DiodeDevice) {
      const p = DIODE_MODEL_PARAMS[device.model];
      const name = `D_${device.model}`;
      const charge: Record<string, number> = p.charge ? { CJO: p.charge.cj0, VJ: p.charge.vj, M: p.charge.m, TT: p.charge.tt, FC: 0.5 } : {};
      models.set(name, diodeCard(name, p.saturationCurrent, p.emission * THERMAL_VOLTAGE, charge));
      lines.push(`D${id} ${n(device, 0)} ${n(device, 1)} ${name}`);
    } else if (device instanceof LedDevice) {
      const params = LED_MODELS[device.color];
      const name = `D_LED_${device.color}`;
      models.set(name, diodeCard(name, device.junction.saturationCurrent, device.junction.nvt, { RS: params.seriesResistance }));
      lines.push(`D${id} ${n(device, 0)} ${n(device, 1)} ${name}`);
    } else if (device instanceof ZenerDevice) {
      // anot ── 1 Ω ── iç düğüm; ileri diyot iç → katot; kırılma diyodu katot → iç.
      const fwd = `D_ZF_${id}`;
      const brk = `D_ZB_${id}`;
      models.set(fwd, diodeCard(fwd, device.forward.saturationCurrent, device.forward.nvt));
      models.set(brk, diodeCard(brk, device.breakdown.saturationCurrent, device.breakdown.nvt));
      lines.push(`R${id}_z ${n(device, 0)} ${n(device, 2)} 1`);
      lines.push(`D${id}_f ${n(device, 2)} ${n(device, 1)} ${fwd}`);
      lines.push(`D${id}_b ${n(device, 1)} ${n(device, 2)} ${brk}`);
    } else if (device instanceof BjtDevice) {
      const name = `Q_${device.type}_${device.model ?? 'eski'}_${device.beta}`;
      const params: Record<string, number> = {
        IS: BJT_PARAMS.saturationCurrent,
        BF: device.beta,
        BR: BJT_PARAMS.reverseBeta,
        VAF: BJT_PARAMS.earlyVoltage,
        NF: 1,
        NR: 1,
      };
      models.set(name, `.model ${name} ${device.type === 'npn' ? 'NPN' : 'PNP'}(${Object.entries(params).map(([k, v]) => `${k}=${num(v)}`).join(' ')})`);
      lines.push(`Q${id} ${n(device, 0)} ${n(device, 1)} ${n(device, 2)} ${name}`);
    } else if (device.type === 'nmos') {
      const fet = device as unknown as { vt: number; beta: number; dynamics: { lambda: number } };
      const name = `M_${id}`;
      models.set(name, `.model ${name} NMOS(LEVEL=1 VTO=${num(fet.vt)} KP=${num(2 * fet.beta)} LAMBDA=${num(fet.dynamics.lambda)})`);
      lines.push(`M${id} ${n(device, 0)} ${n(device, 1)} ${n(device, 2)} ${n(device, 2)} ${name} W=1 L=1`);
    } else if (device.type === 'ground') {
      // toprak: düğüm 0
    } else {
      throw new Error(`SPICE dönüştürücüsü bu türü desteklemiyor: ${device.type}`);
    }
  }
  return { compiled, lines: [...lines, ...models.values(), '.options TEMP=26.85 TNOM=26.85'] };
}
