import type { Color } from 'chess.js';
import { formatEval } from '../teacher/teacher';

interface Props {
  evalCp: number | null;
  orientation: Color;
  thinking?: boolean;
}

export function EvalBar({ evalCp, orientation, thinking }: Props) {
  const cp = evalCp ?? 0;
  // sigmoid-ish mapping to 0..100 (% white)
  let whitePct = 50;
  if (Math.abs(cp) >= 90000) whitePct = cp > 0 ? 100 : 0;
  else whitePct = 50 + 50 * (2 / (1 + Math.exp(-cp / 400)) - 1);
  whitePct = Math.max(3, Math.min(97, whitePct));
  const label = formatEval(cp);
  const whiteOnTop = orientation === 'b';

  return (
    <div className="flex h-full w-6 flex-col overflow-hidden rounded-md bg-zinc-800 ring-1 ring-white/10" title={`Evaluation ${label}`}>
      <div className="relative flex h-full w-full flex-col">
        <div
          className="w-full bg-zinc-900 transition-all duration-500"
          style={{ height: `${whiteOnTop ? whitePct : 100 - whitePct}%`, background: whiteOnTop ? '#f4f4f5' : '#18181b' }}
        />
        <div className="w-full flex-1 transition-all duration-500" style={{ background: whiteOnTop ? '#18181b' : '#f4f4f5' }} />
        <div
          className={`absolute left-0 right-0 text-center text-[9px] font-bold leading-none ${cp >= 0 ? 'text-zinc-900' : 'text-zinc-100'}`}
          style={cp >= 0 ? (whiteOnTop ? { top: 4 } : { bottom: 4 }) : whiteOnTop ? { bottom: 4 } : { top: 4 }}
        >
          {evalCp === null ? (thinking ? '…' : '') : label.replace('+', '')}
        </div>
      </div>
    </div>
  );
}
