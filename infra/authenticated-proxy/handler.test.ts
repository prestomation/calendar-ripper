import { describe, it, expect, vi, beforeEach } from "vitest";
import { handler, isDomainAllowed } from "./handler.js";

// ---------------------------------------------------------------------------
// Stub the global fetch that the handler uses
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Helper to build a minimal Response-like object that the handler can consume
function fakeResponse(body: string, init: { status: number; statusText?: string; headers?: Record<string, string> }): Response {
    return new Response(body, {
        status: init.status,
        statusText: init.statusText ?? "OK",
        headers: init.headers,
    });
}

// ---------------------------------------------------------------------------
// isDomainAllowed unit tests
// ---------------------------------------------------------------------------
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

    it("rejects a domain that only shares a suffix", () => {
        // "notaxs.com" should NOT match "axs.com"
        expect(isDomainAllowed("notaxs.com", ["axs.com"])).toBe(false);
    });

    it("handles deeply nested subdomains", () => {
        expect(isDomainAllowed("a.b.c.example.com", ["example.com"])).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// handler integration tests
// ---------------------------------------------------------------------------
describe("handler", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env.ALLOWED_DOMAINS = "";
    });

    // -- Input validation ---------------------------------------------------

    it("returns 400 for invalid JSON body", async () => {
        const result = await handler({ body: "not json" });
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: "Invalid JSON body" });
    });

    it("returns 400 when url is missing", async () => {
        const result = await handler({ body: JSON.stringify({}) });
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: "Missing required field: url" });
    });

    it("returns 400 for an invalid URL", async () => {
        const result = await handler({ body: JSON.stringify({ url: "not-a-url" }) });
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ error: "Invalid URL" });
    });

    it("returns 400 when body is undefined (empty event)", async () => {
        const result = await handler({});
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).error).toContain("Missing required field");
    });

    // -- Domain allowlist ---------------------------------------------------

    it("returns 403 when target domain is not in the allowlist", async () => {
        process.env.ALLOWED_DOMAINS = "www.axs.com,graph.amctheatres.com";
        const result = await handler({
            body: JSON.stringify({ url: "https://evil.com/steal" }),
        });
        expect(result.statusCode).toBe(403);
        expect(JSON.parse(result.body).error).toContain("Domain not allowed: evil.com");
    });

    it("allows a subdomain of an allowed domain", async () => {
        process.env.ALLOWED_DOMAINS = "amctheatres.com";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        const result = await handler({
            body: JSON.stringify({ url: "https://graph.amctheatres.com/graphql" }),
        });
        expect(result.statusCode).toBe(200);
        expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("allows any domain when ALLOWED_DOMAINS is empty", async () => {
        process.env.ALLOWED_DOMAINS = "";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        const result = await handler({
            body: JSON.stringify({ url: "https://anything.example.org/path" }),
        });
        expect(result.statusCode).toBe(200);
    });

    // -- Proxying GET -------------------------------------------------------

    it("proxies a GET request and returns the upstream response", async () => {
        mockFetch.mockResolvedValueOnce(
            fakeResponse("<html>event page</html>", {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "text/html" },
            }),
        );

        const result = await handler({
            body: JSON.stringify({ url: "https://www.axs.com/venues/123/test" }),
        });

        expect(result.statusCode).toBe(200);

        const parsed = JSON.parse(result.body);
        expect(parsed.status).toBe(200);
        expect(parsed.statusText).toBe("OK");
        expect(parsed.body).toBe("<html>event page</html>");
        expect(parsed.headers["content-type"]).toBe("text/html");

        expect(mockFetch).toHaveBeenCalledWith("https://www.axs.com/venues/123/test", {
            method: "GET",
            headers: {},
        });
    });

    it("defaults method to GET when not specified", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        await handler({
            body: JSON.stringify({ url: "https://example.com/" }),
        });

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", expect.objectContaining({ method: "GET" }));
    });

    // -- Proxying POST ------------------------------------------------------

    it("proxies a POST request with body and custom headers", async () => {
        mockFetch.mockResolvedValueOnce(
            fakeResponse('{"data":{"viewer":{}}}', {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/json" },
            }),
        );

        const graphqlBody = '{"query":"{ viewer { theatre(slug:\\"test\\") { name } } }"}';

        const result = await handler({
            body: JSON.stringify({
                url: "https://graph.amctheatres.com/graphql",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Origin": "https://www.amctheatres.com",
                },
                body: graphqlBody,
            }),
        });

        expect(result.statusCode).toBe(200);
        const parsed = JSON.parse(result.body);
        expect(parsed.status).toBe(200);
        expect(parsed.body).toBe('{"data":{"viewer":{}}}');

        expect(mockFetch).toHaveBeenCalledWith(
            "https://graph.amctheatres.com/graphql",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Origin": "https://www.amctheatres.com",
                },
                body: graphqlBody,
            },
        );
    });

    // -- Body stripping for GET/HEAD ----------------------------------------

    it("does not forward a body for GET requests even if one is provided", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        await handler({
            body: JSON.stringify({
                url: "https://example.com/page",
                method: "GET",
                body: "should be stripped",
            }),
        });

        const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callArgs.body).toBeUndefined();
    });

    it("does not forward a body for HEAD requests", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("", { status: 200 }));

        await handler({
            body: JSON.stringify({
                url: "https://example.com/page",
                method: "HEAD",
                body: "should be stripped",
            }),
        });

        const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callArgs.body).toBeUndefined();
    });

    // -- Upstream error passthrough -----------------------------------------

    it("returns upstream non-200 status inside the 200 proxy response", async () => {
        mockFetch.mockResolvedValueOnce(
            fakeResponse("Forbidden", { status: 403, statusText: "Forbidden" }),
        );

        const result = await handler({
            body: JSON.stringify({ url: "https://example.com/blocked" }),
        });

        // The proxy itself succeeded
        expect(result.statusCode).toBe(200);

        // But the upstream returned 403
        const parsed = JSON.parse(result.body);
        expect(parsed.status).toBe(403);
        expect(parsed.statusText).toBe("Forbidden");
        expect(parsed.body).toBe("Forbidden");
    });

    // -- Network-level failures ---------------------------------------------

    it("returns 502 when fetch throws (network error)", async () => {
        mockFetch.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND example.com"));

        const result = await handler({
            body: JSON.stringify({ url: "https://example.com/" }),
        });

        expect(result.statusCode).toBe(502);
        expect(JSON.parse(result.body).error).toContain("Proxy request failed");
        expect(JSON.parse(result.body).error).toContain("ENOTFOUND");
    });

    // -- Response headers ---------------------------------------------------

    it("includes all response headers from upstream", async () => {
        mockFetch.mockResolvedValueOnce(
            fakeResponse("ok", {
                status: 200,
                headers: {
                    "X-Custom-Header": "custom-value",
                    "Content-Type": "text/plain",
                },
            }),
        );

        const result = await handler({
            body: JSON.stringify({ url: "https://example.com/" }),
        });

        const parsed = JSON.parse(result.body);
        expect(parsed.headers["x-custom-header"]).toBe("custom-value");
        expect(parsed.headers["content-type"]).toBe("text/plain");
    });

    // -- Content-Type on proxy responses ------------------------------------

    it("always sets Content-Type: application/json on proxy responses", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok", { status: 200 }));

        const result = await handler({
            body: JSON.stringify({ url: "https://example.com/" }),
        });

        expect(result.headers["Content-Type"]).toBe("application/json");
    });

    it("sets Content-Type: application/json on error responses too", async () => {
        const result = await handler({ body: "bad json" });
        expect(result.headers["Content-Type"]).toBe("application/json");
    });
});
