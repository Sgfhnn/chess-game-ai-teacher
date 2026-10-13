import FallbackWorker from './fallback.worker?worker&inline';
import type { Analysis, AnalyzeOptions, Engine } from './types';

type Pending = { id: number; resolve: (a: Analysis) => void; reject: (e: unknown) => void; cancelled: boolean };

/** Simple JS engine (used when Stockfish is unavailable). */
export class FallbackEngine implements Engine {
  readonly name = 'Built-in engine';
  ready: Promise<void>;
  private worker: Worker;
  private queue: { req: Record<string, unknown>; p: Pending }[] = [];
  private current: { req: Record<string, unknown>; p: Pending } | null = null;
  private nextId = 1;

  constructor() {
    this.worker = new FallbackWorker();
    this.ready = Promise.resolve();
    this.worker.onmessage = (e: MessageEvent<Analysis & { id: number }>) => {
      const cur = this.current;
      if (!cur || cur.p.id !== e.data.id) return;
      this.current = null;
      if (cur.p.cancelled) cur.p.reject(new Error('cancelled'));
      else cur.p.resolve(e.data);
      this.pump();
    };
  }

  private pump() {
    if (this.current) return;
    const next = this.queue.shift();
    if (!next) return;
    if (next.p.cancelled) {
      next.p.reject(new Error('cancelled'));
      this.pump();
      return;
    }
    this.current = next;
    this.worker.postMessage(next.req);
  }

  analyze(fen: string, opts: AnalyzeOptions): Promise<Analysis> {
    return new Promise<Analysis>((resolve, reject) => {
      const id = this.nextId++;
      const depth = Math.min(opts.depth ?? 4, 6);
      const movetime = opts.movetime ?? Math.min(6000, 400 * depth * depth);
      const req = { id, fen, depth, movetime, multipv: opts.multipv ?? 1, skill: opts.skill ?? 20 };
      this.queue.push({ req, p: { id, resolve, reject, cancelled: false } });
      this.pump();
    });
  }

  stop() {
    /* the fallback cannot be interrupted mid-search; it is time-bounded */
  }

  preempt() {
    for (const q of this.queue) {
      q.p.cancelled = true;
      q.p.reject(new Error('cancelled'));
    }
    this.queue = [];
  }

  cancelAll() {
    for (const q of this.queue) {
      q.p.cancelled = true;
      q.p.reject(new Error('cancelled'));
    }
    this.queue = [];
    if (this.current) this.current.p.cancelled = true;
  }

  destroy() {
    this.cancelAll();
    this.worker.terminate();
  }
}
