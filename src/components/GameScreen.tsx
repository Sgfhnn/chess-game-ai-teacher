import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import { CPU_LEVELS, type Engine } from '../engine';
import { useChessGame, type GameConfig } from '../hooks/useChessGame';
import { cn } from '../utils/cn';
import { Board } from './Board';
import { EvalBar } from './EvalBar';
import { MoveList } from './MoveList';
import { TeacherPanel } from './TeacherPanel';

interface Props {
  config: GameConfig;
  cpu: Engine | null;
  teacher: Engine | null;
  onBackToMenu: () => void;
}

const UNICODE: Record<Color, Record<PieceSymbol, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};
const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function capturedFromFen(fen: string) {
  const start: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const count: Record<Color, Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  for (const ch of fen.split(' ')[0]) {
    if (/[pnbrqk]/i.test(ch)) count[ch === ch.toUpperCase() ? 'w' : 'b'][ch.toLowerCase() as PieceSymbol]++;
  }
  const captured = (c: Color) => {
    const list: PieceSymbol[] = [];
    (['q', 'r', 'b', 'n', 'p'] as PieceSymbol[]).forEach((t) => {
      for (let i = 0; i < Math.max(0, start[t] - count[c][t]); i++) list.push(t);
    });
    return list;
  };
  const material = (c: Color) => (['p', 'n', 'b', 'r', 'q'] as PieceSymbol[]).reduce((s, t) => s + VALUES[t] * count[c][t], 0);
  return { capturedWhite: captured('w'), capturedBlack: captured('b'), diff: material('w') - material('b') };
}

