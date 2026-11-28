"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/field";

/**
 * Search over the class list.
 *
 * The term is a URL parameter, so a search is a link an administrator can send or
 * bookmark, and the server does the matching — the list is already the page's main
 * content, and narrowing it in the query keeps the payload the size of what is shown
 * rather than shipping every class to the browser to hide most of them.
 *
 * It filters as it is typed rather than waiting for a submit, because a class list is
 * short enough that the round trip is the whole cost and a button would only add a
 * second gesture to a one-gesture question. The write is debounced and issues no
 * request until the term stops changing, so a five-letter word is one navigation
 * instead of five; a typed term is kept in local state so the field never loses a
 * keystroke to a render that has not caught up.
 *
 * `router.replace` rather than `push`: a search is a refinement of the same view, not
 * a new place, so the back button returns to whatever the administrator was doing
 * before this page rather than walking back through every prefix of their term.
 */
export function ClassroomSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<number | null>(null);

  // The URL can change from outside this component — the browser's back button, or a
  // link into a filtered view — so the field adopts it when it does. This is adjusted
  // during render rather than in an effect, which is React's own pattern for state
  // derived from a changing prop and avoids a second paint of the stale term.
  //
  // The comparison is against the trimmed term, not the raw one: the URL carries the
  // trimmed search, so adopting it whenever the two strings differed would delete a
  // trailing space the administrator had just typed, mid-word, on every debounce. A
  // term that already matches what was sent is therefore left exactly as typed.
  const [lastUrlQuery, setLastUrlQuery] = useState(initialQuery);
  if (initialQuery !== lastUrlQuery) {
    setLastUrlQuery(initialQuery);
    if (initialQuery !== query.trim()) setQuery(initialQuery);
  }

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  function onChange(value: string) {
    setQuery(value);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      startTransition(() => router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false }));
    }, 250);
  }

  function clear() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`, { scroll: false }));
  }

  return (
    <div className="relative" role="search">
      <label className="block">
        <span className="sr-only">جست‌وجوی کلاس</span>
        <Input
          value={query}
          onChange={(event) => onChange(event.target.value)}
          placeholder="جست‌وجوی نام کلاس، کد کلاس یا پایه"
          className="pe-10"
          type="search"
        />
      </label>
      {query ? (
        <button
          type="button"
          onClick={clear}
          aria-label="پاک کردن جست‌وجو"
          className="absolute inset-y-0 end-2 my-auto flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sage hover:text-primary"
        >
          ✕
        </button>
      ) : null}
      {isPending ? (
        <span className="absolute -bottom-5 end-1 text-[0.7rem] font-bold text-secondary" role="status">در حال جست‌وجو…</span>
      ) : null}
    </div>
  );
}
