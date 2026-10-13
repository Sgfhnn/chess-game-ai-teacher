import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cpuSearchOptions, teacherSearchOptions, type Analysis, type Engine, type Level, type UciMove, lineToWhiteCp } from '../engine';
import { findOpening } from '../teacher/openings';
import { buildFeedback, buildHints, describeMove, findHangingPieces, type Feedback, type Hint, type Threat } from '../teacher/teacher';

export type Mode = 'cpu' | 'cpu-teacher' | 'human';

export interface GameConfig {
  mode: Mode;
  playerColor: Color;
  cpuLevel: Level;
  teacherLevel: Level;
  teacherEnabled: boolean;
  autoHints: boolean;
}

export interface HistoryEntry {
  ply: number;
  san: string;
  move: Move;
  color: Color;
  fenBefore: string;
  fenAfter: string;
}

export interface GameStatus {
  over: boolean;
  result: 'white' | 'black' | 'draw' | null;
  reason: string;
}

export interface OpponentNote {
  san: string;
  notes: string[];
}

const START_FEN = new Chess().fen();

function terminalAnalysis(chess: Chess): Analysis | null {
  if (chess.isCheckmate()) return { bestMove: null, lines: [{ cp: -10000, mate: 0, pv: [], depth: 0 }], depth: 0, fen: chess.fen() };
  if (chess.isGameOver()) return { bestMove: null, lines: [{ cp: 0, pv: [], depth: 0 }], depth: 0, fen: chess.fen() };
  return null;
}

function computeStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) {
    return { over: true, result: chess.turn() === 'w' ? 'black' : 'white', reason: 'Checkmate' };
  }
  if (chess.isStalemate()) return { over: true, result: 'draw', reason: 'Stalemate' };
  if (chess.isThreefoldRepetition()) return { over: true, result: 'draw', reason: 'Threefold repetition' };
  if (chess.isInsufficientMaterial()) return { over: true, result: 'draw', reason: 'Insufficient material' };
  if (chess.isDrawByFiftyMoves()) return { over: true, result: 'draw', reason: '50-move rule' };
  return { over: false, result: null, reason: '' };
}

