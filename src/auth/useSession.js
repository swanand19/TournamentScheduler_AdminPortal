import { useSyncExternalStore } from "react";
import { getSession, subscribe } from "./session";

/** The signed-in session (or null), re-rendering when it changes — sign-in, sign-out, a 401. */
export function useSession() {
  return useSyncExternalStore(subscribe, getSession);
}
