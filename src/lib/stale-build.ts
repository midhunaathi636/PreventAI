/**
 * Recovery from stale cached builds.
 *
 * Every deploy produces new content-hashed chunk filenames. A browser holding
 * a cached `index.html` from the previous deploy will ask for chunk names that
 * no longer exist and fail with:
 *
 *   Failed to fetch dynamically imported module: .../assets/<name>-<hash>.js
 *
 * The user sees a broken feature and has no reason to guess that a hard
 * refresh fixes it. This listens for that specific failure and reloads once,
 * which picks up the current `index.html` and its real chunk names.
 *
 * The reload is guarded by a sessionStorage flag so a genuine network outage
 * cannot turn into a refresh loop.
 */

const RELOAD_FLAG = 'preventai:reloaded-for-stale-build';

function isStaleChunkError(message: string): boolean {
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    (/ChunkLoadError/i.test(message) && /loading chunk/i.test(message))
  );
}

function reloadOnce(): void {
  let alreadyTried = false;
  try {
    alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === '1';
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    // Private mode or blocked storage: fall back to not reloading at all,
    // because without the flag a loop is possible.
    return;
  }
  if (alreadyTried) return;

  console.warn('[PreventAI] stale build detected — reloading to pick up the current assets');
  window.location.reload();
}

/** Clears the guard once the app has started successfully. */
export function markBuildHealthy(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* nothing to clear */
  }
}

export function installStaleBuildRecovery(): void {
  if (typeof window === 'undefined') return;

  // Vite fires this when a preloaded chunk 404s.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnce();
  });

  window.addEventListener('error', (event) => {
    if (typeof event.message === 'string' && isStaleChunkError(event.message)) {
      reloadOnce();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? '');
    if (isStaleChunkError(message)) {
      reloadOnce();
    }
  });
}
