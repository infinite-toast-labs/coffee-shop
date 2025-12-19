import { Hono } from "hono";
import { cors } from "hono/cors";
import { AppEnv } from "./env";
import { toApiError } from "./lib/errors";
import { normalizeMessage, validateMessage } from "./lib/messages";

const app = new Hono<AppEnv>();
const cacheKey = "messages:v1";
const specialModel = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const specialCacheTtlSeconds = 6 * 60 * 60;

type SpecialRequest = {
  season: string;
  caffeine: string;
  prepTimeMinutes: number;
  notes: string;
};

type SpecialResponse = {
  name: string;
  description: string;
  ingredients: string[];
  steps: string[];
  price: string;
  generated_at: string;
};

const normalizeOption = (
  value: unknown,
  fallback: string,
  allowed: Set<string>,
  maxLength = 32,
) => {
  if (typeof value !== "string") return fallback;
  const normalized = normalizeMessage(value).toLowerCase().slice(0, maxLength);
  if (!normalized) return fallback;
  const mapped = normalized === "fall" ? "autumn" : normalized;
  return allowed.has(mapped) ? mapped : fallback;
};

const parsePrepTimeMinutes = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(Math.round(parsed), 2), 20);
};

const normalizeNotes = (value: unknown) => {
  if (typeof value !== "string") return "";
  return normalizeMessage(value).slice(0, 120);
};

const normalizeSpecialRequest = (body: unknown): SpecialRequest => {
  const payload = typeof body === "object" && body !== null ? body : {};
  const season = normalizeOption(
    (payload as { season?: unknown }).season,
    "any",
    new Set(["spring", "summer", "autumn", "winter", "any"]),
  );
  const caffeine = normalizeOption(
    (payload as { caffeine?: unknown }).caffeine,
    "full",
    new Set(["full", "half", "decaf"]),
  );
  const prepTimeMinutes = parsePrepTimeMinutes(
    (payload as { prepTimeMinutes?: unknown }).prepTimeMinutes,
  );
  const notes = normalizeNotes((payload as { notes?: unknown }).notes);

  return { season, caffeine, prepTimeMinutes, notes };
};

const digestCacheKey = async (input: SpecialRequest) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `ai:special:${hash}`;
};

const buildSpecialPrompt = (input: SpecialRequest) => {
  const caffeineLabel =
    input.caffeine === "decaf"
      ? "decaf"
      : input.caffeine === "half"
        ? "half-caf"
        : "full caffeine";
  const seasonLabel = input.season === "any" ? "any season" : input.season;
  const noteLine = input.notes ? `Notes: ${input.notes}` : "Notes: none";

  return [
    "Create a coffee shop daily special drink.",
    `Season: ${seasonLabel}.`,
    `Caffeine: ${caffeineLabel}.`,
    `Prep time: ${input.prepTimeMinutes} minutes.`,
    noteLine,
  ].join(" ");
};

const extractJsonObject = (raw: string) => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
};

const normalizeStringField = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  return normalizeMessage(value).slice(0, maxLength);
};

const normalizeStringArray = (value: unknown, maxItems: number, maxLength = 80) => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => normalizeStringField(item, maxLength))
    .filter(Boolean);
  return normalized.slice(0, maxItems);
};

const parseSpecialResponse = (raw: string): SpecialResponse | null => {
  const jsonText = extractJsonObject(raw) ?? raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const name = normalizeStringField(record.name, 64);
  const description = normalizeStringField(record.description, 240);
  const ingredients = normalizeStringArray(record.ingredients, 8);
  const steps = normalizeStringArray(record.steps, 6);
  const price = normalizeStringField(record.price, 16);

  if (!name || !description || ingredients.length < 3 || steps.length < 2 || !price) {
    return null;
  }

  return {
    name,
    description,
    ingredients,
    steps,
    price,
    generated_at: new Date().toISOString(),
  };
};

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (!origin) {
        return c.env.APP_ORIGIN;
      }
      const allowed = new Set([c.env.APP_ORIGIN, c.env.API_ORIGIN]);
      return allowed.has(origin) ? origin : c.env.APP_ORIGIN;
    },
    credentials: true,
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/healthz", (c) => c.json({ status: "ok" }));

