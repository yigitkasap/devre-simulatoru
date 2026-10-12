/**
 * Birleşim-bul (union-find) yapısı. Kabloların birleştirdiği uçları aynı düğümde toplamak
 * ve topoloji kontrolleri (döngü, kopuk parça) için kullanılır.
 * Yol sıkıştırma ve boyuta göre birleştirme yapar; işlemler neredeyse sabit zamanlıdır.
 */
export class UnionFind {
  private readonly parent: number[] = [];
  private readonly size: number[] = [];

  /** Yeni bir eleman ekler ve indeksini döndürür. */
  add(): number {
    const index = this.parent.length;
    this.parent.push(index);
    this.size.push(1);
    return index;
  }

  get count(): number {
    return this.parent.length;
  }

  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    // Yol sıkıştırma
    let cur = i;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur]!;
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }

  /** İki kümeyi birleştirir; zaten aynı kümedeyse false döner. */
  union(a: number, b: number): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.size[ra]! < this.size[rb]!) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.size[ra]! += this.size[rb]!;
    return true;
  }

  same(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }
}

/** Metin anahtarlı union-find: düğüm adları (ör. "R1:0", "kablo:7") doğrudan kullanılabilir. */
export class KeyedUnionFind {
  private readonly uf = new UnionFind();
  private readonly indexOf = new Map<string, number>();
  private readonly keys: string[] = [];

  /** Anahtarı ekler (varsa dokunmaz) ve indeksini döndürür. */
  add(key: string): number {
    let index = this.indexOf.get(key);
    if (index === undefined) {
      index = this.uf.add();
      this.indexOf.set(key, index);
      this.keys.push(key);
    }
    return index;
  }

  has(key: string): boolean {
    return this.indexOf.has(key);
  }

  union(a: string, b: string): boolean {
    return this.uf.union(this.add(a), this.add(b));
  }

  /** Anahtarın kümesini temsil eden kök anahtar. */
  findKey(key: string): string {
    return this.keys[this.uf.find(this.add(key))]!;
  }

  allKeys(): readonly string[] {
    return this.keys;
  }
}
