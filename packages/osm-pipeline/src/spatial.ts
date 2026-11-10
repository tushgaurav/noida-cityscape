import type { PlanarBounds } from '@noida/city-schema';

const EMPTY: never[] = [];

export class GridIndex<T> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  insert(item: T, bounds: PlanarBounds): void {
    const x0 = Math.floor(bounds.minE / this.cellSize);
    const x1 = Math.floor(bounds.maxE / this.cellSize);
    const y0 = Math.floor(bounds.minN / this.cellSize);
    const y1 = Math.floor(bounds.maxN / this.cellSize);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = this.key(x, y);
        const cell = this.cells.get(key);
        if (cell) cell.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }

  query(e: number, n: number): readonly T[] {
    return this.cells.get(this.key(Math.floor(e / this.cellSize), Math.floor(n / this.cellSize))) ?? EMPTY;
  }

  queryBounds(bounds: PlanarBounds): T[] {
    const found = new Set<T>();
    const x0 = Math.floor(bounds.minE / this.cellSize);
    const x1 = Math.floor(bounds.maxE / this.cellSize);
    const y0 = Math.floor(bounds.minN / this.cellSize);
    const y1 = Math.floor(bounds.maxN / this.cellSize);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const cell = this.cells.get(this.key(x, y));
        if (cell) for (const item of cell) found.add(item);
      }
    }
    return [...found];
  }
}
