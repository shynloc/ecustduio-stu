import { useEffect, useState } from "react";
import { api, put } from "../api";
export function usePreferences<T>(name: string, initial: T) {
  const [value, setValue] = useState(initial),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    setReady(false);
    api("/workspace/preferences/" + encodeURIComponent(name))
      .then((r) => {
        if (live && r.value) setValue((v) => ({ ...v, ...r.value }));
        if (live) setReady(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(
      () =>
        put("/workspace/preferences/" + encodeURIComponent(name), {
          value,
        }).catch(() => {}),
      450,
    );
    return () => clearTimeout(t);
  }, [name, value, ready]);
  return [value, setValue, ready] as const;
}
