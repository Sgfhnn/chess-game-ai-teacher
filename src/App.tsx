import { useState } from 'react';
import { GameScreen } from './components/GameScreen';
import { SetupScreen } from './components/SetupScreen';
import { useEngines } from './hooks/useEngines';
import type { GameConfig } from './hooks/useChessGame';

export default function App() {
  const engines = useEngines();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [gameKey, setGameKey] = useState(0);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(99,102,241,0.10),_transparent_50%)] bg-zinc-950 text-zinc-100">
      {config ? (
        <GameScreen
          key={gameKey}
          config={config}
          cpu={engines.cpu}
          teacher={engines.teacher}
          onBackToMenu={() => {
            engines.cpu?.cancelAll();
            engines.teacher?.cancelAll();
            setConfig(null);
          }}
        />
      ) : (
        <SetupScreen
          engineLoading={engines.loading}
          engineName={engines.engineName}
          initial={lastConfig ?? undefined}
          onStart={(c) => {
            lastConfig = c;
            setConfig(c);
            setGameKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

let lastConfig: GameConfig | null = null;
