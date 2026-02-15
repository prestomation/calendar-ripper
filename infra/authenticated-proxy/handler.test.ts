import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    handler,
    isDomainAllowed,
    filterRequestHeaders,
    filterResponseHeaders,
    LambdaFunctionUrlEvent,
} from "./handler.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---- helpers --------------------------------------------------------------

function makeEvent(overrides: Partial<LambdaFunctionUrlEvent> & { url?: string; method?: string } = {}): LambdaFunctionUrlEvent {
    const { url, method, ...rest } = overrides;
    return {
        queryStringParameters: url !== undefined ? { url } : undefined,
        headers: {},
        requestContext: { http: { method: method ?? "GET" } },
        ...rest,
    };
}

function fakeResponse(body: string, init: { status: number; statusText?: string; headers?: Record<string, string> }): Response {
    return new Response(body, {
        status: init.status,
        statusText: init.statusText ?? "OK",
        headers: init.headers,
    });
}

// ---- isDomainAllowed ------------------------------------------------------

describe("isDomainAllowed", () => {
    it("allows any domain when the allowlist is empty", () => {
        expect(isDomainAllowed("evil.com", [])).toBe(true);
    });

    it("allows an exact domain match", () => {
        expect(isDomainAllowed("www.axs.com", ["www.axs.com"])).toBe(true);
    });

    it("allows a subdomain of an allowed domain", () => {
        expect(isDomainAllowed("api.example.com", ["example.com"])).toBe(true);
    });

    it("rejects a domain not in the allowlist", () => {
        expect(isDomainAllowed("evil.com", ["example.com", "axs.com"])).toBe(false);
    });

    it("rejects a domain that only shares a suffix (notaxs.com vs axs.com)", () => {
        expect(isDomainAllowed("notaxs.com", ["axs.com"])).toBe(false);
    });

    it("handles deeply nested subdomains", () => {
        expect(isDomainAllowed("a.b.c.example.com", ["example.com"])).toBe(true);
    });
});

// ---- filterRequestHeaders -------------------------------------------------

describe("filterRequestHeaders", () => {
    it("strips host, authorization, and content-length", () => {
        const result = filterRequestHeaders({
            host: "proxy.lambda-url.us-east-1.on.aws",
            authorization: "AWS4-HMAC-SHA256 ...",
            "content-length": "42",
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0",
        });
        expect(result).toEqual({
            "content-type": "application/json",
            "user-agent": "Mozilla/5.0",
        });
    });

    it("strips x-amz-* headers", () => {
        const result = filterRequestHeaders({
            "x-amz-date": "20260215T000000Z",
            "x-amz-security-token": "tok",
            "x-amz-content-sha256": "abc",
            accept: "text/html",
        });
        expect(result).toEqual({ accept: "text/html" });
    });

    it("strips x-forwarded-* headers", () => {
        const result = filterRequestHeaders({
            "x-forwarded-for": "1.2.3.4",
            "x-forwarded-port": "443",
            "x-forwarded-proto": "https",
            origin: "https://www.amctheatres.com",
        });
        expect(result).toEqual({ origin: "https://www.amctheatres.com" });
    });

    it("passes through application headers untouched", () => {
        const input = {
            accept: "text/html",
            "accept-language": "en-US",
            "user-agent": "CustomAgent/1.0",
            referer: "https://example.com",
            origin: "https://example.com",
            "content-type": "application/json",
        };
        expect(filterRequestHeaders(input)).toEqual(input);
    });
});

// ---- filterResponseHeaders ------------------------------------------------

describe("filterResponseHeaders", () => {
    it("strips hop-by-hop and encoding headers", () => {
        const headers = new Headers({
            "content-type": "text/html",
            "transfer-encoding": "chunked",
            connection: "keep-alive",
            "content-encoding": "gzip",
            "content-length": "1234",
            "x-custom": "value",
        });
        const result = filterResponseHeaders(headers);
        expect(result).toEqual({
            "content-type": "text/html",
            "x-custom": "value",
        });
    });
});

// ---- handler --------------------------------------------------------------

