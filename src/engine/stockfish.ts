import stockfishSource from './stockfish.asm.js?raw';
import type { Analysis, AnalyzeOptions, Engine, EngineLine } from './types';
import { parseUci } from './types';

type Job = {
  fen: string;
  opts: AnalyzeOptions;
  resolve: (a: Analysis) => void;
  reject: (e: unknown) => void;
  linesByDepth: Map<number, Map<number, EngineLine>>;
  cancelled: boolean;
};

/**
 * Pick a consistent set of multipv lines: the deepest iteration whose first line
 * agrees with the reported bestmove, topped up with distinct moves from earlier depths.
 */
function collectLines(byDepth: Map<number, Map<number, EngineLine>>, bestUci: string | null): EngineLine[] {
  const depths = [...byDepth.keys()].sort((a, b) => b - a);
  if (!depths.length) return [];
  const wanted = Math.max(...depths.map((d) => byDepth.get(d)!.size));
  // prefer the deepest iteration with a complete set of lines whose top move is the bestmove,
  // then any complete iteration, then the deepest iteration.
  const complete = depths.filter((d) => byDepth.get(d)!.size === wanted);
  const chosenDepth =
    (bestUci ? complete.find((d) => byDepth.get(d)!.get(1)?.pv[0] === bestUci) : undefined) ?? complete[0] ?? depths[0];
  const result: EngineLine[] = [];
  const seen = new Set<string>();
  const push = (l: EngineLine) => {
    if (seen.has(l.pv[0])) return;
    seen.add(l.pv[0]);
    result.push(l);
  };
  const primary = byDepth.get(chosenDepth)!;
  [...primary.entries()].sort((a, b) => a[0] - b[0]).forEach(([, l]) => push(l));
  // guarantee the best move is first (it may come from a deeper, partial iteration)
  if (bestUci && result[0]?.pv[0] !== bestUci) {
    const i = result.findIndex((l) => l.pv[0] === bestUci);
    if (i > 0) result.unshift(...result.splice(i, 1));
    else {
      for (const d of depths) {
        const l = [...byDepth.get(d)!.values()].find((x) => x.pv[0] === bestUci);
        if (l) {
          result.unshift(l);
          break;
        }
      }
    }
  }
  for (const d of depths) {
    if (result.length >= wanted) break;
    if (d === chosenDepth) continue;
    [...byDepth.get(d)!.entries()].sort((a, b) => a[0] - b[0]).forEach(([, l]) => result.length < wanted && push(l));
  }
  // keep the best move first, order the alternatives by score
  const val = (l: EngineLine) => (l.mate !== undefined ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.cp);
  const rest = result.slice(1).sort((a, b) => val(b) - val(a));
  return result.length ? [result[0], ...rest] : result;
}

let blobUrl: string | null = null;
function getBlobUrl() {
  if (!blobUrl) {
    blobUrl = URL.createObjectURL(new Blob([stockfishSource], { type: 'application/javascript' }));
  }
  return blobUrl;
}

/**
 * Wrapper around an inlined Stockfish (asm.js) running in a Web Worker,
 * exposing a promise-based analysis API with a job queue.
 */
export class StockfishEngine implements Engine {
  readonly name = 'Stockfish 10';
  ready: Promise<void>;
  private worker: Worker;
  private queue: Job[] = [];
  private current: Job | null = null;
  private waiters: { token: string; resolve: () => void }[] = [];
  private lastSkill = -1;
  private lastMultiPv = -1;
  private destroyed = false;

