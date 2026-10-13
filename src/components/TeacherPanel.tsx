import type { Color } from 'chess.js';
import { useMemo } from 'react';
import { TEACHER_LEVELS, type Level } from '../engine';
import type { OpponentNote } from '../hooks/useChessGame';
import { VERDICT_META, formatEval, principleTip, type Feedback, type Hint, type Threat, type Verdict } from '../teacher/teacher';

interface Props {
  level: Level;
  thinking: boolean;
  fen: string;
  turn: Color;
  isHumanTurn: boolean;
  gameOver: boolean;
  hints: Hint[] | null;
  hintsVisible: boolean;
  autoHints: boolean;
  onRevealHints: () => void;
  onToggleAuto: () => void;
  threats: Threat[];
  opponentNote: OpponentNote | null;
  feedbacks: Feedback[];
  opening: string | null;
  evalCp: number | null;
  humanMode: boolean;
}

const HINT_DOTS = ['bg-emerald-400', 'bg-yellow-300', 'bg-orange-400'];

export function TeacherPanel(p: Props) {
  const lastFb = p.feedbacks[p.feedbacks.length - 1];
  const tip = useMemo(() => principleTip(p.fen), [p.fen]);

  const summary = useMemo(() => {
    const counts: Record<Verdict, number> = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    for (const f of p.feedbacks) counts[f.verdict]++;
    const n = p.feedbacks.length;
    const weights: Record<Verdict, number> = { best: 1, excellent: 0.95, good: 0.8, inaccuracy: 0.55, mistake: 0.3, blunder: 0 };
    const acc = n ? Math.round((p.feedbacks.reduce((s, f) => s + weights[f.verdict], 0) / n) * 100) : null;
    return { counts, n, acc };
  }, [p.feedbacks]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-lg shadow-lg shadow-emerald-500/20">🎓</div>
          <div>
            <div className="text-sm font-semibold text-zinc-100">Teacher</div>
            <div className="text-[11px] text-zinc-400">
              {TEACHER_LEVELS[p.level].label} · {TEACHER_LEVELS[p.level].elo}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.thinking && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" /> analysing
            </span>
          )}
          <button
            onClick={p.onToggleAuto}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition ${p.autoHints ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' : 'bg-zinc-800 text-zinc-300 ring-white/10 hover:bg-zinc-700'}`}
            title="Automatically show hint arrows on your turn"
          >
            Auto-hints {p.autoHints ? 'on' : 'off'}
          </button>
        </div>
      </div>

      {p.opening && (
        <div className="rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200 ring-1 ring-indigo-400/20">
          📖 Opening: <span className="font-semibold">{p.opening}</span>
        </div>
      )}

      {/* Evaluation sentence */}
      {p.evalCp !== null && (
        <div className="text-xs text-zinc-300">{evalSentence(p.evalCp, p.humanMode ? p.turn : undefined)}</div>
      )}

      {/* Last move feedback */}
      {lastFb && (
        <div className={`rounded-xl border p-3 ${VERDICT_META[lastFb.verdict].bg}`}>
          <div className="flex items-center justify-between">
            <div className={`text-xs font-bold uppercase tracking-wide ${VERDICT_META[lastFb.verdict].color}`}>
              {VERDICT_META[lastFb.verdict].emoji} {VERDICT_META[lastFb.verdict].label}
            </div>
            <div className="font-mono text-[11px] text-zinc-400">
              {formatEval(lastFb.evalBefore)} → {formatEval(lastFb.evalAfter)}
            </div>
          </div>
          <div className="mt-1 text-sm font-medium text-zinc-100">{lastFb.headline}</div>
          {lastFb.details.length > 0 && (
            <ul className="mt-1.5 space-y-1 text-xs text-zinc-300">
              {lastFb.details.map((d, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-zinc-500">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          )}
          {lastFb.better && (
            <div className="mt-2 rounded-lg bg-zinc-950/40 p-2 text-xs">
              <div className="text-zinc-400">
                Better was <span className="font-mono font-bold text-emerald-300">{lastFb.better.san}</span>
              </div>
              <div className="mt-0.5 text-zinc-300">{lastFb.better.reason}</div>
              {lastFb.better.line && <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{lastFb.better.line}</div>}
            </div>
          )}
        </div>
      )}

      {/* Opponent note */}
      {p.opponentNote && p.opponentNote.notes.length > 0 && !p.gameOver && (
        <div className="rounded-lg bg-zinc-800/70 p-3 text-xs ring-1 ring-white/5">
          <div className="text-zinc-400">
            Opponent played <span className="font-mono font-semibold text-zinc-100">{p.opponentNote.san}</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-zinc-200">
            {p.opponentNote.notes.map((n, i) => (
              <li key={i}>⚠️ {n.replace(/^Threatens/, 'It threatens').replace(/^Forks/, 'It forks').replace(/^Captures/, 'It captures').replace(/^Wins/, 'It wins')}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Threats */}
      {p.threats.length > 0 && !p.gameOver && p.isHumanTurn && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs">
          <div className="font-semibold text-rose-200">Watch out!</div>
          <ul className="mt-1 space-y-0.5 text-rose-100/90">
            {p.threats.slice(0, 3).map((t) => (
              <li key={t.square}>• {t.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Hints */}
      {!p.gameOver && p.isHumanTurn && (
        <div className="rounded-xl bg-zinc-800/60 p-3 ring-1 ring-white/5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-200">Suggested moves</div>
            {!p.hintsVisible && (
              <button
                onClick={p.onRevealHints}
                className="rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 shadow hover:bg-emerald-400"
              >
                💡 Show hint
              </button>
            )}
          </div>
          {p.hintsVisible ? (
            p.hints && p.hints.length ? (
              <ul className="mt-2 space-y-2">
                {p.hints.map((h, i) => (
                  <li key={h.san} className="flex items-start gap-2 text-xs">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${HINT_DOTS[i]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-zinc-50">{h.san}</span>
                        <span className="font-mono text-[11px] text-zinc-400">{formatEval(h.whiteCp, p.turn)}</span>
                        {i === 0 && <span className="rounded bg-emerald-500/20 px-1 text-[10px] font-semibold text-emerald-300">best</span>}
                      </div>
                      <div className="text-zinc-300">{h.reason}</div>
                      <div className="truncate font-mono text-[10px] text-zinc-500">{h.line}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-xs text-zinc-400">Thinking about the best plan…</div>
            )
          ) : (
            <div className="mt-1 text-[11px] text-zinc-500">Try to find the best move yourself first — then check.</div>
          )}
        </div>
      )}

      {/* Principle */}
      {!p.gameOver && <div className="rounded-lg bg-zinc-900/60 px-3 py-2 text-[11px] italic text-zinc-400 ring-1 ring-white/5">💭 {tip}</div>}

      {/* Summary */}
      {summary.n > 0 && (
        <div className="rounded-lg bg-zinc-900/60 p-3 ring-1 ring-white/5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200">Your accuracy</span>
            <span className="font-mono text-emerald-300">{summary.acc}%</span>
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1 text-center text-[10px]">
            {(Object.keys(summary.counts) as Verdict[]).map((v) => (
              <div key={v} className="rounded bg-zinc-800/80 py-1">
                <div className={`font-bold ${VERDICT_META[v].color}`}>{summary.counts[v]}</div>
                <div className="text-zinc-500">{VERDICT_META[v].emoji}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function evalSentence(cp: number, perspective?: Color): string {
  const who = cp > 0 ? 'White' : 'Black';
  const abs = Math.abs(cp);
  if (abs >= 90000) {
    const n = 100000 - abs;
    return n === 0 ? 'Checkmate on the board.' : `${who} has a forced mate in ${n}.`;
  }
  let s: string;
  if (abs < 30) s = 'The position is balanced.';
  else if (abs < 100) s = `${who} is slightly better.`;
  else if (abs < 300) s = `${who} has a clear advantage (about ${(abs / 100).toFixed(1)} pawns).`;
  else s = `${who} is winning (about ${(abs / 100).toFixed(1)} pawns ahead).`;
  if (perspective) s += ` ${perspective === 'w' ? 'White' : 'Black'} to move.`;
  return s;
}
