import type { Color, Move, Square } from 'chess.js';
import { useCallback, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Arrow, Piece, PromotionPieceOption } from 'react-chessboard/dist/chessboard/types';
import type { UciMove } from '../engine';
import type { Hint, Threat } from '../teacher/teacher';

interface BoardProps {
  fen: string;
  orientation: Color;
  turn: Color;
  canMove: boolean;
  lastMove: { from: Square; to: Square } | null;
  inCheck: boolean;
  kingSquare: Square | null;
  hints: Hint[] | null;
  showHints: boolean;
  threats: Threat[];
  showThreats: boolean;
  onMove: (m: UciMove) => boolean;
  legalMovesFrom: (sq: Square) => Move[];
  humanColors: Color[]; // which colours the human controls
}

const HINT_COLORS = ['rgba(16,185,129,0.9)', 'rgba(250,204,21,0.8)', 'rgba(251,146,60,0.75)'];

export function Board(props: BoardProps) {
  const { fen, orientation, turn, canMove, lastMove, inCheck, kingSquare, hints, showHints, threats, showThreats, onMove, legalMovesFrom, humanColors } = props;
  const [selected, setSelected] = useState<Square | null>(null);
  const [legal, setLegal] = useState<Move[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setLegal([]);
  }, []);

  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      const ok = onMove({ from, to, promotion });
      if (ok) clearSelection();
      return ok;
    },
    [onMove, clearSelection],
  );

  const onSquareClick = useCallback(
    (square: Square, piece: Piece | undefined) => {
      if (!canMove) return;
      const pieceColor = piece ? (piece[0] as Color) : null;
      if (selected) {
        const mv = legal.find((m) => m.to === square);
        if (mv) {
          if (mv.promotion) {
            setPendingPromotion({ from: selected, to: square });
            return;
          }
          tryMove(selected, square);
          return;
        }
        if (pieceColor === turn) {
          setSelected(square);
          setLegal(legalMovesFrom(square));
          return;
        }
        clearSelection();
        return;
      }
      if (pieceColor === turn) {
        setSelected(square);
        setLegal(legalMovesFrom(square));
      }
    },
    [canMove, selected, legal, turn, tryMove, legalMovesFrom, clearSelection],
  );

  const onPieceDrop = useCallback(
    (from: Square, to: Square) => {
      if (!canMove) return false;
      const ok = tryMove(from, to);
      return ok;
    },
    [canMove, tryMove],
  );

  const onPromotionPieceSelect = useCallback(
    (piece?: PromotionPieceOption, from?: Square, to?: Square) => {
      const f = from ?? pendingPromotion?.from;
      const t = to ?? pendingPromotion?.to;
      setPendingPromotion(null);
      if (!piece || !f || !t) {
        clearSelection();
        return false;
      }
      const promo = piece[1].toLowerCase();
      return tryMove(f, t, promo);
    },
    [pendingPromotion, tryMove, clearSelection],
  );

  const isDraggablePiece = useCallback(
    ({ piece }: { piece: Piece; sourceSquare: Square }) => canMove && piece[0] === turn && humanColors.includes(piece[0] as Color),
    [canMove, turn, humanColors],
  );

  const squareStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      s[lastMove.from] = { background: 'rgba(250,204,21,0.35)' };
      s[lastMove.to] = { background: 'rgba(250,204,21,0.45)' };
    }
    if (inCheck && kingSquare) {
      s[kingSquare] = { background: 'radial-gradient(circle, rgba(244,63,94,0.9) 0%, rgba(244,63,94,0.5) 55%, transparent 75%)' };
    }
    if (showThreats) {
      for (const t of threats) {
        s[t.square] = {
          ...(s[t.square] ?? {}),
          boxShadow: t.severity === 'high' ? 'inset 0 0 0 4px rgba(244,63,94,0.85)' : 'inset 0 0 0 4px rgba(251,146,60,0.8)',
        };
      }
    }
    if (selected) {
      s[selected] = { ...(s[selected] ?? {}), background: 'rgba(56,189,248,0.55)' };
      for (const m of legal) {
        const isCapture = !!m.captured;
        s[m.to] = {
          ...(s[m.to] ?? {}),
          background: isCapture
            ? `${s[m.to]?.background ? '' : ''}radial-gradient(circle, transparent 55%, rgba(15,23,42,0.45) 57%, rgba(15,23,42,0.45) 70%, transparent 72%)`
            : 'radial-gradient(circle, rgba(15,23,42,0.4) 22%, transparent 24%)',
        };
      }
    }
    return s;
  }, [lastMove, inCheck, kingSquare, selected, legal, threats, showThreats]);

  const arrows = useMemo<Arrow[]>(() => {
    if (!showHints || !hints) return [];
    return hints.slice(0, 3).map((h, i) => [h.uci.from as Square, h.uci.to as Square, HINT_COLORS[i]] as Arrow);
  }, [hints, showHints]);

  return (
    <div className="relative w-full select-none">
      <Chessboard
        id="main-board"
        position={fen}
        boardOrientation={orientation === 'w' ? 'white' : 'black'}
        onPieceDrop={onPieceDrop}
        onSquareClick={onSquareClick}
        onPromotionPieceSelect={onPromotionPieceSelect}
        showPromotionDialog={!!pendingPromotion}
        promotionToSquare={pendingPromotion?.to ?? null}
        promotionDialogVariant="modal"
        isDraggablePiece={isDraggablePiece}
        arePiecesDraggable={canMove}
        customSquareStyles={squareStyles}
        customArrows={arrows}
        animationDuration={200}
        customBoardStyle={{ borderRadius: '10px', boxShadow: '0 20px 50px -10px rgba(0,0,0,0.7)' }}
        customDarkSquareStyle={{ backgroundColor: '#5b7a5f' }}
        customLightSquareStyle={{ backgroundColor: '#e6e9d8' }}
        customNotationStyle={{ fontSize: '11px', fontWeight: 600 }}
      />
    </div>
  );
}
