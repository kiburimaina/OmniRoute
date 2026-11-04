import "server-only";

export type OmniRouteEnvironment = Readonly<Record<string, string | undefined>>;
export type OmniRouteConfig = Readonly<{
  enabled: boolean;
  baseUrl: string;
  apiKey: string | null;
  allowedModels: readonly string[];
  maxOutputTokens: number;
}>;

export class ModelGatewayDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelGatewayDenied";
  }
}

const MAX_RESPONSE_BYTES = 1_048_576;

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ModelGatewayDenied("OmniRoute response exceeded the 1 MiB response limit");
  }
  if (!response.body) throw new ModelGatewayDenied("OmniRoute returned an empty response body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ModelGatewayDenied("OmniRoute response exceeded the 1 MiB response limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ModelGatewayDenied("OmniRoute returned invalid JSON");
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\\d+$/.test(value)) throw new ModelGatewayDenied("OMNIROUTE_MAX_OUTPUT_TOKENS must be an integer");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ModelGatewayDenied(`OMNIROUTE_MAX_OUTPUT_TOKENS must be between 1 and ${maximum}`);
  }
  return parsed;
}

function validateBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ModelGatewayDenied("OMNIROUTE_BASE_URL must be a valid URL"); }
  if (url.username || url.password || url.search || url.hash) {
    throw new ModelGatewayDenied("OMNIROUTE_BASE_URL cannot contain credentials, query parameters, or fragments");
  }
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new ModelGatewayDenied("Remote OmniRoute endpoints must use HTTPS");
  }
  return url.toString().replace(/\\/$/, "");
}

/** Configuration is opt-in; model execution remains disabled unless explicitly enabled. */
export function getOmniRouteConfig(env: OmniRouteEnvironment = process.env): OmniRouteConfig {
  const enabled = env.OMNIROUTE_EXECUTION_ENABLED === "true";
  const baseUrl = validateBaseUrl(env.OMNIROUTE_BASE_URL || "http://127.0.0.1:20128/v1");
  const allowedModels = (env.OMNIROUTE_ALLOWED_MODELS || "")
    .split(",").map((model) => model.trim()).filter(Boolean);
  if (allowedModels.some((model) => model.length > 160 || /\\s/.test(model))) {
    throw new ModelGatewayDenied("OMNIROUTE_ALLOWED_MODELS contains an invalid model identifier");
  }
  if (new Set(allowedModels).size !== allowedModels.length) {
    throw new ModelGatewayDenied("OMNIROUTE_ALLOWED_MODELS must not contain duplicates");
  }
  const maxOutputTokens = parsePositiveInteger(env.OMNIROUTE_MAX_OUTPUT_TOKENS, 1024, 4096);
  const apiKey = env.OMNIROUTE_API_KEY?.trim() || null;
  if (enabled && (!apiKey || allowedModels.length === 0)) {
    throw new ModelGatewayDenied("Enabling OmniRoute requires an API key and an explicit model allowlist");
  }
  return Object.freeze({ enabled, baseUrl, apiKey, allowedModels: Object.freeze(allowedModels), maxOutputTokens });
}

export function assertOmniRouteModelAllowed(
  config: OmniRouteConfig,
  model: string,
  maxOutputTokens: number,
): void {
  if (!config.enabled) throw new ModelGatewayDenied("OmniRoute model execution is disabled by platform policy");
  if (!config.allowedModels.includes(model)) throw new ModelGatewayDenied("Requested model is not in the platform allowlist");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > config.maxOutputTokens) {
    throw new ModelGatewayDenied("Requested output-token budget exceeds the platform limit");
  }
}

export type OmniRouteCompletion = Readonly<{ text: string; model: string; inputTokens: number | null; outputTokens: number | null }>;

/**
 * OpenAI-compatible adapter. It is intentionally not registered with the task
 * executor: a separate reviewed milestone must connect it to agent execution.
 */
export async function completeWithOmniRoute(
  input: { model: string; system: string; prompt: string; maxOutputTokens: number },
  config = getOmniRouteConfig(),
  fetcher: typeof fetch = fetch,
): Promise<OmniRouteCompletion> {
  assertOmniRouteModelAllowed(config, input.model, input.maxOutputTokens);
  if (!input.system.trim() || !input.prompt.trim()) throw new ModelGatewayDenied("System and user prompts are required");
  if (input.system.length > 20_000 || input.prompt.length > 20_000) {
    throw new ModelGatewayDenied("System and user prompts must each be 20,000 characters or fewer");
  }
  const response = await fetcher(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }],
      max_tokens: input.maxOutputTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new ModelGatewayDenied(`OmniRoute request failed with HTTP ${response.status}`);
  const payload = await readBoundedJson(response);
  if (!payload || typeof payload !== "object") throw new ModelGatewayDenied("OmniRoute returned an invalid response");
  const data = payload as {
    model?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new ModelGatewayDenied("OmniRoute returned no completion text");
  return Object.freeze({
    text,
    model: typeof data.model === "string" ? data.model : input.model,
    inputTokens: Number.isSafeInteger(data.usage?.prompt_tokens) ? Number(data.usage?.prompt_tokens) : null,
    outputTokens: Number.isSafeInteger(data.usage?.completion_tokens) ? Number(data.usage.completion_tokens) : null,
  });
}
