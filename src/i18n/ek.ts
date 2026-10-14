// Bileşen adlarına (R1, B12, OSC1) getirilen ekler. Ek, adın okunuşuna göre seçilir: R1 "er bir" →
// R1’in, R2 "er iki" → R2’nin, R3 "er üç" → R3’ün, R6 "er altı" → R6’nın. Ad harfle bitiyorsa
// harfin adı okunur (B "be", A "a").

export type Ek = 'in' | 'i' | 'e';

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const VOWELS = 'aeıioöuü';

/** Adın okunuşundaki son sözcük ("R12" → "iki", "R40" → "kırk", "OSC" → "ce"). */
function spokenEnd(label: string): string {
  const digits = /(\d+)$/.exec(label)?.[1];
  if (digits !== undefined) {
    const n = Number(digits.slice(-7));
    if (n === 0) return 'sıfır';
    if (n % 10 !== 0) return ONES[n % 10]!;
    if (Math.floor(n / 10) % 10 !== 0) return TENS[Math.floor(n / 10) % 10]!;
    if (Math.floor(n / 100) % 10 !== 0) return 'yüz';
    return n % 1_000_000 === 0 ? 'milyon' : 'bin';
  }
  const last = label.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü]/g, '').slice(-1);
  if (last === '') return 'e';
  // Ünsüz harfler "be, ce, de…" diye okunur.
  return VOWELS.includes(last) ? last : `${last}e`;
}

/** Ad + kesme işareti + ek: ek(‘R1’, 'in') → "R1’in", ek('R6', 'i') → "R6’yı", ek('R2', 'e') → "R2’ye". */
export function ek(label: string, kind: Ek): string {
  const word = spokenEnd(label);
  const vowel = [...word].reverse().find((c) => VOWELS.includes(c)) ?? 'e';
  const endsWithVowel = VOWELS.includes(word.slice(-1));
  const back = 'aıou'.includes(vowel);
  const round = 'oöuü'.includes(vowel);
  const narrow = back ? (round ? 'u' : 'ı') : round ? 'ü' : 'i';
  if (kind === 'in') return `${label}’${endsWithVowel ? 'n' : ''}${narrow}n`;
  if (kind === 'i') return `${label}’${endsWithVowel ? 'y' : ''}${narrow}`;
  return `${label}’${endsWithVowel ? 'y' : ''}${back ? 'a' : 'e'}`;
}

/**
 * İyelik ekli bir uç adına yönelme eki: "+ ucu" → "+ ucuna", "A kanalı" → "A kanalına",
 * "ortak ucu (COM)" → "ortak ucuna (COM)".
 */
export function toDative(name: string): string {
  const m = /^(.*?)(\s*\([^)]*\))?$/.exec(name)!;
  const head = m[1]!;
  const tail = m[2] ?? '';
  const vowel = [...head.toLocaleLowerCase('tr-TR')].reverse().find((c) => VOWELS.includes(c)) ?? 'e';
  return `${head}${'aıou'.includes(vowel) ? 'na' : 'ne'}${tail}`;
}
