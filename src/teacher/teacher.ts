import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Analysis, UciMove } from '../engine/types';
import { lineToWhiteCp } from '../engine/types';

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export type Verdict = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const VERDICT_META: Record<Verdict, { label: string; emoji: string; color: string; bg: string }> = {
  best: { label: 'Best move', emoji: '★', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-400/40' },
  excellent: { label: 'Excellent', emoji: '!', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-400/30' },
  good: { label: 'Good', emoji: '✓', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-400/30' },
  inaccuracy: { label: 'Inaccuracy', emoji: '?!', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-400/30' },
  mistake: { label: 'Mistake', emoji: '?', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-400/30' },
  blunder: { label: 'Blunder', emoji: '??', color: 'text-rose-300', bg: 'bg-rose-500/10 border-rose-400/40' },
};

export interface Feedback {
  ply: number;
  san: string;
  color: Color;
  verdict: Verdict;
  headline: string;
  details: string[];
  better?: { san: string; reason: string; line: string };
  evalBefore: number; // white cp
  evalAfter: number; // white cp
}

export interface Hint {
  uci: UciMove;
  san: string;
  reason: string;
  whiteCp: number;
  line: string;
}

export interface Threat {
  square: Square;
  piece: PieceSymbol;
  text: string;
  severity: 'high' | 'medium';
}

export function formatEval(whiteCp: number, perspective: Color = 'w'): string {
  const v = perspective === 'w' ? whiteCp : -whiteCp;
  if (Math.abs(v) >= 90000) {
    const n = 100000 - Math.abs(v);
    if (n === 0) return '#';
    return (v > 0 ? 'M' : '-M') + n;
  }
  const p = v / 100;
  return (p > 0 ? '+' : '') + p.toFixed(1);
}

export function uciToSan(fen: string, m: UciMove): string {
  try {
    const c = new Chess(fen);
    const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion as PieceSymbol | undefined });
    return mv.san;
  } catch {
    return m.from + m.to;
  }
}

export function pvToSan(fen: string, pv: string[], max = 4): string {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as PieceSymbol | undefined });
      const num = mv.color === 'w' ? `${Math.ceil(c.moveNumber() - 0)}.` : out.length === 0 ? `${c.moveNumber() - 1}...` : '';
      out.push((num ? num : '') + mv.san);
    } catch {
      break;
    }
  }
  return out.join(' ');
}

/** Pieces of `color` that are attacked and not adequately defended. */
export function findHangingPieces(chess: Chess, color: Color): Threat[] {
  const threats: Threat[] = [];
  const opp: Color = color === 'w' ? 'b' : 'w';
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === 'k') continue;
      const attackers = chess.attackers(sq.square, opp);
      if (attackers.length === 0) continue;
      const defenders = chess.attackers(sq.square, color);
      const minAttacker = Math.min(...attackers.map((a) => PIECE_VALUE[chess.get(a)!.type]));
      const val = PIECE_VALUE[sq.type];
      if (defenders.length === 0) {
        threats.push({
          square: sq.square,
          piece: sq.type,
          text: `Your ${PIECE_NAME[sq.type]} on ${sq.square} is attacked and undefended.`,
          severity: val >= 3 ? 'high' : 'medium',
        });
      } else if (minAttacker < val) {
        const attackerPiece = chess.get(attackers.find((a) => PIECE_VALUE[chess.get(a)!.type] === minAttacker)!)!;
        threats.push({
          square: sq.square,
          piece: sq.type,
          text: `Your ${PIECE_NAME[sq.type]} on ${sq.square} can be taken by a ${PIECE_NAME[attackerPiece.type]} (worth less).`,
          severity: 'high',
        });
      }
    }
  }
  return threats.sort((a, b) => PIECE_VALUE[b.piece] - PIECE_VALUE[a.piece]);
}

interface MoveFeatures {
  positives: string[];
  negatives: string[];
}

