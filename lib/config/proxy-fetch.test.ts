import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { proxyFetch, nodriverFetch, getFetchForConfig } from "./proxy-fetch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function fakeResponse(body: string, status = 200): Response {
    return new Response(body, { status });
}

describe("proxyFetch", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        delete process.env.PROXY_URL;
    });

    it("calls fetch directly when PROXY_URL is not set", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await proxyFetch("https://www.axs.com/venues/123/test");

        expect(mockFetch).toHaveBeenCalledWith("https://www.axs.com/venues/123/test", undefined);
    });

    it("rewrites URL to proxy when PROXY_URL is set", async () => {
        process.env.PROXY_URL = "https://proxy.lambda-url.us-west-2.on.aws/";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await proxyFetch("https://www.axs.com/venues/123/test");

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.origin + parsed.pathname).toBe("https://proxy.lambda-url.us-west-2.on.aws/");
        expect(parsed.searchParams.get("url")).toBe("https://www.axs.com/venues/123/test");
    });

    it("passes through init options to the proxied fetch", async () => {
        process.env.PROXY_URL = "https://proxy.lambda-url.us-west-2.on.aws/";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        const init: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"query":"test"}',
        };

        await proxyFetch("https://graph.amctheatres.com/graphql", init);

        const [, calledInit] = mockFetch.mock.calls[0];
        expect(calledInit).toEqual(init);
    });

    it("properly encodes URLs with special characters", async () => {
        process.env.PROXY_URL = "https://proxy.example.com/";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await proxyFetch("https://example.com/path?foo=bar&baz=1");

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.searchParams.get("url")).toBe("https://example.com/path?foo=bar&baz=1");
    });

    it("returns the response from fetch", async () => {
        const expected = fakeResponse("<html>page</html>", 200);
        mockFetch.mockResolvedValueOnce(expected);

        const result = await proxyFetch("https://example.com/");

        expect(result).toBe(expected);
    });

    it("accepts a URL object and converts to string", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await proxyFetch(new URL("https://example.com/path"));

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/path", undefined);
    });

    it("accepts a URL object when proxying", async () => {
        process.env.PROXY_URL = "https://proxy.example.com/";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await proxyFetch(new URL("https://example.com/path"));

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.searchParams.get("url")).toBe("https://example.com/path");
    });
});

describe("nodriverFetch", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        delete process.env.NODRIVER_PROXY_URL;
        delete process.env.PROXY_URL;
    });

    it("rewrites URL to nodriver sidecar when NODRIVER_PROXY_URL is set", async () => {
        process.env.NODRIVER_PROXY_URL = "http://localhost:9222";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await nodriverFetch("https://www.axs.com/page");

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.origin).toBe("http://localhost:9222");
        expect(parsed.searchParams.get("url")).toBe("https://www.axs.com/page");
    });

    it("falls back to Lambda proxy when NODRIVER_PROXY_URL is not set but PROXY_URL is", async () => {
        process.env.PROXY_URL = "https://proxy.lambda-url.us-west-2.on.aws/";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await nodriverFetch("https://www.axs.com/page");

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.origin + parsed.pathname).toBe("https://proxy.lambda-url.us-west-2.on.aws/");
        expect(parsed.searchParams.get("url")).toBe("https://www.axs.com/page");
    });

    it("falls back to direct fetch when neither proxy URL is set", async () => {
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await nodriverFetch("https://www.axs.com/page");

        expect(mockFetch).toHaveBeenCalledWith("https://www.axs.com/page", undefined);
    });

    it("passes through init options", async () => {
        process.env.NODRIVER_PROXY_URL = "http://localhost:9222";
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        const init: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"test":true}',
        };

        await nodriverFetch("https://example.com/api", init);

        const [, calledInit] = mockFetch.mock.calls[0];
        expect(calledInit).toEqual(init);
    });
});

describe("getFetchForConfig", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        delete process.env.PROXY_URL;
        delete process.env.NODRIVER_PROXY_URL;
        delete process.env.DEFAULT_PROXY_TYPE;
    });

    it("returns a direct fetch function when proxy is false", async () => {
        const fetchFn = getFetchForConfig({ proxy: false });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });

    it("returns a direct fetch function when proxy is undefined", async () => {
        const fetchFn = getFetchForConfig({});
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });

    it('returns proxyFetch when proxy is "lambda" and PROXY_URL is set', async () => {
        process.env.PROXY_URL = "https://proxy.example.com/";
        const fetchFn = getFetchForConfig({ proxy: "lambda" });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://www.axs.com/page");

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.searchParams.get("url")).toBe("https://www.axs.com/page");
    });

    it('falls back to direct fetch when proxy is "lambda" but PROXY_URL is not set', async () => {
        delete process.env.PROXY_URL;
        const fetchFn = getFetchForConfig({ proxy: "lambda" });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://www.axs.com/page");

        expect(mockFetch).toHaveBeenCalledWith("https://www.axs.com/page", undefined);
    });

    it('returns nodriverFetch when proxy is "nodriver"', async () => {
        process.env.NODRIVER_PROXY_URL = "http://localhost:9222";
        const fetchFn = getFetchForConfig({ proxy: "nodriver" });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://www.axs.com/page");

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.origin).toBe("http://localhost:9222");
        expect(parsed.searchParams.get("url")).toBe("https://www.axs.com/page");
    });

    it('DEFAULT_PROXY_TYPE=nodriver overrides "lambda" to "nodriver"', async () => {
        process.env.DEFAULT_PROXY_TYPE = "nodriver";
        process.env.NODRIVER_PROXY_URL = "http://localhost:9222";
        const fetchFn = getFetchForConfig({ proxy: "lambda" });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://www.axs.com/page");

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.origin).toBe("http://localhost:9222");
    });

    it("DEFAULT_PROXY_TYPE does not override proxy: false", async () => {
        process.env.DEFAULT_PROXY_TYPE = "nodriver";
        const fetchFn = getFetchForConfig({ proxy: false });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });

    it('DEFAULT_PROXY_TYPE does not override explicit "nodriver"', async () => {
        process.env.DEFAULT_PROXY_TYPE = "nodriver";
        process.env.NODRIVER_PROXY_URL = "http://localhost:9222";
        const fetchFn = getFetchForConfig({ proxy: "nodriver" });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://www.axs.com/page");

        const [calledUrl] = mockFetch.mock.calls[0];
        const parsed = new URL(calledUrl);
        expect(parsed.origin).toBe("http://localhost:9222");
    });
});
