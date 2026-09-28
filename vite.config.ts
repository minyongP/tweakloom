import { defineConfig } from "vite";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { readDraft, saveDraft, RevisionConflict } from "./src/server/store.ts";

const token = randomBytes(32).toString("hex");
export default defineConfig({
  define: { __DRAFT_TOKEN__: JSON.stringify(token) },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { deny: [".env", ".env.*", "**/.git/**", "**/.tweakloom/**"] },
  },
  build: {
    rollupOptions: {
      input: { editor: resolve("index.html"), demo: resolve("demo.html") },
    },
  },
  plugins: [
    {
      name: "tweakloom-local-drafts",
      configureServer(server) {
        const root = resolve(process.env.TWEAKLOOM_DATA_DIR ?? ".tweakloom");
        server.middlewares.use("/api/draft", async (req, res) => {
          const origin = `http://127.0.0.1:${req.socket.localPort}`;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          if (
            req.headers.host !== new URL(origin).host ||
            req.headers["x-tweakloom-token"] !== token ||
            (req.headers.origin && req.headers.origin !== origin)
          ) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: "접근이 거부되었습니다" }));
            return;
          }
          try {
            if (req.method === "GET") {
              res.end(JSON.stringify(await readDraft(root)));
              return;
            }
            if (
              req.method !== "PUT" ||
              req.headers.origin !== origin ||
              req.headers["content-type"] !== "application/json"
            ) {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: "지원하지 않는 요청입니다" }));
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            for await (const chunk of req) {
              bytes += chunk.length;
              if (bytes > 100_000) throw new Error("편집안 크기가 너무 큽니다");
              chunks.push(chunk);
            }
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const saved = await saveDraft(
              root,
              input.expectedRevision,
              input.draft,
            );
            res.end(JSON.stringify(saved));
          } catch (error) {
            res.statusCode = error instanceof RevisionConflict ? 409 : 400;
            res.end(
              JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : "편집안 요청에 실패했습니다",
              }),
            );
          }
        });
      },
    },
  ],
});
