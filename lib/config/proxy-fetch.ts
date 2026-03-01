/**
 * Proxy-aware fetch utility.
 *
 * Supports two proxy backends:
 *   - "lambda":   PROXY_URL → authenticated Lambda Function URL (SigV4)
 *   - "nodriver": NODRIVER_PROXY_URL → local headless-Chrome sidecar
 *
 * When neither env var is set the request falls back to a direct fetch.
 *
 * Usage in rippers:
 *   const fetchFn = getFetchForConfig(ripper.config);
 *   const res = await fetchFn(url, init);
 */

export type ProxyType = "lambda" | "nodriver" | false;

export type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Fetch through the authenticated Lambda proxy. Falls back to direct fetch
 * when the PROXY_URL environment variable is not set.
 */
export function proxyFetch(url: string | URL, init?: RequestInit): Promise<Response> {
    const urlStr = url.toString();
    const proxyUrl = process.env.PROXY_URL;
    if (!proxyUrl) {
        return fetch(urlStr, init);
    }

    const proxied = new URL(proxyUrl);
    proxied.searchParams.set("url", urlStr);
    return fetch(proxied.toString(), init);
}

/**
 * Fetch through the nodriver headless-Chrome sidecar. Falls back to the
 * Lambda proxy, then to direct fetch.
 */
export function nodriverFetch(url: string | URL, init?: RequestInit): Promise<Response> {
    const urlStr = url.toString();
    const nodriverUrl = process.env.NODRIVER_PROXY_URL;
    if (!nodriverUrl) {
        // Fall back to Lambda proxy → direct
        return proxyFetch(url, init);
    }

    const proxied = new URL(nodriverUrl);
    proxied.searchParams.set("url", urlStr);
    return fetch(proxied.toString(), init);
}

/**
 * Resolve the effective proxy type for a ripper config.
 *
 * The `proxy` field in ripper.yaml can be:
 *   - false       → direct fetch
 *   - "lambda"    → Lambda proxy
 *   - "nodriver"  → nodriver sidecar
 *
 * (Legacy `true` values are transformed to "lambda" by the schema.)
 *
 * The DEFAULT_PROXY_TYPE env var overrides "lambda" → "nodriver" globally
 * when set, giving a project-level toggle without editing every ripper.yaml.
 */
function resolveProxyType(proxy: ProxyType): ProxyType {
    if (proxy === false) return false;

    const defaultType = process.env.DEFAULT_PROXY_TYPE;
    if (defaultType === "nodriver" && proxy === "lambda") {
        return "nodriver";
    }
    return proxy;
}

/**
 * Returns a fetch function appropriate for the ripper config.
 */
export function getFetchForConfig(config: { proxy?: ProxyType }): FetchFn {
    const resolved = resolveProxyType(config.proxy ?? false);

    if (resolved === "nodriver") return nodriverFetch;
    if (resolved === "lambda") return proxyFetch;
    return (url: string | URL, init?: RequestInit) => fetch(url, init);
}
