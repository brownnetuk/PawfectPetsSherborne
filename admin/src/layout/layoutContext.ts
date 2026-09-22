import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

export interface LayoutOutletContext {
  /** Lets a routed page opt into the full-width content area (see Layout.tsx's `isWide`) for as long as it stays mounted, instead of only by matching the whole route's pathname -- e.g. one tab of a multi-tab settings page. */
  setWideRequested: (wide: boolean) => void;
}

// Requests the wide content area for as long as the calling component
// stays mounted, and releases the request automatically on unmount.
export function useWideLayout(wide = true) {
  const { setWideRequested } = useOutletContext<LayoutOutletContext>();
  useEffect(() => {
    if (!wide) return;
    setWideRequested(true);
    return () => setWideRequested(false);
  }, [wide, setWideRequested]);
}
