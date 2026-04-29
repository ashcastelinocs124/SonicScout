export interface SseEvent {
  event: string;
  data: unknown;
}
export type Listener = (evt: SseEvent) => void;

const listeners = new Map<number, Set<Listener>>();

export function emit(runId: number, event: string, data: unknown): void {
  const set = listeners.get(runId);
  if (!set) return;
  for (const l of set) l({ event, data });
}

export function subscribe(runId: number, listener: Listener): () => void {
  let set = listeners.get(runId);
  if (!set) {
    set = new Set();
    listeners.set(runId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(runId);
  };
}
