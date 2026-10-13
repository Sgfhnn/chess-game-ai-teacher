export type UciMove = { from: string; to: string; promotion?: string };

export interface EngineLine {
  /** Score in centipawns from the perspective of the side to move. */
  cp: number;
  /** Mate in N (positive = side to move mates). */
  mate?: number;
  /** Principal variation as UCI moves. */
  pv: string[];
  depth: number;
}

export interface Analysis {
  bestMove: UciMove | null;
  lines: EngineLine[]; // sorted best first
  depth: number;
  fen: string;
}

export interface AnalyzeOptions {
  depth?: number;
  movetime?: number; // ms
  multipv?: number;
  skill?: number; // 0..20
}

export interface Engine {
  readonly name: string;
  ready: Promise<void>;
  analyze(fen: string, opts: AnalyzeOptions): Promise<Analysis>;
  stop(): void;
  /** Drop queued jobs and hurry the running one (it still resolves with partial results). */
  preempt(): void;
  cancelAll(): void;
  destroy(): void;
}

export function parseUci(m: string): UciMove {
  return { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.length > 4 ? m[4] : undefined };
}

/** Convert an engine line score to white's perspective in centipawns (mates mapped to +/-100000). */
export function lineToWhiteCp(line: EngineLine, sideToMove: 'w' | 'b'): number {
  let v: number;
  if (line.mate !== undefined) v = line.mate > 0 ? 100000 - line.mate : -100000 - line.mate;
  else v = line.cp;
  return sideToMove === 'w' ? v : -v;
}
