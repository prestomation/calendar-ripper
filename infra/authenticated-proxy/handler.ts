/**
 * Lambda handler for the authenticated HTTP proxy.
 *
 * Deployed behind a Lambda Function URL with AWS_IAM auth (SigV4).
 * Callers send a JSON body describing the upstream request; the Lambda
 * executes it and returns the response.
 *
 * Environment variables:
 *   ALLOWED_DOMAINS – comma-separated domain allowlist (empty = allow all)
 */

export interface ProxyRequest {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface ProxyResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
}

interface LambdaFunctionUrlEvent {
    body?: string;
    isBase64Encoded?: boolean;
}

interface LambdaResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}

function jsonResponse(statusCode: number, body: object): LambdaResponse {
    return {
        statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    };
}

function parseAllowedDomains(): string[] {
    return (process.env.ALLOWED_DOMAINS || "")
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
}

export function isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
    if (allowedDomains.length === 0) return true;
    return allowedDomains.some(
        (d) => hostname === d || hostname.endsWith("." + d),
    );
}

export async function handler(event: LambdaFunctionUrlEvent): Promise<LambdaResponse> {
    const allowedDomains = parseAllowedDomains();

    // Parse the proxy request from the event body
    let req: ProxyRequest;
    try {
        req = JSON.parse(event.body || "{}");
    } catch {
        return jsonResponse(400, { error: "Invalid JSON body" });
    }

    if (!req.url) {
        return jsonResponse(400, { error: "Missing required field: url" });
    }

    // Validate the target URL
    let hostname: string;
    try {
        hostname = new URL(req.url).hostname;
    } catch {
        return jsonResponse(400, { error: "Invalid URL" });
    }

    if (!isDomainAllowed(hostname, allowedDomains)) {
        return jsonResponse(403, { error: `Domain not allowed: ${hostname}` });
    }

    // Execute the upstream request
    try {
        const method = req.method || "GET";
        const fetchOptions: RequestInit = {
            method,
            headers: req.headers || {},
        };

        if (req.body && method !== "GET" && method !== "HEAD") {
            fetchOptions.body = req.body;
        }

        const res = await fetch(req.url, fetchOptions);
        const body = await res.text();

        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
            headers[k] = v;
        });

        const proxyResponse: ProxyResponse = {
            status: res.status,
            statusText: res.statusText,
            headers,
            body,
        };

        return jsonResponse(200, proxyResponse);
    } catch (err: any) {
        return jsonResponse(502, {
            error: `Proxy request failed: ${err.message}`,
        });
    }
}
