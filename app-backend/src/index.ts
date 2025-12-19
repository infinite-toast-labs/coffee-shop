import { Hono } from "hono";
import { cors } from "hono/cors";
import { AppEnv } from "./env";
import { toApiError } from "./lib/errors";
import { validateMessage } from "./lib/messages";

const app = new Hono<AppEnv>();
const cacheKey = "messages:v1";

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
