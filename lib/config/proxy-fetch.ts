/**
 * Proxy-aware fetch utility.
 *
 * When PROXY_URL is set, `proxyFetch` rewrites the target URL into a query
 * parameter and sends the request to the Lambda proxy instead. All other
 * request properties (method, headers, body) are passed through unchanged.
 *
 * Usage in rippers:
 *   const fetchFn = getFetchForConfig(ripper.config);
 *   const res = await fetchFn(url, init);
 */

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch through the authenticated proxy. Falls back to direct fetch when
 * the PROXY_URL environment variable is not set.
 */
export function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
    const proxyUrl = process.env.PROXY_URL;
    if (!proxyUrl) {
        return fetch(url, init);
    }

    const proxied = new URL(proxyUrl);
    proxied.searchParams.set("url", url);
    return fetch(proxied.toString(), init);
}

/**
 * Returns a fetch function appropriate for the ripper config.
 * When `config.proxy` is true, returns `proxyFetch`; otherwise returns
 * the global `fetch`.
 */
export function getFetchForConfig(config: { proxy?: boolean }): FetchFn {
    if (config.proxy) {
        return proxyFetch;
    }
    return (url: string, init?: RequestInit) => fetch(url, init);
}