describe("handler", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env.ALLOWED_DOMAINS = "";
    });

    // -- Input validation ---------------------------------------------------

    it("returns 400 when ?url is missing", async () => {
        const result = await handler(makeEvent());
        expect(result.statusCode).toBe(400);
        expect(result.body).toContain("Missing required query parameter: url");
    });

    it("returns 400 for an invalid URL", async () => {
        const result = await handler(makeEvent({ url: "not-a-url" }));
        expect(result.statusCode).toBe(400);
        expect(result.body).toBe("Invalid URL");
    });

    // -- Domain allowlist ---------------------------------------------------

    it("returns 403 when target domain is not allowed", async () => {
        process.env.ALLOWED_DOMAINS = "www.axs.com,graph.amctheatres.com";
        const result = await handler(makeEvent({ url: "https://evil.com/steal" }));
        expect(result.statusCode).toBe(403);
        expect(result.body).toContain("Domain not allowed: evil.com");
    });

    it("allows a subdomain of an allowed domain", async () => {
        process.env.ALLOWED_DOMAINS = "amctheatres.com";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        const result = await handler(makeEvent({ url: "https://graph.amctheatres.com/graphql" }));
        expect(result.statusCode).toBe(200);
        expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("allows any domain when ALLOWED_DOMAINS is empty", async () => {
        process.env.ALLOWED_DOMAINS = "";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        const result = await handler(makeEvent({ url: "https://anything.example.org/" }));
        expect(result.statusCode).toBe(200);
    });

    // -- GET passthrough ----------------------------------------------------

    it("proxies a GET and passes through upstream status, headers, body", async () => {
        mockFetch.mockResolvedValueOnce(
            fakeResponse("<html>event page</html>", {
                status: 200,
                headers: { "Content-Type": "text/html", "X-Custom": "value" },
            }),
        );

        const result = await handler(makeEvent({
            url: "https://www.axs.com/venues/123/test",
            headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" },
        }));

        expect(result.statusCode).toBe(200);
        expect(result.body).toBe("<html>event page</html>");
        expect(result.headers["content-type"]).toBe("text/html");
        expect(result.headers["x-custom"]).toBe("value");

        expect(mockFetch).toHaveBeenCalledWith(
            "https://www.axs.com/venues/123/test",
            expect.objectContaining({
                method: "GET",
                headers: { "user-agent": "Mozilla/5.0", "accept": "text/html" },
            }),
        );
    });

    it("uses the request method from the event (GET by default)", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));
        await handler(makeEvent({ url: "https://example.com/" }));
        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", expect.objectContaining({ method: "GET" }));
    });

    // -- POST passthrough ---------------------------------------------------

    it("proxies a POST with body and custom headers", async () => {
        const graphqlBody = '{"query":"{ viewer { theatre { name } } }"}';

        mockFetch.mockResolvedValueOnce(
            fakeResponse('{"data":{}}', {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const result = await handler(makeEvent({
            url: "https://graph.amctheatres.com/graphql",
            method: "POST",
            headers: {
                "content-type": "application/json",
                origin: "https://www.amctheatres.com",
                referer: "https://www.amctheatres.com/",
                // These should be stripped:
                host: "proxy.lambda-url.us-east-1.on.aws",
                authorization: "AWS4-HMAC-SHA256 Credential=...",
                "x-amz-date": "20260215T000000Z",
                "x-amz-security-token": "token123",
            },
            body: graphqlBody,
        }));

        expect(result.statusCode).toBe(200);
        expect(result.body).toBe('{"data":{}}');

        // Verify infra headers were stripped and app headers forwarded
        const [, fetchOpts] = mockFetch.mock.calls[0];
        expect(fetchOpts.method).toBe("POST");
        expect(fetchOpts.body).toBe(graphqlBody);
        expect(fetchOpts.headers).toEqual({
            "content-type": "application/json",
            origin: "https://www.amctheatres.com",
            referer: "https://www.amctheatres.com/",
        });
    });

    // -- Body handling ------------------------------------------------------

    it("does not forward body for GET requests", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        await handler(makeEvent({
            url: "https://example.com/",
            method: "GET",
            body: "should be ignored",
        }));

        const [, fetchOpts] = mockFetch.mock.calls[0];
        expect(fetchOpts.body).toBeUndefined();
    });

    it("does not forward body for HEAD requests", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("", { status: 200 }));

        await handler(makeEvent({
            url: "https://example.com/",
            method: "HEAD",
            body: "should be ignored",
        }));

        const [, fetchOpts] = mockFetch.mock.calls[0];
        expect(fetchOpts.body).toBeUndefined();
    });

    it("decodes base64-encoded bodies", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        const original = '{"query":"test"}';
        await handler(makeEvent({
            url: "https://example.com/api",
            method: "POST",
            body: Buffer.from(original).toString("base64"),
            isBase64Encoded: true,
        }));

        const [, fetchOpts] = mockFetch.mock.calls[0];
        expect(fetchOpts.body).toBe(original);
    });

    // -- Upstream error passthrough -----------------------------------------

    it("passes through upstream non-200 status directly", async () => {
        mockFetch.mockResolvedValueOnce(
            fakeResponse("Forbidden", { status: 403, statusText: "Forbidden" }),
        );

        const result = await handler(makeEvent({ url: "https://example.com/blocked" }));

        expect(result.statusCode).toBe(403);
        expect(result.body).toBe("Forbidden");
    });

    // -- Network failures ---------------------------------------------------

    it("returns 502 when fetch throws", async () => {
        mockFetch.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND example.com"));

        const result = await handler(makeEvent({ url: "https://example.com/" }));

        expect(result.statusCode).toBe(502);
        expect(result.body).toContain("Proxy request failed");
        expect(result.body).toContain("ENOTFOUND");
    });

    // -- Response header filtering ------------------------------------------

    it("strips hop-by-hop headers from upstream response", async () => {
        mockFetch.mockResolvedValueOnce(
            fakeResponse("ok", {
                status: 200,
                headers: {
                    "Content-Type": "text/html",
                    "X-Request-Id": "abc123",
                },
            }),
        );

        const result = await handler(makeEvent({ url: "https://example.com/" }));

        expect(result.headers["content-type"]).toBe("text/html");
        expect(result.headers["x-request-id"]).toBe("abc123");
        // These would be stripped if present (set by Response internals):
        expect(result.headers["transfer-encoding"]).toBeUndefined();
        expect(result.headers["connection"]).toBeUndefined();
    });
});