  constructor() {
    this.worker = new Worker(getBlobUrl());
    this.worker.onmessage = (e: MessageEvent) => this.onLine(String(e.data));
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Stockfish init timeout')), 20000);
      this.worker.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
      this.waitFor('uciok').then(() => {
        this.send('setoption name Hash value 32');
        this.send('setoption name Ponder value false');
        this.send('isready');
        return this.waitFor('readyok');
      }).then(() => {
        clearTimeout(timer);
        resolve();
      });
      this.send('uci');
    });
  }

  private send(cmd: string) {
    if (this.destroyed) return;
    this.worker.postMessage(cmd);
  }

  private waitFor(token: string) {
    return new Promise<void>((resolve) => this.waiters.push({ token, resolve }));
  }

  private onLine(line: string) {
    // generic waiters
    if (this.waiters.length) {
      const remaining: typeof this.waiters = [];
      for (const w of this.waiters) {
        if (line.startsWith(w.token)) w.resolve();
        else remaining.push(w);
      }
      this.waiters = remaining;
    }
    const job = this.current;
    if (!job) return;

    if (line.startsWith('info') && line.includes(' pv ')) {
      const depthM = /\bdepth (\d+)/.exec(line);
      const mpvM = /\bmultipv (\d+)/.exec(line);
      const cpM = /\bscore cp (-?\d+)/.exec(line);
      const mateM = /\bscore mate (-?\d+)/.exec(line);
      const pvM = / pv (.+)$/.exec(line);
      if (!depthM || !pvM) return;
      const idx = mpvM ? parseInt(mpvM[1], 10) : 1;
      const depth = parseInt(depthM[1], 10);
      const pv = pvM[1]
        .trim()
        .split(/\s+/)
        .filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t));
      if (!pv.length) return;
      const l: EngineLine = {
        depth,
        cp: cpM ? parseInt(cpM[1], 10) : mateM ? (parseInt(mateM[1], 10) > 0 ? 10000 : -10000) : 0,
        mate: mateM ? parseInt(mateM[1], 10) : undefined,
        pv,
      };
      let byIdx = job.linesByDepth.get(depth);
      if (!byIdx) {
        byIdx = new Map();
        job.linesByDepth.set(depth, byIdx);
      }
      byIdx.set(idx, l);
    } else if (line.startsWith('bestmove')) {
      const parts = line.split(/\s+/);
      const bm = parts[1] && parts[1] !== '(none)' ? parseUci(parts[1]) : null;
      const lines = collectLines(job.linesByDepth, bm ? parts[1] : null);
      const analysis: Analysis = {
        bestMove: bm,
        lines,
        depth: lines[0]?.depth ?? 0,
        fen: job.fen,
      };
      this.current = null;
      if (job.cancelled) job.reject(new Error('cancelled'));
      else job.resolve(analysis);
      this.pump();
    }
  }

  private pump() {
    if (this.current || this.destroyed) return;
    const job = this.queue.shift();
    if (!job) return;
    if (job.cancelled) {
      job.reject(new Error('cancelled'));
      this.pump();
      return;
    }
    this.current = job;
    const skill = job.opts.skill ?? 20;
    const multipv = job.opts.multipv ?? 1;
    if (skill !== this.lastSkill) {
      this.send(`setoption name Skill Level value ${skill}`);
      this.lastSkill = skill;
    }
    if (multipv !== this.lastMultiPv) {
      this.send(`setoption name MultiPV value ${multipv}`);
      this.lastMultiPv = multipv;
    }
    this.send(`position fen ${job.fen}`);
    const parts: string[] = ['go'];
    if (job.opts.depth) parts.push(`depth ${job.opts.depth}`);
    if (job.opts.movetime) parts.push(`movetime ${job.opts.movetime}`);
    if (parts.length === 1) parts.push('depth 12');
    this.send(parts.join(' '));
  }

  analyze(fen: string, opts: AnalyzeOptions): Promise<Analysis> {
    return new Promise<Analysis>((resolve, reject) => {
      const job: Job = { fen, opts, resolve, reject, linesByDepth: new Map(), cancelled: false };
      this.queue.push(job);
      this.ready.then(() => this.pump(), reject);
    });
  }

  stop() {
    if (this.current) this.send('stop');
  }

  preempt() {
    for (const j of this.queue) {
      j.cancelled = true;
      j.reject(new Error('cancelled'));
    }
    this.queue = [];
    if (this.current) this.send('stop');
  }

  cancelAll() {
    for (const j of this.queue) {
      j.cancelled = true;
      j.reject(new Error('cancelled'));
    }
    this.queue = [];
    if (this.current) {
      this.current.cancelled = true;
      this.send('stop');
    }
  }

  destroy() {
    this.cancelAll();
    this.destroyed = true;
    this.worker.terminate();
  }
}
