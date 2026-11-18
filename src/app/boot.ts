import type { AppModule } from '../core/wire/module';
import { wire } from '../core/wire/wire';

// Adding a feature = adding a folder in src/modules/<name>/index.tsx. No central edit needed.
const found = import.meta.glob('../modules/*/index.tsx', { eager: true }) as Record<
  string,
  { default: AppModule }
>;

const all = Object.values(found).map((m) => m.default);

// A module whose init() throws is skipped, the app still starts.
export const modules: AppModule[] = all.filter((m) => {
  try {
    m.init?.(wire);
    return true;
  } catch (e) {
    console.error(`[boot] module "${m.id}" failed to start and was skipped`, e);
    return false;
  }
});
