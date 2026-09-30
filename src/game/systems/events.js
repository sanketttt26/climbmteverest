// Tiny event bus so systems, HUD and audio stay decoupled. Events: 'toast' {msg, kind}, 'camp' {i}, 'mode' (flow mode).
const handlers = new Map();
export const on = (type, fn) => {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
};
export const emit = (type, payload) => { for (const fn of handlers.get(type) || []) fn(payload); };