/** Explain a move with chess-principle reasoning (no engine required). */
export function describeMove(fenBefore: string, move: UciMove): MoveFeatures {
  const before = new Chess(fenBefore);
  const positives: string[] = [];
  const negatives: string[] = [];
  let mv: Move;
  try {
    mv = before.move({ from: move.from, to: move.to, promotion: move.promotion as PieceSymbol | undefined });
  } catch {
    return { positives, negatives };
  }
  const after = before; // chess.js mutated
  const me = mv.color;
  const opp: Color = me === 'w' ? 'b' : 'w';
  const pieceName = PIECE_NAME[mv.piece];
  const ply = after.history().length;
  const moveNo = new Chess(fenBefore).moveNumber();

  if (after.isCheckmate()) {
    positives.push('Checkmate! The game is over.');
    return { positives, negatives };
  }
  if (mv.isKingsideCastle() || mv.isQueensideCastle()) {
    positives.push('Castling tucks the king to safety and connects the rooks.');
  }
  if (mv.promotion) positives.push(`Promotes the pawn to a ${PIECE_NAME[mv.promotion]}.`);
  if (mv.captured) {
    const capVal = PIECE_VALUE[mv.captured];
    const wasDefended = after.attackers(mv.to, opp).length > 0;
    if (!wasDefended) positives.push(`Wins a free ${PIECE_NAME[mv.captured]} on ${mv.to}.`);
    else if (capVal > PIECE_VALUE[mv.piece]) positives.push(`Captures a ${PIECE_NAME[mv.captured]} with a less valuable ${pieceName} — a good trade.`);
    else if (capVal === PIECE_VALUE[mv.piece]) positives.push(`Trades ${pieceName} for ${PIECE_NAME[mv.captured]}.`);
    else positives.push(`Captures the ${PIECE_NAME[mv.captured]} on ${mv.to}.`);
  }
  if (after.inCheck()) positives.push('Gives check, forcing the opponent to respond.');

  // Development & center in the opening
  if (moveNo <= 12) {
    const backRank = me === 'w' ? '1' : '8';
    if ((mv.piece === 'n' || mv.piece === 'b') && mv.from[1] === backRank) positives.push(`Develops the ${pieceName} toward the action.`);
    if (mv.piece === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(mv.to)) positives.push('Claims space in the center.');
    if (mv.piece === 'q' && moveNo <= 6 && !mv.captured) negatives.push('Bringing the queen out early can let the opponent gain time by attacking it.');
    if (mv.piece === 'k' && !mv.isKingsideCastle() && !mv.isQueensideCastle() && !mv.captured) negatives.push('Moving the king early loses castling rights and safety.');
    if (mv.piece === 'p' && ['f3', 'g4', 'f6', 'g5', 'h4', 'h5', 'a4', 'a5'].includes(mv.to) && !mv.captured && moveNo <= 8) {
      negatives.push('This flank pawn move weakens king safety and does not help development.');
    }
  }

  // Is the moved piece now hanging?
  if (mv.piece !== 'k') {
    const attackers = after.attackers(mv.to, opp);
    const defenders = after.attackers(mv.to, me);
    if (attackers.length) {
      const minAtt = Math.min(...attackers.map((a) => PIECE_VALUE[after.get(a)!.type]));
      if (defenders.length === 0) negatives.push(`The ${pieceName} on ${mv.to} is left undefended and can be captured.`);
      else if (minAtt < PIECE_VALUE[mv.piece]) negatives.push(`The ${pieceName} on ${mv.to} can be captured by a cheaper piece.`);
    }
  }

  // Did the move rescue an attacked piece?
  {
    const pre = new Chess(fenBefore);
    const preAtt = pre.attackers(mv.from, opp);
    const preDef = pre.attackers(mv.from, me);
    const preMinAtt = preAtt.length ? Math.min(...preAtt.map((a) => PIECE_VALUE[pre.get(a)!.type])) : 999;
    const wasInDanger = preAtt.length > 0 && (preDef.length === 0 || preMinAtt < PIECE_VALUE[mv.piece]);
    const nowAtt = after.attackers(mv.to, opp);
    if (wasInDanger && nowAtt.length === 0 && mv.piece !== 'k') positives.push(`Moves the ${pieceName} out of danger.`);
  }

  // Threats created by the moved piece (forks, attacks on valuable/undefended pieces)
  {
    const targets: { sq: Square; type: PieceSymbol }[] = [];
    // Use pseudo-move generation: pieces the moved piece now attacks
    const fenParts = after.fen().split(' ');
    fenParts[1] = me; // pretend it's our move again
    fenParts[3] = '-';
    try {
      const probe = new Chess(fenParts.join(' '));
      const myMoves = probe.moves({ square: mv.to, verbose: true });
      for (const m of myMoves) {
        if (!m.captured || m.captured === 'k') continue;
        const defended = probe.attackers(m.to, opp).length > 0;
        if (!defended || PIECE_VALUE[m.captured] > PIECE_VALUE[mv.piece]) targets.push({ sq: m.to, type: m.captured });
      }
    } catch {
      /* ignore */
    }
    if (targets.length >= 2) {
      positives.push(`Forks the ${targets.map((t) => PIECE_NAME[t.type]).join(' and ')} — the opponent cannot save both.`);
    } else if (targets.length === 1) {
      positives.push(`Threatens the ${PIECE_NAME[targets[0].type]} on ${targets[0].sq}.`);
    }
  }

  // Leaving other pieces hanging
  {
    const hanging = findHangingPieces(after, me).filter((t) => t.square !== mv.to);
    const pre = findHangingPieces(new Chess(fenBefore), me).map((t) => t.square);
    const newly = hanging.filter((h) => !pre.includes(h.square));
    if (newly.length) negatives.push(`This leaves your ${PIECE_NAME[newly[0].piece]} on ${newly[0].square} exposed.`);
  }

  // Endgame king activity
  const pieceCount = after.board().flat().filter(Boolean).length;
  if (pieceCount <= 10 && mv.piece === 'k' && ply > 40) positives.push('Activates the king — a key endgame principle.');
  if (mv.piece === 'p' && pieceCount <= 12) {
    const rank = parseInt(mv.to[1], 10);
    if ((me === 'w' && rank >= 6) || (me === 'b' && rank <= 3)) positives.push('Pushes a passed pawn closer to promotion.');
  }

  return { positives, negatives };
}

