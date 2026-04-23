import { useState, useCallback } from "react";

export type View = "chat" | "settings" | "accounts" | "setup";

export function useRouter(initial: View = "chat") {
  const [view, setView] = useState<View>(initial);
  const navigate = useCallback((v: View) => setView(v), []);
  return { view, navigate };
}
