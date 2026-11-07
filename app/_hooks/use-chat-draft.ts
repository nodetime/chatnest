"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// Session storage keeps original-content drafts in this browser tab, not on the server.
// A new chat acquiring its URL retains the same scope; visiting another chat does not.
export function useChatDraft(
  key: string,
  scope: string
): [string, Dispatch<SetStateAction<string>>] {
  const [draft, setDraft] = useState({ key: "", scope: "", value: "" });
  const current = useRef(draft);
  const route = useRef({ key, scope });
  route.current = { key, scope };
  const setValue = useCallback<Dispatch<SetStateAction<string>>>(
    (action) => {
      if (route.current.scope !== scope) {
        return;
      }
      const old = current.current.scope === scope ? current.current.value : "";
      const next = {
        key: route.current.key,
        scope,
        value: typeof action === "function" ? action(old) : action,
      };
      const previous = current.current;
      current.current = next;
      setDraft(next);
      try {
        if (previous.scope === scope && previous.key !== next.key) {
          sessionStorage.removeItem(previous.key);
        }
        if (next.value) {
          sessionStorage.setItem(next.key, next.value);
        } else {
          sessionStorage.removeItem(next.key);
        }
      } catch {
        /* Drafts still work when browser storage is unavailable. */
      }
    },
    [scope]
  );
  useEffect(() => {
    if (current.current.key === key && current.current.scope === scope) {
      return;
    }
    if (current.current.scope === scope) {
      setValue((existing) => existing);
      return;
    }
    let value = "";
    try {
      value = sessionStorage.getItem(key) ?? "";
    } catch {
      /* Private browsing may block storage. */
    }
    const next = { key, scope, value };
    current.current = next;
    setDraft(next);
  }, [key, scope, setValue]);
  return [draft.scope === scope ? draft.value : "", setValue];
}
