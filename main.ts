import * as log from "https://deno.land/std@0.192.0/log/mod.ts";
import { Application, Router } from "https://deno.land/x/oak@v10.1.0/mod.ts";
import { proxy } from "https://deno.land/x/oak_http_proxy@2.1.0/mod.ts";
import { AppList } from "./types.ts";

const logger = log.getLogger();

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

const PORT = 3000;

const app = new Application();

// Logger
app.use(async (context, next) => {
  await next();
  const rt = context.response.headers.get("X-Response-Time");
  logger.info(
    `${
      context.request.headers.get("Host")
    } ${context.request.method} ${context.request.url} - ${rt}`,
  );
});

// Timing
app.use(async (context, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  context.response.headers.set("X-Response-Time", `${ms}ms`);
});

// Routing
const router = new Router();

// Setup routing for healthz and readyz endpoints
router
  .get("/healthz", (context) => {
    context.response.body = "healthy";
    context.response.status = 200;
  })
  .get("/readyz", async (context) => {
    const readyFile = Deno.env.get("READY_FILE") || "ready";
    try {
      await Deno.stat(readyFile);
      context.response.body = "ready";
      return;
    } catch (_error) {
      context.response.body = "not ready";
      context.response.status = 404;
    }
  });

// Setup routing for apps
router
  .get(
    "(.*)/static/(.*)",
    proxy(
      (context) =>
        `${
          APPS[context.request.headers.get("Host")].uri || "http://localhost"
        }${context.request.url.pathname}`,
      {
        srcResHeaderDecorator(headers, _1, _2, _3, proxyRes) {
          if (proxyRes.status !== 404) {
            headers.set("Cache-Control", "public, max-age=86400");
          }
          return headers;
        },
      },
    ),
  )
  .get(
    "/(.*)",
    proxy(
      (context) =>
        `${
          APPS[context.request.headers.get("Host")].uri || "http://localhost"
        }/index.html`,
      {
        srcResHeaderDecorator(headers, _1, _2, _3, proxyRes) {
          if (proxyRes.status !== 404) {
            headers.set("Cache-Control", "public, max-age=0, must-revalidate");
          }
          return headers;
        },
      },
    ),
  );

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: PORT });
