import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

// Two routes do not need a routing library: the path is the only state.

const subscribe = (onChange: () => void) => {
  addEventListener("popstate", onChange);
  return () => removeEventListener("popstate", onChange);
};

/** The current path, re-rendering on every navigation. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

export function navigate(to: string) {
  if (to === location.pathname) return;
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
  scrollTo(0, 0);
}

/** An <a> that navigates in-app, leaving modified clicks (new tab, etc.) to the browser. */
export function Link({ to, ...props }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a {...props} href={to} onClick={onClick} />;
}
