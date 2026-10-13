import { FallbackEngine } from './fallback';
import { StockfishEngine } from './stockfish';
import type { AnalyzeOptions, Engine } from './types';

export * from './types';

export type Level = 'simple' | 'medium' | 'hard' | 'expert' | 'max';
export const LEVELS: Level[] = ['simple', 'medium', 'hard', 'expert', 'max'];

export interface LevelInfo {
  id: Level;
  label: string;
  short: string;
  elo: string;
  description: string;
}

export const CPU_LEVELS: Record<Level, LevelInfo> = {
  simple: { id: 'simple', label: 'Simple', short: 'S', elo: '~800', description: 'Plays casually, makes mistakes. Great for beginners.' },
  medium: { id: 'medium', label: 'Medium', short: 'M', elo: '~1400', description: 'Solid club-player level. Punishes blunders.' },
  hard: { id: 'hard', label: 'Hard', short: 'H', elo: '~1900', description: 'Strong tactical play with few errors.' },
  expert: { id: 'expert', label: 'Expert', short: 'E', elo: '~2300', description: 'Master strength. Very hard to beat.' },
  max: { id: 'max', label: 'Max', short: 'MAX', elo: '2800+', description: 'Full engine strength. Unbeatable for humans.' },
};

export const TEACHER_LEVELS: Record<Level, LevelInfo> = {
  simple: { id: 'simple', label: 'Simple', short: 'S', elo: 'Quick', description: 'Fast, basic advice. Shows the best move and simple ideas.' },
  medium: { id: 'medium', label: 'Medium', short: 'M', elo: 'Balanced', description: 'Deeper analysis and richer explanations.' },
  hard: { id: 'hard', label: 'Hard', short: 'H', elo: 'Deep', description: 'Coach-level insight with threat detection.' },
  expert: { id: 'expert', label: 'Expert', short: 'E', elo: 'Deeper', description: 'Near-master analysis for every move.' },
  max: { id: 'max', label: 'Max', short: 'MAX', elo: 'Grandmaster', description: 'Maximum depth. The unbeatable teacher.' },
};

/** Search parameters for the CPU opponent at each level. */
export function cpuSearchOptions(level: Level): AnalyzeOptions {
  switch (level) {
    case 'simple':
      return { skill: 0, depth: 1, movetime: 400 };
    case 'medium':
      return { skill: 6, depth: 5, movetime: 800 };
    case 'hard':
      return { skill: 12, depth: 9, movetime: 1200 };
    case 'expert':
      return { skill: 17, depth: 14, movetime: 1800 };
    case 'max':
    default:
      return { skill: 20, depth: 24, movetime: 3000 };
  }
}

/** Search parameters for the teacher's analysis at each level. */
export function teacherSearchOptions(level: Level): AnalyzeOptions {
  switch (level) {
    case 'simple':
      return { skill: 20, depth: 8, movetime: 600 };
    case 'medium':
      return { skill: 20, depth: 12, movetime: 1200 };
    case 'hard':
      return { skill: 20, depth: 15, movetime: 1800 };
    case 'expert':
      return { skill: 20, depth: 18, movetime: 2500 };
    case 'max':
    default:
      return { skill: 20, depth: 24, movetime: 4000 };
  }
}

/** Create an engine; tries Stockfish, falls back to the built-in JS engine. */
export async function createEngine(): Promise<Engine> {
  try {
    const sf = new StockfishEngine();
    await sf.ready;
    return sf;
  } catch (err) {
    console.warn('Stockfish unavailable, using fallback engine', err);
    return new FallbackEngine();
  }
}
