let locks = 0;
let snapshot: { overflow: string; paddingRight: string } | null = null;
let observer: MutationObserver | null = null;

function applyLock() {
  const body = document.body;
  body.style.overflow = 'hidden';
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
}

function watchLock() {
  if (observer) return;
  observer = new MutationObserver(() => {
    if (locks > 0 && document.body.style.overflow !== 'hidden') applyLock();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });
}

/** Reference-counted body scroll lock so nested overlays restore the original styles. */
export function acquireBodyScrollLock(): () => void {
  if (locks === 0) {
    const body = document.body;
    snapshot = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    applyLock();
    watchLock();
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0 && snapshot) {
      observer?.disconnect();
      observer = null;
      document.body.style.overflow = snapshot.overflow;
      document.body.style.paddingRight = snapshot.paddingRight;
      snapshot = null;
    }
  };
}
