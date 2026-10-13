import { useEffect, useRef } from 'react';
import type { HistoryEntry } from '../hooks/useChessGame';
import { VERDICT_META, type Feedback } from '../teacher/teacher';

interface Props {
  history: HistoryEntry[];
  feedbacks: Feedback[];
  showVerdicts: boolean;
}

export function MoveList({ history, feedbacks, showVerdicts }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [history.length]);

  const rows: { n: number; w?: HistoryEntry; b?: HistoryEntry }[] = [];
  for (const h of history) {
    const n = Math.ceil(h.ply / 2);
    let row = rows[rows.length - 1];
    if (!row || row.n !== n) {
      row = { n };
      rows.push(row);
    }
    if (h.color === 'w') row.w = h;
    else row.b = h;
  }
  const fbByPly = new Map(feedbacks.map((f) => [f.ply, f]));

  const cell = (h?: HistoryEntry) => {
    if (!h) return <span className="text-zinc-600">…</span>;
    const fb = fbByPly.get(h.ply);
    const isLast = h.ply === history.length;
    return (
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-sm ${isLast ? 'bg-emerald-500/20 text-emerald-100' : 'text-zinc-200'}`}>
        {h.san}
        {showVerdicts && fb && fb.verdict !== 'good' && (
          <span className={`text-[10px] font-bold ${VERDICT_META[fb.verdict].color}`}>{VERDICT_META[fb.verdict].emoji}</span>
        )}
      </span>
    );
  };

  return (
    <div ref={ref} className="max-h-48 overflow-y-auto rounded-lg bg-zinc-900/60 p-2 text-sm ring-1 ring-white/5">
      {rows.length === 0 && <div className="px-2 py-3 text-center text-xs text-zinc-500">No moves yet. White to play.</div>}
      <div className="grid grid-cols-[2.2rem_1fr_1fr] gap-y-0.5">
        {rows.map((r) => (
          <div key={r.n} className="contents">
            <div className="py-0.5 pl-1 text-xs text-zinc-500">{r.n}.</div>
            <div>{cell(r.w)}</div>
            <div>{cell(r.b)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
