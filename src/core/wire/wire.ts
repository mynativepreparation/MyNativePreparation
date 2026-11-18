import type { WireEvents } from './events';

type Handler<T> = (payload: T) => void;

// The central wire: modules talk to each other only through typed events.
export class Wire {
  private handlers = new Map<string, Set<Handler<never>>>();

  on<K extends keyof WireEvents>(type: K, handler: Handler<WireEvents[K]>): () => void {
    const set: Set<Handler<never>> = this.handlers.get(type) ?? new Set<Handler<never>>();
    set.add(handler as Handler<never>);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler as Handler<never>);
    };
  }

  emit<K extends keyof WireEvents>(type: K, payload: WireEvents[K]): void {
    this.handlers.get(type)?.forEach((h) => {
      // A failing handler must NEVER break other modules.
      try {
        (h as Handler<WireEvents[K]>)(payload);
      } catch (e) {
        console.error(`[wire] handler for ${type} failed`, e);
      }
    });
  }
}

export const wire = new Wire();
