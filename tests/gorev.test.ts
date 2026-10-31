// Görev (C1): bağlantı (#g=, sıkıştırılmış JSON) ve görev dosyası aynı içerik; hedeflerin
// değerlendirilmesi (±, ≥, ≤); kilitli parçalar değişmez, kullanma denetimleri (anahtar) ve ölçü
// aletinin ayarı değişebilir; yeni parça eklenemiyorsa kablo da değişmez.

import { describe, expect, it } from 'vitest';
import { exampleDoc } from '../src/examples';
import { LINK_LIMIT, NO_PREDICTIONS, parsePredictions, parseTask, parseTaskPayload, predictionError, respectsTask, targetMet, taskFromHash, taskPayload, taskTitle, taskUrl, type TaskDef } from '../src/model/task';
import { buildConnectivity } from '../src/model/connectivity';
import { netIndex } from '../src/editor/analysis/traces';
import { goalText, targetOptions } from '../src/editor/task/targets';
import { plainText } from '../src/editor/Rich';

const amp = exampleDoc('bjt-yukseltec')!;
const id = (label: string) => amp.parts.find((p) => p.label === label)!.id;
const task: TaskDef = {
  name: 'Deney 7 · BJT yükselteç tasarımı',
  instruction: 'RB ve RC’yi seç. Kazanç 200 ± %10, VCE yaklaşık 6 V olsun.',
  editable: [id('RB'), id('RC')],
  allowNew: false,
  targets: [
    { id: 'a', q: { kind: 'q', part: id('Q1'), axis: 'v' }, op: 'tol', value: 6, tol: 10 },
    { id: 'b', q: { kind: 'bode', measure: 'gain' }, op: 'tol', value: 200, tol: 10 },
    { id: 'c', q: { kind: 'bode', measure: 'fH' }, op: 'ge', value: 500e3, tol: 0 },
  ],
  predict: true,
};

