import { Facet } from "@codemirror/state";
import { useSyncExternalStore, type ReactNode } from "react";
import { defaultEnvironment, MarkdownEnvironment, type EditorEnvironment } from "./editorContext";

export function createEnvironmentStore(initial: EditorEnvironment) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(environment: EditorEnvironment) {
      if (environment === current) return;
      current = environment;
      for (const listener of listeners) listener();
    },
  };
}

type EnvironmentStore = ReturnType<typeof createEnvironmentStore>;
const defaultStore = createEnvironmentStore(defaultEnvironment);

export const widgetEnvironment = Facet.define<EnvironmentStore, EnvironmentStore>({
  combine: stores => stores[0] ?? defaultStore,
});

export function WidgetEnvironment({ store, children }: { store: EnvironmentStore; children: ReactNode }) {
  const environment = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return <MarkdownEnvironment.Provider value={environment}>{children}</MarkdownEnvironment.Provider>;
}
