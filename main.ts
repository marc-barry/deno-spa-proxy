import { logger } from "https://deno.land/x/hono@v3.2.7/middleware.ts";
import { Context, Hono } from "https://deno.land/x/hono@v3.2.7/mod.ts";
import { setResponseHeaders } from "./headers.ts";
import { AppList } from "./types.ts";

const STATIC_CACHE_CONTROL: Record<string, string> = {
  "Cache-Control": "public max-age=86400",
};
const INDEX_CACHE_CONTROL: Record<string, string> = {
  "Cache-Control": "public, max-age=0, must-revalidate",
};
const NO_STORE_CACHE_CONTROL: Record<string, string> = {
  "Cache-Control": "no-store",
};

let APPS: AppList = {};
// This is a dynamic import for the app config
// If the file isn't provided it throws an error
try {
  APPS = (await import("./config.ts")).APPS;
} catch (_error) {
  console.error(
    "No config module provided. It must exist at ./config.ts and export APPS.",
  );
  Deno.exit(1);
}

async function proxy(
  c: Context,
  path: string | null,
  responseHeaders: Record<string, string>,
): Promise<Response> {
  const uri = APPS[c.req.headers.get("Host") || "localhost"].uri;
  const proxyPath = path || c.req.path;
  const fResponse = await fetch(`${uri}${proxyPath}`, c.req);
  return setResponseHeaders(fResponse, responseHeaders);
}

const app = new Hono();
const PORT = 3000;

// Logger middleware
app.use("*", logger());

// Setup routing for healthz and readyz endpoints
app.get("/healthz", (context) => {
  const resp = context.text("healthy");

  return setResponseHeaders(resp, NO_STORE_CACHE_CONTROL);
});

app.get("/readyz", async (context) => {
  const readyFile = Deno.env.get("READY_FILE") || "ready";
  let resp: Response;
  try {
    await Deno.stat(readyFile);
    resp = context.text("ready");
  } catch (_error) {
    resp = context.text("not ready", 404);
  }
  return setResponseHeaders(resp, NO_STORE_CACHE_CONTROL);
});

// Setup routing for apps

// Get static assets
app.get("/static/*", (c) => {
  return proxy(c, null, STATIC_CACHE_CONTROL);
});
app.get("/_next/static/*", (c) => {
  return proxy(c, null, STATIC_CACHE_CONTROL);
});

// Get top level files under root with special handling for login and logout
app.get("/:top", (c) => {
  const top = c.req.param("top");
  // The login and logout paths are treated differently as they don't correspond to actual objects
  const path = (top === "login" || top === "logout")
    ? "/index.html"
    : `${c.req.path}`;
  return proxy(c, path, INDEX_CACHE_CONTROL);
});

// Get all other paths
app.get("*", (c) => {
  return proxy(c, "/index.html", INDEX_CACHE_CONTROL);
});

Deno.serve({ port: PORT, handler: app.fetch });
