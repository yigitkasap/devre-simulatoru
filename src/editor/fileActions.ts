// JSON dışa/içe aktarma ve adres çubuğundaki paylaşım bağlantısı.

import { tr } from '../i18n/tr';
import { parseAnalysis, type AnalysisDoc } from '../model/analysis';
import { parseDoc, toSerializable } from '../model/serialize';
import type { CircuitDoc } from '../model/types';

/** Devreyi (varsa analiz bölümüyle) okunaklı (girintili) JSON dosyası olarak indirir. */
export function downloadDoc(doc: CircuitDoc, analysis?: AnalysisDoc): void {
  const json = `${JSON.stringify(toSerializable(doc, analysis), null, 2)}\n`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${tr.file.fileName}-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Seçilen dosyayı okur (devre ve analiz bölümü); geçerli bir devre değilse null. */
export async function readDocFile(file: File): Promise<{ doc: CircuitDoc; analysis: AnalysisDoc } | null> {
  try {
    const value: unknown = JSON.parse(await file.text());
    const doc = parseDoc(value);
    return doc ? { doc, analysis: parseAnalysis((value as { analysis?: unknown }).analysis) } : null;
  } catch {
    return null;
  }
}

/** Paylaşım bağlantısı okunduktan sonra adresten # kısmını kaldırır (yenileyince eski devre gelmesin). */
export function clearHash(): void {
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    // Bazı gömülü görünümlerde history kullanılamayabilir; önemli değil.
  }
}
