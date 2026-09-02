interface PlacedColumn {
  id: string;
  x: number;
  halfWidth: number;
}

export type PlacementScorer = (x: number) => number;

const LAYOUT_MIN_X = -14.5;
const LAYOUT_MAX_X = 14.5;
// Keep columns separated so stones never hide each other on the shared plane.
const DENSITY_FACTOR = 1.02;
const SEVERE_OVERLAP_FACTOR = 1.0;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class ColumnLayout {
  private readonly placed: PlacedColumn[] = [];

  findPlacement(width: number, scorePlacement?: PlacementScorer): number {
    const placed = this.placed;
    const halfWidth = width / 2;
    const minX = Math.max(LAYOUT_MIN_X, -14.8 + halfWidth);
    const maxX = Math.min(LAYOUT_MAX_X, 14.8 - halfWidth);
    const safeMin = Math.min(minX, maxX);
    const safeMax = Math.max(minX, maxX);
    let bestRandom: { x: number; score: number } | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const x = safeMin + Math.random() * (safeMax - safeMin);
      const factor = randomBetween(
        SEVERE_OVERLAP_FACTOR,
        DENSITY_FACTOR + 0.07,
      );
      if (
        !placed.some(
          (entry) =>
            Math.abs(entry.x - x) <
            (entry.halfWidth + halfWidth) * factor,
        )
      ) {
        if (!scorePlacement) return x;
        const score = scorePlacement(x);
        if (!bestRandom || score < bestRandom.score - 1e-6) {
          bestRandom = { x, score };
        }
      }
    }
    if (scorePlacement && bestRandom) return bestRandom.x;

    const edges = [...placed]
      .map((entry) => ({
        start: entry.x - entry.halfWidth,
        end: entry.x + entry.halfWidth,
      }))
      .sort((a, b) => a.start - b.start);

    const gaps: Array<{ start: number; end: number }> = [];
    let cursor = safeMin;
    for (const edge of edges) {
      if (edge.start > cursor) {
        gaps.push({ start: cursor, end: edge.start });
      }
      cursor = Math.max(cursor, edge.end);
    }
    if (safeMax > cursor) {
      gaps.push({ start: cursor, end: safeMax });
    }

    const candidates = [safeMin, safeMax];
    for (const edge of edges) {
      candidates.push(edge.start - halfWidth, edge.end + halfWidth);
    }
    for (const gap of gaps) {
      candidates.push((gap.start + gap.end) / 2);
    }

    const valid = candidates.filter(
      (x) => x >= safeMin && x <= safeMax,
    );
    if (valid.length === 0) {
      return randomBetween(safeMin, safeMax);
    }

    let bestX = valid[0];
    let bestScore = Infinity;
    for (const x of valid) {
      let overlap = 0;
      for (const entry of placed) {
        overlap = Math.max(
          overlap,
          entry.halfWidth + halfWidth - Math.abs(entry.x - x),
        );
      }
      const score =
        overlap * 4 +
        Math.abs(x) * 0.04 +
        (scorePlacement ? scorePlacement(x) * 2 : 0);
      if (
        score < bestScore - 1e-6 ||
        (Math.abs(score - bestScore) < 1e-6 && Math.random() < 0.5)
      ) {
        bestScore = score;
        bestX = x;
      }
    }
    return bestX;
  }

  add(id: string, x: number, width: number): void {
    this.placed.push({ id, x, halfWidth: width / 2 });
  }

  remove(id: string): void {
    const index = this.placed.findIndex((entry) => entry.id === id);
    if (index >= 0) this.placed.splice(index, 1);
  }
}
