import type { Color } from 'chess.js';
import { useState } from 'react';
import { CPU_LEVELS, LEVELS, TEACHER_LEVELS, type Level } from '../engine';
import type { GameConfig, Mode } from '../hooks/useChessGame';
import { cn } from '../utils/cn';

interface Props {
  onStart: (config: GameConfig) => void;
  engineLoading: boolean;
  engineName: string;
  initial?: GameConfig;
}

const MODES: { id: Mode; title: string; subtitle: string; icon: string; desc: string }[] = [
  { id: 'cpu', title: 'Me vs Computer', subtitle: 'Classic', icon: '🤖', desc: 'Play a straight game against the engine. No help — just you and the machine.' },
  { id: 'cpu-teacher', title: 'Me + Teacher vs Computer', subtitle: 'Learn while you play', icon: '🎓', desc: 'The teacher explains every move, warns about threats, and suggests better plans.' },
  { id: 'human', title: 'Me vs Person', subtitle: 'Hot-seat', icon: '👥', desc: 'Control both sides on one device. The teacher can optionally coach both players.' },
];

export function SetupScreen({ onStart, engineLoading, engineName, initial }: Props) {
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'cpu-teacher');
  const [colorChoice, setColorChoice] = useState<Color | 'random'>(initial?.playerColor ?? 'w');
  const [cpuLevel, setCpuLevel] = useState<Level>(initial?.cpuLevel ?? 'medium');
  const [teacherLevel, setTeacherLevel] = useState<Level>(initial?.teacherLevel ?? 'hard');
  const [humanTeacher, setHumanTeacher] = useState(initial?.mode === 'human' ? initial.teacherEnabled : false);
  const [autoHints, setAutoHints] = useState(initial?.autoHints ?? false);

  const teacherOn = mode === 'cpu-teacher' || (mode === 'human' && humanTeacher);

  const start = () => {
    const playerColor: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
    onStart({ mode, playerColor, cpuLevel, teacherLevel, teacherEnabled: teacherOn, autoHints });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/30">
          <span className="text-base">♞</span> Powered by {engineLoading ? 'loading engine…' : engineName}
        </div>
        <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
          Grand<span className="text-emerald-400">Master</span> Chess
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400 md:text-base">
          An unbeatable engine opponent and an unbeatable teacher — pick a mode, choose the strength, and start learning.
        </p>
      </header>

      {/* Mode selection */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">1 · Game mode</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                'group rounded-2xl border p-4 text-left transition',
                mode === m.id
                  ? 'border-emerald-400/60 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                  : 'border-white/10 bg-zinc-900/60 hover:border-white/20 hover:bg-zinc-800/60',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl">{m.icon}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', mode === m.id ? 'bg-emerald-400 text-emerald-950' : 'bg-zinc-800 text-zinc-400')}>
                  {m.subtitle}
                </span>
              </div>
              <div className="mt-3 text-base font-bold text-white">{m.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-400">{m.desc}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Computer settings */}
        {mode !== 'human' && (
          <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              <span>🤖</span> 2 · Computer strength
            </h2>
            <LevelPicker levels={CPU_LEVELS} value={cpuLevel} onChange={setCpuLevel} accent="rose" />
            <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-zinc-500">Your colour</h3>
            <div className="flex gap-2">
              {(
                [
                  ['w', '♔ White'],
                  ['b', '♚ Black'],
                  ['random', '🎲 Random'],
                ] as const
              ).map(([c, label]) => (
                <button
                  key={c}
                  onClick={() => setColorChoice(c)}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-2 text-sm font-medium ring-1 transition',
                    colorChoice === c ? 'bg-zinc-100 text-zinc-900 ring-zinc-100' : 'bg-zinc-800 text-zinc-300 ring-white/10 hover:bg-zinc-700',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Teacher settings */}
        <section className={cn('rounded-2xl border p-5', teacherOn ? 'border-emerald-400/30 bg-emerald-500/5' : 'border-white/10 bg-zinc-900/60', mode === 'human' && 'md:col-span-2')}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              <span>🎓</span> {mode === 'human' ? '2' : '3'} · Teacher
            </h2>
            {mode === 'human' && (
              <button type="button" onClick={() => setHumanTeacher((v) => !v)} className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                <span>Enable teacher</span>
                <span className={cn('relative inline-block h-5 w-9 rounded-full transition', humanTeacher ? 'bg-emerald-500' : 'bg-zinc-700')}>
                  <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform', humanTeacher ? 'translate-x-4' : 'translate-x-0')} />
                </span>
              </button>
            )}
            {mode === 'cpu' && <span className="text-[11px] text-zinc-500">Off in classic mode</span>}
            {mode === 'cpu-teacher' && <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Always on</span>}
          </div>
          {teacherOn ? (
            <>
              <LevelPicker levels={TEACHER_LEVELS} value={teacherLevel} onChange={setTeacherLevel} accent="emerald" />
              <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300 ring-1 ring-white/5">
                <span>
                  Show hint arrows automatically
                  <span className="block text-[11px] text-zinc-500">Otherwise, press “Show hint” when you need help.</span>
                </span>
                <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={autoHints} onChange={(e) => setAutoHints(e.target.checked)} />
              </label>
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              {mode === 'cpu'
                ? 'A pure test of skill. Switch to “Me + Teacher vs Computer” to get coaching.'
                : 'Turn the teacher on to get move-by-move explanations for both players.'}
            </p>
          )}
        </section>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <button
          onClick={start}
          disabled={engineLoading}
          className="w-full max-w-sm rounded-2xl bg-emerald-500 px-6 py-4 text-lg font-bold text-emerald-950 shadow-xl shadow-emerald-500/25 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
        >
          {engineLoading ? 'Warming up the engine…' : 'Start game'}
        </button>
        <p className="text-[11px] text-zinc-500">Click or drag pieces to move. Everything runs locally in your browser.</p>
      </div>
    </div>
  );
}

function LevelPicker({
  levels,
  value,
  onChange,
  accent,
}: {
  levels: typeof CPU_LEVELS;
  value: Level;
  onChange: (l: Level) => void;
  accent: 'rose' | 'emerald';
}) {
  const active = accent === 'rose' ? 'bg-rose-500 text-white ring-rose-400' : 'bg-emerald-500 text-emerald-950 ring-emerald-400';
  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5">
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => onChange(l)}
            className={cn(
              'rounded-lg px-1 py-2 text-xs font-semibold ring-1 transition',
              value === l ? active : 'bg-zinc-800 text-zinc-300 ring-white/10 hover:bg-zinc-700',
              l === 'max' && value !== l && 'text-amber-300',
            )}
          >
            {levels[l].label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-xs">
        <span className="text-zinc-400">{levels[value].description}</span>
        <span className="shrink-0 font-mono text-zinc-500">{levels[value].elo}</span>
      </div>
    </div>
  );
}
