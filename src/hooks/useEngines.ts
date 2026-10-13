import { useEffect, useState } from 'react';
import { createEngine, type Engine } from '../engine';

export interface Engines {
  cpu: Engine | null;
  teacher: Engine | null;
  loading: boolean;
  engineName: string;
}

/** Creates two independent engine instances: one opponent, one teacher/analyst. */
export function useEngines(): Engines {
  const [state, setState] = useState<Engines>({ cpu: null, teacher: null, loading: true, engineName: '' });

  useEffect(() => {
    let disposed = false;
    let created: Engine[] = [];
    Promise.all([createEngine(), createEngine()]).then(([cpu, teacher]) => {
      created = [cpu, teacher];
      if (disposed) {
        cpu.destroy();
        teacher.destroy();
        return;
      }
      setState({ cpu, teacher, loading: false, engineName: cpu.name });
    });
    return () => {
      disposed = true;
      created.forEach((e) => e.destroy());
    };
  }, []);

  return state;
}