export function classify(lossCp: number, isBest: boolean, evalBeforeUser: number, evalAfterUser: number): Verdict {
  if (isBest) return 'best';
  // Both totally winning/lost: be lenient
  if (Math.abs(evalBeforeUser) >= 90000 && Math.abs(evalAfterUser) >= 90000 && Math.sign(evalBeforeUser) === Math.sign(evalAfterUser)) {
    return 'good';
  }
  if (evalBeforeUser >= 90000 && evalAfterUser < 90000) return evalAfterUser > 300 ? 'mistake' : 'blunder';
  if (evalAfterUser <= -90000 && evalBeforeUser > -90000) return 'blunder';
  if (lossCp <= 15) return 'excellent';
  if (lossCp <= 50) return 'good';
  if (lossCp <= 110) return 'inaccuracy';
  if (lossCp <= 250) return 'mistake';
  return 'blunder';
}

export function buildFeedback(params: {
  ply: number;
  fenBefore: string;
  fenAfter: string;
  move: Move;
  pre: Analysis | null; // analysis of the position before the move (mover to play)
  post: Analysis | null; // analysis of the position after the move (opponent to play)
}): Feedback {
  const { ply, fenBefore, fenAfter, move, pre, post } = params;
  const me = move.color;
  const preLine = pre?.lines[0];
  const postLine = post?.lines[0];
  const playedUci = move.from + move.to + (move.promotion ?? '');
  const after = new Chess(fenAfter);
  // Prefer comparing within the same analysis (same depth) when the played move was among the top lines.
  const playedLine = pre?.lines.find((l) => l.pv[0] === playedUci);
  const evalBefore = preLine ? lineToWhiteCp(preLine, me) : 0;
  const evalAfterPost = postLine ? lineToWhiteCp(postLine, me === 'w' ? 'b' : 'w') : null;
  const evalAfter = after.isGameOver() && evalAfterPost !== null ? evalAfterPost : playedLine ? lineToWhiteCp(playedLine, me) : (evalAfterPost ?? evalBefore);
  const sign = me === 'w' ? 1 : -1;
  const userBefore = evalBefore * sign;
  const userAfter = evalAfter * sign;
  const loss = Math.max(0, userBefore - userAfter);
  const isBest = !!pre?.bestMove && pre.bestMove.from + pre.bestMove.to + (pre.bestMove.promotion ?? '') === playedUci;
  const reliable = !!preLine && (!!postLine || !!playedLine);
  const verdict: Verdict = after.isCheckmate() ? 'best' : !reliable ? (isBest ? 'best' : 'good') : classify(loss, isBest, userBefore, userAfter);

  const feats = describeMove(fenBefore, { from: move.from, to: move.to, promotion: move.promotion });
  const details: string[] = [];
  let headline = '';

  switch (verdict) {
    case 'best':
      headline = after.isCheckmate() ? `${move.san} — checkmate!` : `${move.san} is the best move.`;
      break;
    case 'excellent':
      headline = `${move.san} is an excellent move.`;
      break;
    case 'good':
      headline = `${move.san} is a fine move.`;
      break;
    case 'inaccuracy':
      headline = `${move.san} is a slight inaccuracy.`;
      break;
    case 'mistake':
      headline = `${move.san} is a mistake.`;
      break;
    case 'blunder':
      headline = `${move.san} is a blunder!`;
      break;
  }

  if (verdict === 'best' || verdict === 'excellent' || verdict === 'good') {
    details.push(...feats.positives.slice(0, 2));
    if (feats.negatives.length && verdict === 'good') details.push('Note: ' + feats.negatives[0]);
  } else {
    details.push(...feats.negatives.slice(0, 2));
    if (feats.positives.length && details.length === 0) details.push(`It does ${feats.positives[0].charAt(0).toLowerCase()}${feats.positives[0].slice(1)} but there was something stronger.`);
    // Explain punishment via the opponent's best reply
    if (postLine && postLine.pv.length) {
      const replyUci = postLine.pv[0];
      try {
        const c = new Chess(fenAfter);
        const reply = c.move({ from: replyUci.slice(0, 2), to: replyUci.slice(2, 4), promotion: replyUci[4] as PieceSymbol | undefined });
        if (postLine.mate !== undefined && postLine.mate > 0) {
          details.push(`It allows a forced mate in ${postLine.mate} starting with ${reply.san}.`);
        } else if (reply.captured) {
          details.push(`The opponent can now play ${reply.san}, winning a ${PIECE_NAME[reply.captured]}.`);
        } else if (c.inCheck()) {
          details.push(`The opponent gets a strong check with ${reply.san}.`);
        } else {
          details.push(`The strongest reply is ${reply.san}.`);
        }
      } catch {
        /* ignore */
      }
    }
    if (preLine?.mate !== undefined && preLine.mate > 0 && !(postLine?.mate !== undefined && postLine.mate < 0)) {
      details.unshift(`You missed a forced mate in ${preLine.mate}!`);
    }
  }
  if (loss > 0 && verdict !== 'best' && verdict !== 'excellent') {
    details.push(`Evaluation dropped by about ${(loss / 100).toFixed(1)} pawns.`);
  }

  let better: Feedback['better'] | undefined;
  if (pre?.bestMove && !isBest && (verdict === 'inaccuracy' || verdict === 'mistake' || verdict === 'blunder')) {
    const bestSan = uciToSan(fenBefore, pre.bestMove);
    const bf = describeMove(fenBefore, pre.bestMove);
    let reason = bf.positives[0] ?? 'It keeps the position under control.';
    if (preLine?.mate !== undefined && preLine.mate > 0) reason = `It leads to checkmate in ${preLine.mate}.`;
    better = { san: bestSan, reason, line: pvToSan(fenBefore, preLine?.pv ?? [], 5) };
  }

  return { ply, san: move.san, color: me, verdict, headline, details, better, evalBefore, evalAfter };
}

