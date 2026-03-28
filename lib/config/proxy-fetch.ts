/**
 * Proxy-aware fetch utility.
 *
 * All proxy types other than "outofband" have been retired. "outofband" sources
 * run on a home server with a residential IP and use direct fetch (no proxy).
 *
 * Usage in rippers:
 *   const fetchFn = getFetchForConfig(ripper.config);
 *   const res = await fetchFn(url, init);
 */

export type ProxyType = "outofband" | false;

export type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Returns a fetch function appropriate for the ripper config.
 * "outofband" sources run outside GitHub Actions and use direct fetch.
 * All other proxy types are retired and treated as direct fetch.
 */
export function getFetchForConfig(config: { proxy?: ProxyType }): FetchFn {
    // outofband sources run on a home server; treat as direct fetch
    return (url: string | URL, init?: RequestInit) => fetch(url, init);
}