export function GameScreen({ config: initialConfig, cpu, teacher, onBackToMenu }: Props) {
  const [config, setConfig] = useState(initialConfig);
  const game = useChessGame(config, cpu, teacher);
  const [orientation, setOrientation] = useState<Color>(config.mode === 'human' ? 'w' : config.playerColor);
  const [revealed, setRevealed] = useState(false);
  const [dismissedOver, setDismissedOver] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [game.fen]);
  useEffect(() => {
    if (!game.status.over) setDismissedOver(false);
  }, [game.status.over]);

  const hintsVisible = config.autoHints || revealed;
  const humanColors: Color[] = config.mode === 'human' ? ['w', 'b'] : [config.playerColor];
  const canMove = !game.status.over && game.isHumanTurn && !game.cpuThinking;
  const kingSquare = useMemo(() => {
    const c = new Chess(game.fen);
    for (const row of c.board()) for (const sq of row) if (sq && sq.type === 'k' && sq.color === game.turn) return sq.square as Square;
    return null;
  }, [game.fen, game.turn]);
  const cap = useMemo(() => capturedFromFen(game.fen), [game.fen]);

  const nameFor = (c: Color) => {
    if (config.mode === 'human') return c === 'w' ? 'White' : 'Black';
    if (c === config.playerColor) return 'You';
    return `Computer · ${CPU_LEVELS[config.cpuLevel].label}`;
  };
  const topColor: Color = orientation === 'w' ? 'b' : 'w';
  const bottomColor: Color = orientation;

  const renderPlayerBar = (color: Color) => {
    const isCpu = config.mode !== 'human' && color !== config.playerColor;
    const active = game.turn === color && !game.status.over;
    const captured = color === 'w' ? cap.capturedBlack : cap.capturedWhite; // pieces this side captured
    const adv = color === 'w' ? cap.diff : -cap.diff;
    return (
      <div className={cn('flex items-center justify-between rounded-lg px-3 py-2 ring-1 transition', active ? 'bg-zinc-800 ring-emerald-400/40' : 'bg-zinc-900/60 ring-white/5')}>
        <div className="flex items-center gap-2">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-base', color === 'w' ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-950 text-zinc-100 ring-1 ring-white/20')}>
            {isCpu ? '🤖' : config.mode === 'human' ? '👤' : '🙂'}
          </span>
          <div>
            <div className="text-sm font-semibold text-zinc-100">{nameFor(color)}</div>
            <div className="text-[11px] text-zinc-500">
              {active ? (isCpu && game.cpuThinking ? 'thinking…' : 'to move') : ''}
              {isCpu && game.cpuThinking && active && <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 align-middle" />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm leading-none">
          <span className="tracking-tight text-zinc-300">{captured.map((t) => UNICODE[color === 'w' ? 'b' : 'w'][t]).join('')}</span>
          {adv > 0 && <span className="ml-1 text-[11px] font-semibold text-emerald-300">+{adv}</span>}
        </div>
      </div>
    );
  };

  const resultText = (() => {
    const s = game.status;
    if (!s.over) return '';
    if (s.result === 'draw') return `Draw — ${s.reason}`;
    const winner = s.result === 'white' ? 'White' : 'Black';
    if (config.mode !== 'human') {
      const youWon = (s.result === 'white' ? 'w' : 'b') === config.playerColor;
      return youWon ? `You win! 🎉 (${s.reason})` : `Computer wins (${s.reason})`;
    }
    return `${winner} wins — ${s.reason}`;
  })();

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button onClick={onBackToMenu} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700">
            ← Menu
          </button>
          <div>
            <div className="text-lg font-black tracking-tight text-white">
              Grand<span className="text-emerald-400">Master</span> Chess
            </div>
            <div className="text-[11px] text-zinc-500">
              {config.mode === 'cpu' && 'Me vs Computer'}
              {config.mode === 'cpu-teacher' && 'Me + Teacher vs Computer'}
              {config.mode === 'human' && 'Me vs Person (hot-seat)'}
              {config.mode !== 'human' && ` · CPU ${CPU_LEVELS[config.cpuLevel].label} (${CPU_LEVELS[config.cpuLevel].elo})`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config.mode === 'human' && (
            <button
              onClick={() => setConfig((c) => ({ ...c, teacherEnabled: !c.teacherEnabled }))}
              className={cn('rounded-lg px-3 py-1.5 text-sm ring-1', config.teacherEnabled ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' : 'bg-zinc-800 text-zinc-200 ring-white/10 hover:bg-zinc-700')}
            >
              🎓 Teacher {config.teacherEnabled ? 'on' : 'off'}
            </button>
          )}
          <button onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700">
            ⇅ Flip
          </button>
          <button
            onClick={game.undo}
            disabled={game.history.length === 0}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-40"
          >
            ↶ Undo
          </button>
          <button
            onClick={game.resign}
            disabled={game.status.over || game.history.length === 0}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-rose-200 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-40"
          >
            🏳 Resign
          </button>
          <button onClick={game.newGame} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400">
            + New game
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Board column */}
        <div className="flex flex-col gap-2">
          <div className="mx-auto w-full" style={{ maxWidth: 'min(100%, calc(100vh - 210px))' }}>
            {renderPlayerBar(topColor)}
            <div className="my-2 flex items-stretch gap-2">
              {config.teacherEnabled && <EvalBar evalCp={game.evalCp} orientation={orientation} thinking={game.teacherThinking} />}
              <div className="relative min-w-0 flex-1">
                <Board
                  fen={game.fen}
                  orientation={orientation}
                  turn={game.turn}
                  canMove={canMove}
                  lastMove={game.lastMove}
                  inCheck={game.inCheck}
                  kingSquare={kingSquare}
                  hints={game.hints}
                  showHints={config.teacherEnabled && hintsVisible && game.isHumanTurn}
                  threats={game.threats}
                  showThreats={config.teacherEnabled}
                  onMove={game.makeHumanMove}
                  legalMovesFrom={game.legalMovesFrom}
                  humanColors={humanColors}
                />
                {game.status.over && !dismissedOver && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-zinc-950/70 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-xs rounded-2xl border border-white/10 bg-zinc-900 p-6 text-center shadow-2xl">
                      <div className="text-4xl">{game.status.result === 'draw' ? '🤝' : '🏁'}</div>
                      <div className="mt-2 text-xl font-bold text-white">Game over</div>
                      <div className="mt-1 text-sm text-zinc-300">{resultText}</div>
                      <div className="mt-5 flex gap-2">
                        <button onClick={() => setDismissedOver(true)} className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700">
                          Review
                        </button>
                        <button onClick={game.newGame} className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400">
                          Play again
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {renderPlayerBar(bottomColor)}
          </div>
        </div>

        {/* Side panel */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Status</div>
              {game.inCheck && !game.status.over && <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-300">CHECK</span>}
            </div>
            <div className="mt-1 text-sm text-zinc-200">
              {game.status.over ? resultText : game.cpuThinking ? 'Computer is thinking…' : game.isHumanTurn ? `${nameFor(game.turn)} to move (${game.turn === 'w' ? 'White' : 'Black'})` : 'Waiting…'}
            </div>
            <div className="mt-3">
              <MoveList history={game.history} feedbacks={game.feedbacks} showVerdicts={config.teacherEnabled} />
            </div>
          </div>

          {config.teacherEnabled ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-zinc-900/70 p-4">
              <TeacherPanel
                level={config.teacherLevel}
                thinking={game.teacherThinking}
                fen={game.fen}
                turn={game.turn}
                isHumanTurn={game.isHumanTurn}
                gameOver={game.status.over}
                hints={game.hints}
                hintsVisible={hintsVisible}
                autoHints={config.autoHints}
                onRevealHints={() => setRevealed(true)}
                onToggleAuto={() => setConfig((c) => ({ ...c, autoHints: !c.autoHints }))}
                threats={game.threats}
                opponentNote={game.opponentNote}
                feedbacks={game.feedbacks}
                opening={game.opening}
                evalCp={game.evalCp}
                humanMode={config.mode === 'human'}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 text-xs text-zinc-500">
              {config.mode === 'cpu' ? (
                <>
                  Classic mode — no coaching. Want help? Go back to the menu and pick <span className="text-zinc-300">Me + Teacher vs Computer</span>.
                </>
              ) : (
                <>Teacher is off. Toggle it on above to get explanations for both players.</>
              )}
              {game.opening && <div className="mt-2 text-indigo-300">📖 {game.opening}</div>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