describe('Görev', () => {
  it('bağlantı #g= ile açılır, görev ve devre aynen gelir; dosya da aynı içerik; bağlantı 8 KB sınırının altında', () => {
    const url = taskUrl(task, amp, 'https://yigitkasap.github.io/devre-simulatoru/#d=eski');
    expect(url).toMatch(/^https:\/\/yigitkasap\.github\.io\/devre-simulatoru\/#g=/);
    expect(url.length).toBeLessThan(LINK_LIMIT);
    const back = taskFromHash(new URL(url).hash)!;
    expect(back.task).toEqual(task);
    expect(back.doc.parts.map((p) => p.label)).toEqual(amp.parts.map((p) => p.label));
    expect(parseTaskPayload(JSON.parse(JSON.stringify(taskPayload(task, amp))))!.task).toEqual(task);
    expect(taskFromHash('#d=abc')).toBeUndefined();
    expect(taskFromHash('#g=bozuk')).toBeNull();
  });

  it('üst çubuktaki ad (analiz düzeltmeleri, 4): görevin adı, yoksa bağlantıdaki başlangıç devresinin adı; eski bağlantı da açılır', () => {
    const withCircuit = { ...task, circuit: 'BC107 ile ortak emetörlü yükselteç' };
    const back = taskFromHash(new URL(taskUrl(withCircuit, amp, 'https://yigitkasap.github.io/devre-simulatoru/')).hash)!.task;
    expect(back.circuit).toBe('BC107 ile ortak emetörlü yükselteç');
    expect(taskTitle(back)).toBe('Deney 7 · BJT yükselteç tasarımı');
    expect(taskTitle({ ...back, name: '  ' })).toBe('BC107 ile ortak emetörlü yükselteç');
    // Eski bağlantı (devre adı yok): görev adı; ikisi de yoksa null (üst çubukta "Devrem").
    const old = taskFromHash(new URL(taskUrl(task, amp, 'https://yigitkasap.github.io/devre-simulatoru/')).hash)!.task;
    expect(old.circuit).toBeUndefined();
    expect(taskTitle(old)).toBe('Deney 7 · BJT yükselteç tasarımı');
    expect(taskTitle({ ...old, name: '' })).toBeNull();
  });

  it('hedef: ± tolerans, ≥ ve ≤; ölçülemeyen hedef tutmaz', () => {
    const [vce, gain, fh] = task.targets as [TaskDef['targets'][0], TaskDef['targets'][0], TaskDef['targets'][0]];
    expect(targetMet(vce, 5.99)).toBe(true);
    expect(targetMet(vce, 6.7)).toBe(false);
    expect(targetMet(gain, 205.5)).toBe(true);
    expect(targetMet(fh, 1.08e6)).toBe(true);
    expect(targetMet(fh, 4e5)).toBe(false);
    expect(targetMet({ ...fh, op: 'le' }, 4e5)).toBe(true);
    expect(targetMet(vce, null)).toBe(false);
  });

  it('hedef seçenekleri dört grupta; her düğüm (toprak hariç) bir kez, Grafik izi gerekmeden; hedef yazısı', () => {
    const idx = netIndex(amp, buildConnectivity(amp));
    const options = targetOptions(amp, idx, []);
    expect([...new Set(options.map((o) => o.group))]).toEqual(['DC çalışma noktası', 'Bode', 'Düğüm gerilimi', 'Parça ölçümleri (canlı)']);
    const nodes = options.filter((o) => o.group === 'Düğüm gerilimi').map((o) => plainText(o.name));
    expect(new Set(nodes).size).toBe(nodes.length);
    expect(nodes).toEqual(expect.arrayContaining(['V(Q1 baz)', 'V(Q1 kollektör)']));
    expect(nodes).not.toContain('V(0)');
    expect(options.find((o) => o.q.kind === 'q' && o.q.axis === 'v')!.name).toBe('V_{CE} · Q1 (DC)');
    const [vce, gain, fh] = task.targets as [TaskDef['targets'][0], TaskDef['targets'][0], TaskDef['targets'][0]];
    expect(goalText(vce, 'V')).toBe('Hedef 6 V ± %10');
    expect(goalText(gain, '')).toBe('Hedef 200 ± %10');
    expect(goalText(fh, 'Hz')).toBe('Hedef ≥ 500 kHz');
  });

  it('önce tahmin (B1): bağlantıda taşınır, eski bağlantıda kapalı; tahminler okunur; fark ölçülene göre', () => {
    const url = taskUrl(task, amp, 'https://yigitkasap.github.io/devre-simulatoru/');
    expect(taskFromHash(new URL(url).hash)!.task.predict).toBe(true);
    const { predict: _, ...old } = task;
    expect(parseTask(JSON.parse(JSON.stringify(old)))!.predict).toBe(false);
    expect(parsePredictions({ values: { a: 6, b: 'x', c: 2e5 }, locked: true })).toEqual({ values: { a: 6, c: 2e5 }, locked: true });
    expect(parsePredictions(null)).toEqual(NO_PREDICTIONS);
    expect(predictionError(6, 5.99)).toBeCloseTo(0.167, 2);
    expect(predictionError(200, 205.8)).toBeCloseTo(2.818, 2);
    expect(predictionError(6, null)).toBeNull();
  });

  it('kilit: RB değişebilir, Q1 ve PS1 değişmez; osiloskop ayarı değişebilir; yeni parça ve kablo eklenemez', () => {
    const change = (label: string, props: Record<string, number | string | boolean>) => ({ ...amp, parts: amp.parts.map((p) => (p.label === label ? { ...p, props: { ...p.props, ...props } } : p)) });
    expect(respectsTask(amp, change('RB', { resistance: 1e6 }), task)).toBe(true);
    expect(respectsTask(amp, change('Q1', { beta: 300 }), task)).toBe(false);
    expect(respectsTask(amp, change('PS1', { voltage1: 9 }), task)).toBe(false);
    expect(respectsTask(amp, change('OSC1', { timePerDiv: 0.001 }), task)).toBe(true);
    const moved = { ...amp, parts: amp.parts.map((p) => (p.label === 'C1' ? { ...p, x: p.x + 2 } : p)) };
    expect(respectsTask(amp, moved, task)).toBe(false);
    const added = { ...amp, parts: [...amp.parts, { ...amp.parts.find((p) => p.label === 'RC')!, id: 'yeni', label: 'R9' }] };
    expect(respectsTask(amp, added, task)).toBe(false);
    expect(respectsTask(amp, added, { ...task, allowNew: true })).toBe(true);
    expect(respectsTask(amp, { ...amp, wires: amp.wires.slice(1) }, task)).toBe(false);
  });
});
