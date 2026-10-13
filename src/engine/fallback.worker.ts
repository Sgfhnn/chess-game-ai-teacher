/// <reference lib="webworker" />
import { Chess, type Move } from 'chess.js';

// A compact alpha-beta engine used only when Stockfish cannot be started.
const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables (from white's perspective, a8..h1 order)
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15,
    20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10,
    5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
    -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0,
    0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0,
    -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
    -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
    -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20,
    -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

function evaluate(chess: Chess): number {
  // returns score from white's perspective
  const board = chess.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const idx = p.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const v = VAL[p.type] + PST[p.type][idx];
      score += p.color === 'w' ? v : -v;
    }
  }
  return score;
}

let nodes = 0;
let deadline = 0;
let aborted = false;

function orderMoves(moves: Move[]): Move[] {
  return moves
    .map((m) => {
      let s = 0;
      if (m.captured) s += 10 * VAL[m.captured] - VAL[m.piece];
      if (m.promotion) s += 800;
      if (m.san.includes('+')) s += 50;
      return { m, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

function quiesce(chess: Chess, alpha: number, beta: number, color: number, depth: number): number {
  nodes++;
  const stand = color * evaluate(chess);
  if (stand >= beta) return beta;
  if (alpha < stand) alpha = stand;
  if (depth <= 0) return alpha;
  const caps = orderMoves(chess.moves({ verbose: true }).filter((m) => m.captured));
  for (const m of caps) {
    chess.move(m);
    const score = -quiesce(chess, -beta, -alpha, -color, depth - 1);
    chess.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(chess: Chess, depth: number, alpha: number, beta: number, color: number, ply: number): number {
  if ((nodes & 1023) === 0 && Date.now() > deadline) aborted = true;
  if (aborted) return 0;
  if (chess.isCheckmate()) return -100000 + ply;
  if (chess.isDraw() || chess.isStalemate()) return 0;
  if (depth <= 0) return quiesce(chess, alpha, beta, color, 6);
  const moves = orderMoves(chess.moves({ verbose: true }));
  let best = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const score = -negamax(chess, depth - 1, -beta, -alpha, -color, ply + 1);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

interface Req {
  id: number;
  fen: string;
  depth: number;
  movetime: number;
  multipv: number;
  skill: number;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, fen, depth, movetime, multipv, skill } = e.data;
  const chess = new Chess(fen);
  const color = chess.turn() === 'w' ? 1 : -1;
  const rootMoves = orderMoves(chess.moves({ verbose: true }));
  nodes = 0;
  aborted = false;
  deadline = Date.now() + movetime;

  let results: { move: Move; score: number; pv: string[] }[] = rootMoves.map((m) => ({ move: m, score: 0, pv: [] }));
  let reachedDepth = 0;
  for (let d = 1; d <= depth; d++) {
    const iter: typeof results = [];
    let bestSoFar = -Infinity;
    for (const r of results) {
      chess.move(r.move);
      // full-window for accurate multipv ranking of the top moves, else aspiration via alpha
      const useFull = iter.length < multipv;
      const alpha = useFull ? -Infinity : bestSoFar - 1;
      let score = -negamax(chess, d - 1, -Infinity, -alpha, -color, 1);
      chess.undo();
      if (aborted) break;
      if (score > bestSoFar) bestSoFar = score;
      iter.push({ move: r.move, score, pv: [r.move.from + r.move.to + (r.move.promotion ?? '')] });
    }
    if (aborted) break;
    iter.sort((a, b) => b.score - a.score);
    results = iter;
    reachedDepth = d;
    if (Math.abs(results[0]?.score ?? 0) > 90000) break;
  }

  // Skill: lower skill -> chance to pick a worse move
  let chosen = results[0];
  if (skill < 20 && results.length > 1) {
    const noise = (20 - skill) * 15;
    const candidates = results.filter((r) => results[0].score - r.score <= noise);
    chosen = candidates[Math.floor(Math.random() * candidates.length)];
  }

  const lines = results.slice(0, Math.max(1, multipv)).map((r) => ({
    cp: Math.abs(r.score) > 90000 ? (r.score > 0 ? 10000 : -10000) : r.score,
    mate: Math.abs(r.score) > 90000 ? (r.score > 0 ? Math.ceil((100000 - r.score) / 2) : -Math.ceil((100000 + r.score) / 2)) : undefined,
    pv: r.pv,
    depth: reachedDepth,
  }));
  // make sure the chosen move is the first line for the CPU
  if (chosen && chosen !== results[0]) {
    const i = results.indexOf(chosen);
    const cl = {
      cp: Math.abs(chosen.score) > 90000 ? (chosen.score > 0 ? 10000 : -10000) : chosen.score,
      mate: undefined,
      pv: chosen.pv,
      depth: reachedDepth,
    };
    if (i < lines.length) lines.splice(i, 1);
    lines.unshift(cl);
  }
  self.postMessage({
    id,
    bestMove: chosen ? { from: chosen.move.from, to: chosen.move.to, promotion: chosen.move.promotion } : null,
    lines,
    depth: reachedDepth,
    fen,
  });
};
