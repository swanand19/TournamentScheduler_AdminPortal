import { useEffect, useEffectEvent, useRef, useState } from "react";

// The hooks every page uses — one to load a list, one to run an action without a double click
// doing it twice, one to wait for typing to pause — and the date formatting.

/**
 * Loads with `loader` whenever the values in `deps` change; `reload()` asks again. Keeps the last
 * data on screen while the next load is on its way.
 */
export function useLoad(loader, deps) {
  const [tick, setTick] = useState(0);
  const key = `${JSON.stringify(deps)}#${tick}`;
  const [result, setResult] = useState({ data: null, error: "", key: null });
  const load = useEffectEvent(() => loader());

  useEffect(() => {
    let live = true;
    load()
      .then((data) => live && setResult({ data, error: "", key }))
      .catch((e) => live && setResult((r) => ({ ...r, error: e.message, key })));
    return () => {
      live = false;
    };
  }, [key]);

  return {
    data: result.data,
    error: result.error,
    loading: result.key !== key,
    setData: (data) => setResult((r) => ({ ...r, data })),
    reload: () => setTick((t) => t + 1),
  };
}

/** Runs one action at a time; `busy` says which. Errors land in `error` for the page to show. */
export function useAction() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const run = async (label, action) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(label);
    setError("");
    try {
      return await action();
    } catch (e) {
      setError(e.message);
      return undefined;
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  };

  return { busy, error, setError, run };
}

/** A value that follows `value` once it stops changing for `ms` — for search boxes. */
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Server times are UTC, sometimes without the "Z". */
export function parseUtc(value) {
  if (!value) return null;
  return new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

export const shortDate = (value) => parseUtc(value)?.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) ?? "—";

/** "12 Oct 2026" from "2026-10-12", without time-zone surprises. */
export function day(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
