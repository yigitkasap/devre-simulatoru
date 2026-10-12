// Modified Nodal Analysis (MNA) sistemi: A·x = z.
//
// Bilinmeyenler (x):
//   x[0 .. düğümSayısı-1]        toprak hariç düğüm gerilimleri (iç düğümler dahil)
//   x[düğümSayısı .. boyut-1]    gerilim kaynaklarının (ve ideal ampermetrelerin) akımları
//
// Bilinmeyen indeksi -1 olan uç topraktır (0 V). Toprağa giden terimler matrise yazılmaz;
// aşağıdaki yardımcılar -1 gelen satır/sütunları sessizce atlar.

export const GROUND = -1;

export class MnaSystem {
  readonly size: number;
  readonly A: Float64Array;
  readonly z: Float64Array;

  constructor(size: number) {
    this.size = size;
    this.A = new Float64Array(size * size);
    this.z = new Float64Array(size);
  }

  clear(): void {
    this.A.fill(0);
    this.z.fill(0);
  }

  copyFrom(other: MnaSystem): void {
    this.A.set(other.A);
    this.z.set(other.z);
  }

  /** A[row][col] += value (toprak satır/sütunları atlanır). */
  add(row: number, col: number, value: number): void {
    if (row < 0 || col < 0) return;
    this.A[row * this.size + col]! += value;
  }

  /** z[row] += value */
  addRhs(row: number, value: number): void {
    if (row < 0) return;
    this.z[row]! += value;
  }

  /**
   * a ile b arasında G iletkenliği:
   *   A[a][a] += G, A[b][b] += G, A[a][b] −= G, A[b][a] −= G
   */
  conductance(a: number, b: number, g: number): void {
    this.add(a, a, g);
    this.add(b, b, g);
    this.add(a, b, -g);
    this.add(b, a, -g);
  }

  /**
   * İdeal akım kaynağı: I akımı kaynağın içinden `from` düğümünden `to` düğümüne akar,
   * yani `to` düğümüne I akımı girer, `from` düğümünden I akımı çıkar:
   *   z[from] −= I, z[to] += I
   */
  currentSource(from: number, to: number, current: number): void {
    this.addRhs(from, -current);
    this.addRhs(to, current);
  }

  /**
   * İdeal gerilim kaynağı: v(plus) − v(minus) = V. `branch` bu kaynağın akım bilinmeyeninin
   * satırıdır; bu akım + uçtan kaynağa girip − uçtan çıkan akımdır.
   *   A[a][k] += 1, A[k][a] += 1, A[b][k] −= 1, A[k][b] −= 1, z[k] = V
   */
  voltageSource(plus: number, minus: number, branch: number, voltage: number): void {
    this.add(plus, branch, 1);
    this.add(branch, plus, 1);
    this.add(minus, branch, -1);
    this.add(branch, minus, -1);
    this.addRhs(branch, voltage);
  }
}

/** Çözüm vektöründen bir düğümün gerilimi (toprak 0 V). */
export function nodeVoltage(x: Float64Array, node: number): number {
  return node < 0 ? 0 : x[node]!;
}
