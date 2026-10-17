// ngspice'ı testlerde çalıştırma (Fizik 6). Bilgisayarda kurulu bir ngspice komut satırı sürümü
// aranmadı (geliştirme ortamında yoktu); ngspice'ın WebAssembly derlemesi olan `eecircuit-engine`
// (yalnızca geliştirme bağımlılığı, siteye girmez) Node'da çalıştırılır. Paket yüklenemezse
// testler atlanır ve nedeni yazdırılır.

type Simulation = {
  start(): Promise<void>;
  setNetList(text: string): void;
  runSim(): Promise<SpiceResult>;
  getError(): string[];
};

export type SpiceResult =
  | { dataType: 'real'; data: Array<{ name: string; values: number[] }> }
  | { dataType: 'complex'; data: Array<{ name: string; values: Array<{ real: number; img: number }> }> };

export type SpiceEngine = { readonly ok: true; run(text: string): Promise<SpiceResult> } | { readonly ok: false; readonly reason: string };

let engine: Promise<SpiceEngine> | null = null;

/** Türkçe harfleri en yakın ASCII karşılığına çevirir, kalan ASCII dışı karakterleri atar. */
function toAscii(text: string): string {
  const map: Record<string, string> = { ı: 'i', İ: 'I', ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ç: 'c', Ç: 'C', ö: 'o', Ö: 'O', ü: 'u', Ü: 'U' };
  return text.replace(/[^\x00-\x7F]/g, (c) => map[c] ?? c.normalize('NFD').replace(/[^\x00-\x7F]/g, ''));
}

/** ngspice'ı bir kez başlatır; yoksa nedenini döndürür. */
export function spiceEngine(): Promise<SpiceEngine> {
  engine ??= (async (): Promise<SpiceEngine> => {
    try {
      const moduleName = 'eecircuit-engine';
      const { Simulation } = (await import(/* @vite-ignore */ moduleName)) as { Simulation: new () => Simulation };
      const sim = new Simulation();
      await sim.start();
      // Aynı örnek sırayla kullanılır: çalıştırmalar birbirini beklemeli.
      let queue: Promise<unknown> = Promise.resolve();
      const run = (text: string) => {
        const next = queue.then(async () => {
          // ngspice'ın WebAssembly derlemesi ASCII olmayan karakterde (ör. başlıktaki "ü") takılıyor.
          sim.setNetList(toAscii(text));
          const result = await sim.runSim();
          const errors = sim.getError();
          if (errors.length > 0) throw new Error(`ngspice hatası: ${errors.join(' | ')}`);
          return result;
        });
        queue = next.catch(() => undefined);
        return next;
      };
      return { ok: true, run };
    } catch (e) {
      return { ok: false, reason: `eecircuit-engine yüklenemedi (${e instanceof Error ? e.message : String(e)}); "npm install" ile kurulur.` };
    }
  })();
  return engine;
}

/** Gerçel sonuçta bir değişkenin değerleri (ad küçük harfle: "v(n3)", "i(vb)"). */
export function realValues(result: SpiceResult, name: string): number[] {
  if (result.dataType !== 'real') throw new Error('gerçel sonuç bekleniyordu');
  const found = result.data.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`ngspice sonucunda ${name} yok: ${result.data.map((d) => d.name).join(', ')}`);
  return found.values;
}

/** Karmaşık sonuçta (AC analizi) bir değişkenin değerleri. */
export function complexValues(result: SpiceResult, name: string): Array<{ real: number; img: number }> {
  if (result.dataType !== 'complex') throw new Error('karmaşık sonuç bekleniyordu');
  const found = result.data.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`ngspice sonucunda ${name} yok: ${result.data.map((d) => d.name).join(', ')}`);
  return found.values;
}