app.get("/api/messages", async (c) => {
  try {
    const cached = await c.env.CACHE.get(cacheKey, "json");
    if (cached) {
      return c.json({ messages: cached });
    }

    const result = await c.env.DB.prepare(
      "SELECT id, content, created_at FROM messages ORDER BY created_at DESC LIMIT 50",
    ).all();

    const messages = result.results ?? [];
    await c.env.CACHE.put(cacheKey, JSON.stringify(messages), {
      expirationTtl: 60,
    });
    return c.json({ messages });
  } catch (error) {
    console.error("Failed to load messages", error);
    return c.json(toApiError(error), 500);
  }
});

app.post("/api/messages", async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateMessage(body?.content ?? "");
    if (!validation.ok) {
      return c.json({ error: validation.error, code: "BAD_REQUEST" }, 400);
    }

    const createdAt = new Date().toISOString();
    await c.env.DB.prepare(
      "INSERT INTO messages (content, created_at) VALUES (?, ?)",
    )
      .bind(validation.value, createdAt)
      .run();

    await c.env.CACHE.delete(cacheKey);

    return c.json({
      message: {
        content: validation.value,
        created_at: createdAt,
      },
    });
  } catch (error) {
    console.error("Failed to create message", error);
    return c.json(toApiError(error), 500);
  }
});

app.post("/api/assets", async (c) => {
  try {
    const body = await c.req.json();
    const content = typeof body?.content === "string" ? body.content : "";
    if (!content.trim()) {
      return c.json({ error: "Content is required.", code: "BAD_REQUEST" }, 400);
    }

    const inputKey = typeof body?.key === "string" ? body.key.trim() : "";
    const key = inputKey.length > 0 ? inputKey : `note-${crypto.randomUUID()}.txt`;

    await c.env.ASSETS.put(key, content, {
      httpMetadata: {
        contentType: "text/plain; charset=utf-8",
      },
    });

    return c.json({ key });
  } catch (error) {
    console.error("Failed to write asset", error);
    return c.json(toApiError(error), 500);
  }
});

app.post("/api/ai/special", async (c) => {
  if (!c.env.AI) {
    return c.json(
      {
        error: "Workers AI is not configured for this environment.",
        code: "AI_NOT_READY",
      },
      503,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const input = normalizeSpecialRequest(body);
  const cacheKey = await digestCacheKey(input);

  try {
    const cached = await c.env.CACHE.get(cacheKey, "json");
    if (cached) {
      return c.json({ special: cached, cached: true });
    }

    const result = (await c.env.AI.run(specialModel, {
      messages: [
        {
          role: "system",
          content:
            "You are a coffee shop barista. Respond with ONLY a JSON object that matches this schema: " +
            '{"name":"...","description":"...","ingredients":["..."],"steps":["..."],"price":"$0.00"}. ' +
            "Use ASCII only. No markdown, no extra keys.",
        },
        {
          role: "user",
          content: buildSpecialPrompt(input),
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.7,
      top_p: 0.9,
    })) as { response?: string };

    const raw = typeof result?.response === "string" ? result.response : "";
    const special = raw ? parseSpecialResponse(raw) : null;
    if (!special) {
      return c.json(
        { error: "AI returned an unexpected response.", code: "AI_BAD_RESPONSE" },
        502,
      );
    }

    await c.env.CACHE.put(cacheKey, JSON.stringify(special), {
      expirationTtl: specialCacheTtlSeconds,
    });

    return c.json({ special, cached: false });
  } catch (error) {
    console.error("Failed to generate special", error);
    return c.json({ error: "AI request failed.", code: "AI_ERROR" }, 502);
  }
});

app.get("/api/assets/:key", async (c) => {
  const key = c.req.param("key");
  const asset = await c.env.ASSETS.get(key);
  if (!asset) {
    return c.json({ error: "Asset not found", code: "NOT_FOUND" }, 404);
  }

  const headers = new Headers();
  asset.writeHttpMetadata(headers);
  headers.set("etag", asset.httpEtag);
  headers.set("cache-control", "public, max-age=60");

  return new Response(asset.body, { headers });
});

export default app;
