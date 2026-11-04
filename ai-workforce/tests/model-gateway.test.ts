import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertOmniRouteModelAllowed,
  completeWithOmniRoute,
  getOmniRouteConfig,
  ModelGatewayDenied,
} from "../src/lib/model-gateway";

describe("OmniRoute model gateway policy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is disabled by default and refuses model execution", () => {
    const config = getOmniRouteConfig({});
    expect(config.enabled).toBe(false);
    expect(() => assertOmniRouteModelAllowed(config, "free-model", 100)).toThrow(/disabled/);
  });

  it("requires a key and an explicit model allowlist before enabling", () => {
    expect(() => getOmniRouteConfig({ OMNIROUTE_EXECUTION_ENABLED: "true" })).toThrow(/API key and an explicit model allowlist/);
  });

  it("accepts only exact allowlisted models and bounded output tokens", () => {
    const config = getOmniRouteConfig({
      OMNIROUTE_EXECUTION_ENABLED: "true",
      OMNIROUTE_API_KEY: "test-key",
      OMNIROUTE_ALLOWED_MODELS: "provider/free-model",
      OMNIROUTE_MAX_OUTPUT_TOKENS: "512",
    });
    expect(() => assertOmniRouteModelAllowed(config, "provider/free-model", 512)).not.toThrow();
    expect(() => assertOmniRouteModelAllowed(config, "provider/other-model", 10)).toThrow(/allowlist/);
    expect(() => assertOmniRouteModelAllowed(config, "provider/free-model", 513)).toThrow(/token budget/);
  });

  it("requires HTTPS for remote endpoints and rejects embedded credentials", () => {
    expect(() => getOmniRouteConfig({ OMNIROUTE_BASE_URL: "http://gateway.example/v1" })).toThrow(/HTTPS/);
    expect(() => getOmniRouteConfig({ OMNIROUTE_BASE_URL: "https://user:pass@gateway.example/v1" })).toThrow(/credentials/);
  });

  it("calls the OpenAI-compatible endpoint only after policy validation", async () => {
    const config = getOmniRouteConfig({
      OMNIROUTE_EXECUTION_ENABLED: "true",
      OMNIROUTE_API_KEY: "test-key",
      OMNIROUTE_BASE_URL: "http://127.0.0.1:20128/v1",
      OMNIROUTE_ALLOWED_MODELS: "provider/free-model",
      OMNIROUTE_MAX_OUTPUT_TOKENS: "256",
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      model: "provider/free-model",
      choices: [{ message: { content: "A bounded test result" } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await completeWithOmniRoute({
      model: "provider/free-model", system: "You are a test agent.", prompt: "Return a short result.", maxOutputTokens: 128,
    }, config, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:20128/v1/chat/completions");
    expect(result).toEqual({ text: "A bounded test result", model: "provider/free-model", inputTokens: 12, outputTokens: 8 });
  });

  it("rejects oversized prompts before making a network request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const config = getOmniRouteConfig({
      OMNIROUTE_EXECUTION_ENABLED: "true",
      OMNIROUTE_API_KEY: "test-key",
      OMNIROUTE_ALLOWED_MODELS: "provider/free-model",
    });
    await expect(completeWithOmniRoute({
      model: "provider/free-model", system: "s".repeat(20_001), prompt: "prompt", maxOutputTokens: 100,
    }, config, fetcher)).rejects.toThrow(/20,000 characters or fewer/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not call the network for a model outside the allowlist", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const config = getOmniRouteConfig({
      OMNIROUTE_EXECUTION_ENABLED: "true",
      OMNIROUTE_API_KEY: "test-key",
      OMNIROUTE_ALLOWED_MODELS: "provider/free-model",
    });
    await expect(completeWithOmniRoute({
      model: "provider/paid-model", system: "system", prompt: "prompt", maxOutputTokens: 100,
    }, config, fetcher)).rejects.toBeInstanceOf(ModelGatewayDenied);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