export function buildHints(fen: string, analysis: Analysis, max = 3): Hint[] {
  const turn = new Chess(fen).turn();
  const hints: Hint[] = [];
  const seen = new Set<string>();
  for (const line of analysis.lines.slice(0, max)) {
    const u = line.pv[0];
    if (!u || seen.has(u)) continue;
    seen.add(u);
    const uci: UciMove = { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] };
    const feats = describeMove(fen, uci);
    let reason = feats.positives[0] ?? '';
    if (line.mate !== undefined && line.mate > 0) reason = `Forces checkmate in ${line.mate}.`;
    if (!reason) reason = genericReason(fen, uci);
    hints.push({ uci, san: uciToSan(fen, uci), reason, whiteCp: lineToWhiteCp(line, turn), line: pvToSan(fen, line.pv, 5) });
  }
  return hints;
}

function genericReason(fen: string, uci: UciMove): string {
  const c = new Chess(fen);
  const p = c.get(uci.from as Square);
  if (!p) return 'A solid, flexible move.';
  switch (p.type) {
    case 'p':
      return 'Improves the pawn structure and gains space.';
    case 'n':
    case 'b':
      return `Puts the ${PIECE_NAME[p.type]} on a more active square.`;
    case 'r':
      return 'Brings the rook to a more useful file.';
    case 'q':
      return 'Improves the queen while keeping it safe.';
    case 'k':
      return 'Improves king safety.';
    default:
      return 'A solid, flexible move.';
  }
}

/** A general principle relevant to the current phase of the game. */
export function principleTip(fen: string): string {
  const c = new Chess(fen);
  const pieces = c.board().flat().filter(Boolean);
  const moveNo = c.moveNumber();
  const turn = c.turn();
  const myBackRank = turn === 'w' ? '1' : '8';
  const undeveloped = pieces.filter((p) => p!.color === turn && (p!.type === 'n' || p!.type === 'b') && p!.square[1] === myBackRank).length;
  const kingSq = pieces.find((p) => p!.color === turn && p!.type === 'k')!.square;
  const castled = turn === 'w' ? ['g1', 'c1', 'b1', 'h1'].includes(kingSq) : ['g8', 'c8', 'b8', 'h8'].includes(kingSq);
  if (moveNo <= 12) {
    if (undeveloped >= 2) return 'Opening principle: develop your knights and bishops before moving the same piece twice.';
    if (!castled && c.getCastlingRights(turn).k) return 'Opening principle: castle early to protect your king and activate a rook.';
    return 'Opening principle: fight for the center and connect your rooks.';
  }
  if (pieces.length <= 12) {
    return 'Endgame principle: activate your king and push passed pawns — every tempo matters.';
  }
  const tips = [
    'Middlegame: before every move ask "what does my opponent threaten?"',
    'Middlegame: look for checks, captures and threats — in that order.',
    'Middlegame: improve your worst-placed piece.',
    'Middlegame: rooks belong on open files; knights love outposts.',
  ];
  return tips[moveNo % tips.length];
}
