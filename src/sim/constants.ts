// Çözücünün sayısal sabitleri. Değerlerin gerekçesi README'de "Kararlar" bölümünde.

/** Isıl gerilim VT = k·T/q; T = 300 K için ≈ 25,85 mV. */
export const THERMAL_VOLTAGE = (1.380649e-23 * 300) / 1.602176634e-19;

/**
 * Her düğümü toprağa bağlayan ve her diyot/LED eklemine paralel konan çok küçük iletkenlik (S).
 * 1e-12 S = 1 TΩ: devrenin davranışını fark edilir biçimde değiştirmez ama boşta kalan
 * düğümlerde matrisin tekil olmasını önler.
 */
export const GMIN = 1e-12;

/** Varsayılan (ve en büyük) zaman adımı: 50 µs. */
export const DEFAULT_TIME_STEP = 50e-6;
/** Newton-Raphson yakınsamazsa zaman adımı en fazla bu değere kadar yarıya indirilir: 1 ns. */
export const MIN_TIME_STEP = 1e-9;
/** Bu kadar art arda başarılı adımdan sonra küçülmüş zaman adımı iki katına çıkarılır. */
export const STEP_GROWTH_AFTER = 8;

/** Newton-Raphson: en fazla iterasyon sayısı. */
export const NR_MAX_ITERATIONS = 100;
/** Newton-Raphson yakınsama ölçütü: |ΔV| < NR_RELTOL·|V| + NR_VNTOL. */
export const NR_RELTOL = 1e-3;
export const NR_VNTOL = 1e-6;
/** Akım değişkenleri ve eklem akımları için mutlak tolerans (A). */
export const NR_ABSTOL = 1e-12;

/** Kapalı anahtarın direnci: 1 mΩ. */
export const SWITCH_ON_RESISTANCE = 1e-3;

/** Bir direncin alabileceği en küçük değer (sıfıra bölmeyi önler). */
export const MIN_RESISTANCE = 1e-9;

/**
 * İç direnci 0 olan (ideal) bir pilde kısa devre eşiği: dış yük bu değerden küçükse
 * kısa devre uyarısı verilir. İç direnç > 0 ise eşik iç direncin kendisidir.
 */
export const IDEAL_SOURCE_SHORT_RESISTANCE = 0.1;