export function useChessGame(config: GameConfig, cpuEngine: Engine | null, teacherEngine: Engine | null) {
  const { mode, playerColor, cpuLevel, teacherLevel, teacherEnabled } = config;
  const chessRef = useRef(new Chess());
  const genRef = useRef(0);
  const cacheRef = useRef(new Map<string, Analysis>());
  const feedbackPliesRef = useRef(new Set<number>());

  const [fen, setFen] = useState(START_FEN);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<GameStatus>({ over: false, result: null, reason: '' });
  const [cpuThinking, setCpuThinking] = useState(false);
  const [teacherThinking, setTeacherThinking] = useState(false);
  const [hints, setHints] = useState<Hint[] | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [opponentNote, setOpponentNote] = useState<OpponentNote | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  const turn = useMemo(() => fen.split(' ')[1] as Color, [fen]);
  const isHumanTurn = mode === 'human' || turn === playerColor;
  const opening = useMemo(() => findOpening(history.map((h) => h.san)), [history]);

  const sync = useCallback(() => {
    const chess = chessRef.current;
    setFen(chess.fen());
    setStatus(computeStatus(chess));
  }, []);

  /** Apply a move to the board (validated). Returns true if legal. */
  const applyMove = useCallback(
    (m: UciMove): boolean => {
      const chess = chessRef.current;
      const fenBefore = chess.fen();
      let mv: Move;
      try {
        mv = chess.move({ from: m.from, to: m.to, promotion: (m.promotion as PieceSymbol | undefined) ?? undefined });
      } catch {
        return false;
      }
      const entry: HistoryEntry = {
        ply: chess.history().length,
        san: mv.san,
        move: mv,
        color: mv.color,
        fenBefore,
        fenAfter: chess.fen(),
      };
      setHistory((h) => [...h, entry]);
      setLastMove({ from: mv.from, to: mv.to });
      setHints(null);
      sync();
      return true;
    },
    [sync],
  );

  const makeHumanMove = useCallback(
    (m: UciMove): boolean => {
      if (status.over || !isHumanTurn || cpuThinking) return false;
      return applyMove(m);
    },
    [applyMove, status.over, isHumanTurn, cpuThinking],
  );

  const legalMovesFrom = useCallback((sq: Square): Move[] => {
    return chessRef.current.moves({ square: sq, verbose: true });
  }, []);

  const newGame = useCallback(() => {
    genRef.current++;
    cpuEngine?.cancelAll();
    teacherEngine?.cancelAll();
    chessRef.current = new Chess();
    cacheRef.current.clear();
    feedbackPliesRef.current.clear();
    setHistory([]);
    setFeedbacks([]);
    setHints(null);
    setThreats([]);
    setEvalCp(null);
    setOpponentNote(null);
    setLastMove(null);
    setCpuThinking(false);
    setTeacherThinking(false);
    sync();
  }, [cpuEngine, teacherEngine, sync]);

  const undo = useCallback(() => {
    const chess = chessRef.current;
    if (chess.history().length === 0) return;
    genRef.current++;
    cpuEngine?.cancelAll();
    teacherEngine?.preempt();
    setCpuThinking(false);
    if (mode !== 'human') {
      // undo back to the human's turn
      chess.undo();
      while (chess.history().length > 0 && chess.turn() !== playerColor) {
        chess.undo();
      }
    } else {
      chess.undo();
    }
    const newLen = chess.history().length;
    setHistory((h) => h.slice(0, newLen));
    setFeedbacks((f) => f.filter((x) => x.ply <= newLen));
    feedbackPliesRef.current = new Set([...feedbackPliesRef.current].filter((p) => p <= newLen));
    setHints(null);
    setOpponentNote(null);
    const hist = chess.history({ verbose: true });
    const last = hist[hist.length - 1];
    setLastMove(last ? { from: last.from, to: last.to } : null);
    sync();
  }, [cpuEngine, teacherEngine, mode, playerColor, sync]);

  const resign = useCallback(() => {
    if (status.over) return;
    genRef.current++;
    cpuEngine?.cancelAll();
    setCpuThinking(false);
    const loser: Color = mode === 'human' ? turn : playerColor;
    setStatus({ over: true, result: loser === 'w' ? 'black' : 'white', reason: `${loser === 'w' ? 'White' : 'Black'} resigned` });
  }, [status.over, cpuEngine, mode, turn, playerColor]);

  // ---- CPU opponent ----
  useEffect(() => {
    if (!cpuEngine || mode === 'human' || status.over || isHumanTurn) return;
    let stale = false;
    const gen = genRef.current;
    const started = Date.now();
    setCpuThinking(true);
    cpuEngine
      .analyze(fen, cpuSearchOptions(cpuLevel))
      .then(async (a) => {
        if (stale || gen !== genRef.current) return;
        let move = a.bestMove;
        if (!move) {
          const moves = chessRef.current.moves({ verbose: true });
          if (!moves.length) return;
          const r = moves[Math.floor(Math.random() * moves.length)];
          move = { from: r.from, to: r.to, promotion: r.promotion };
        }
        const wait = Math.max(0, 450 - (Date.now() - started));
        await new Promise((r) => setTimeout(r, wait));
        if (stale || gen !== genRef.current) return;
        setCpuThinking(false);
        applyMove(move);
      })
      .catch(() => {
        if (!stale) setCpuThinking(false);
      });
    return () => {
      stale = true;
      cpuEngine.cancelAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, cpuEngine, mode, status.over, isHumanTurn, cpuLevel]);

  // ---- Teacher / analyst ----
  useEffect(() => {
    if (!teacherEngine || !teacherEnabled) {
      setHints(null);
      setThreats([]);
      setTeacherThinking(false);
      return;
    }
    let stale = false;
    const gen = genRef.current;
    const chess = new Chess(fen);
    const curFen = fen;
    const opts = teacherSearchOptions(teacherLevel);
    const cache = cacheRef.current;

    // Static, instant information
    setThreats(status.over || !isHumanTurn ? [] : findHangingPieces(chess, turn));
    const last = history[history.length - 1];
    if (last && mode !== 'human' && last.color !== playerColor) {
      const feats = describeMove(last.fenBefore, { from: last.move.from, to: last.move.to, promotion: last.move.promotion });
      const notes = feats.positives.filter((p) => /Threatens|Forks|check|Captures|Wins|Trades|Checkmate/i.test(p));
      setOpponentNote({ san: last.san, notes });
    } else {
      setOpponentNote(null);
    }

    const minDepth = Math.round((opts.depth ?? 12) * 0.6);
    const getAnalysis = async (f: string, multipv: number): Promise<Analysis> => {
      const cached = cache.get(f);
      if (cached && (cached.bestMove === null || (cached.lines.length >= multipv && cached.depth >= minDepth))) return cached;
      const term = terminalAnalysis(new Chess(f));
      if (term) {
        cache.set(f, term);
        return term;
      }
      const a = await teacherEngine.analyze(f, { ...opts, multipv });
      const prev = cache.get(f);
      if (!prev || prev.depth <= a.depth || a.lines.length > prev.lines.length) cache.set(f, a);
      return a;
    };

    const publishCurrent = (a: Analysis) => {
      if (a.lines[0]) setEvalCp(lineToWhiteCp(a.lines[0], turn));
      if (isHumanTurn && !status.over) setHints(buildHints(curFen, a));
    };

    const run = async () => {
      setTeacherThinking(true);
      // small debounce so a preempted search can land in the cache first
      await new Promise((r) => setTimeout(r, 60));
      if (stale || gen !== genRef.current) return;
      // 1) feedback for recent human moves that have none yet
      const pending = history.filter((h) => mode === 'human' || h.color === playerColor).slice(-2);
      let currentDone = false;
      for (const h of pending) {
        if (stale || gen !== genRef.current) return;
        if (feedbackPliesRef.current.has(h.ply)) continue;
        const isCurrent = h.fenAfter === curFen;
        const postA = await getAnalysis(h.fenAfter, isCurrent ? 3 : 1);
        if (stale || gen !== genRef.current) return;
        if (isCurrent) {
          publishCurrent(postA);
          currentDone = true;
        }
        const preA = await getAnalysis(h.fenBefore, 3);
        if (stale || gen !== genRef.current) return;
        const fb = buildFeedback({ ply: h.ply, fenBefore: h.fenBefore, fenAfter: h.fenAfter, move: h.move, pre: preA, post: postA });
        feedbackPliesRef.current.add(fb.ply);
        setFeedbacks((f) => (f.some((x) => x.ply === fb.ply) ? f : [...f, fb].sort((a, b) => a.ply - b.ply)));
      }
      // 2) analyse the current position (evaluation + hints)
      if (!currentDone) {
        const cur = await getAnalysis(curFen, 3);
        if (stale || gen !== genRef.current) return;
        publishCurrent(cur);
      }
    };
    run()
      .catch(() => {})
      .finally(() => {
        if (!stale) setTeacherThinking(false);
      });
    return () => {
      stale = true;
      teacherEngine.preempt();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, teacherEngine, teacherEnabled, teacherLevel, status.over]);

  return {
    fen,
    turn,
    history,
    status,
    isHumanTurn,
    cpuThinking,
    teacherThinking,
    hints,
    feedbacks,
    threats,
    evalCp,
    opening,
    opponentNote,
    lastMove,
    makeHumanMove,
    legalMovesFrom,
    newGame,
    undo,
    resign,
    inCheck: useMemo(() => new Chess(fen).inCheck(), [fen]),
    chess: chessRef.current,
  };
}
