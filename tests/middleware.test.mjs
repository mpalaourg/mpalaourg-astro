import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/middleware.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [{
    name: "astro-middleware-test-stub",
    setup(builder) {
      builder.onResolve({ filter: /^astro:middleware$/ }, () => ({
        path: "astro:middleware",
        namespace: "test",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: "export const defineMiddleware = (handler) => handler;",
        loader: "js",
      }));
    },
  }],
});
const { onRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
);

test("site headers can be added to an immutable cached response", async () => {
  const cachedResponse = await fetch("data:text/plain,ok");
  assert.throws(() => cachedResponse.headers.set("X-Test", "value"), TypeError);

  const response = await onRequest({}, async () => cachedResponse);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Content-Security-Policy"), "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
});
