/**
 * Lambda handler for the authenticated HTTP proxy.
 *
 * Deployed behind a Lambda Function URL with AWS_IAM auth (SigV4).
 * Only callers with the GitHub Actions OIDC role can invoke this function,
 * so no domain allowlist is needed — all requests come from trusted repo code.
 *
 * The proxy is transparent: callers make the same request they would make
 * to the upstream, but send it to the proxy with `?url=<target>`.
 *
 *   - Target URL:   query parameter  ?url=https://...
 *   - HTTP method:  passed through from the caller's request
 *   - Headers:      passed through (minus AWS / infra headers)
 *   - Body:         passed through as-is
 *   - Response:     upstream status, headers, and body returned directly
 */

// Headers injected by Lambda Function URL / SigV4 that must not be forwarded.
const STRIPPED_REQUEST_HEADERS = new Set([
    "host",
    "authorization",
    "content-length",
]);

const STRIPPED_REQUEST_HEADER_PREFIXES = [
    "x-amz-",
    "x-forwarded-",
];

// Hop-by-hop / encoding headers that Lambda manages on the response side.
const STRIPPED_RESPONSE_HEADERS = new Set([
    "transfer-encoding",
    "connection",
    "content-encoding",
    "content-length",
]);

export interface LambdaFunctionUrlEvent {
    queryStringParameters?: Record<string, string>;
    headers: Record<string, string>;
    requestContext: {
        http: { method: string };
    };
    body?: string;
    isBase64Encoded?: boolean;
}

interface LambdaResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}


export function filterRequestHeaders(headers: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        const lower = key.toLowerCase();
        if (STRIPPED_REQUEST_HEADERS.has(lower)) continue;
        if (STRIPPED_REQUEST_HEADER_PREFIXES.some((p) => lower.startsWith(p))) continue;
        filtered[key] = value;
    }
    return filtered;
}

export function filterResponseHeaders(headers: Headers): Record<string, string> {
    const filtered: Record<string, string> = {};
    headers.forEach((value, key) => {
        if (!STRIPPED_RESPONSE_HEADERS.has(key)) {
            filtered[key] = value;
        }
    });
    return filtered;
}

export async function handler(event: LambdaFunctionUrlEvent): Promise<LambdaResponse> {
    // Target URL from query parameter
    const targetUrl = event.queryStringParameters?.url;
    if (!targetUrl) {
        return { statusCode: 400, headers: {}, body: "Missing required query parameter: url" };
    }

    try {
        new URL(targetUrl);
    } catch {
        return { statusCode: 400, headers: {}, body: "Invalid URL" };
    }

    const method = event.requestContext.http.method;
    const forwardHeaders = filterRequestHeaders(event.headers);

    const fetchOptions: RequestInit = { method, headers: forwardHeaders };
    if (event.body && method !== "GET" && method !== "HEAD") {
        fetchOptions.body = event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString()
            : event.body;
    }

    try {
        const res = await fetch(targetUrl, fetchOptions);
        const body = await res.text();
        const responseHeaders = filterResponseHeaders(res.headers);

        return { statusCode: res.status, headers: responseHeaders, body };
    } catch (err: any) {
        return { statusCode: 502, headers: {}, body: `Proxy request failed: ${err.message}` };
    }
}
