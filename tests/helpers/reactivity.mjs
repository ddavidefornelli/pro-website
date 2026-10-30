import { createRoot } from "solid-js";

export const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Real Solid browser reactivity and lifecycle ownership, without a DOM. */
export function environment(t) {
  const originals = new Map(
    ["window", "document", "localStorage"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const timers = new Map();
  const disposers = [];
  let timerId = 0;
  Object.assign(window, {
    setInterval: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearInterval: (id) => timers.delete(id),
    confirm: () => true,
    location: { reload() {} },
  });
  for (const [name, value] of Object.entries({
    window,
    document,
    localStorage: storage,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  }
  t.after(() => {
    disposers.reverse().forEach((dispose) => dispose());
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return {
    window,
    document,
    storage,
    timers,
    mount(factory) {
      return createRoot((dispose) => {
        disposers.push(dispose);
        return { state: factory(), dispose };
      });
    },
  };
}
