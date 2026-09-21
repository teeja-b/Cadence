import fs from "node:fs";
import path from "node:path";
import express from "express";
import rateLimit from "express-rate-limit";
import { createAuth } from "./auth.js";
import { createTasks } from "./tasks.js";

// Everything the server needs is passed in, so tests can supply their own database and mailer.
export function createApp({ pool, jwtSecret, mailer, verificationRequired, appUrl, staticDir }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Cloud Run puts one proxy in front of us (needed for correct client IPs)
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  });

  const auth = createAuth({ pool, jwtSecret, mailer, verificationRequired, appUrl });
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts. Please try again in a few minutes." },
  });
  app.use("/api/auth", limiter, auth.router);
  app.use("/api/tasks", createTasks({ pool, requireAuth: auth.requireAuth }));
  app.use("/api", (req, res) => res.status(404).json({ message: "Not found" }));

  // Serve the built frontend (single container = single Cloud Run service, no CORS to configure).
  if (staticDir && fs.existsSync(path.join(staticDir, "index.html"))) {
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders(res, file) {
          res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
        },
      })
    );
    // Client-side routes (/calendar, /task/123, ...) all get index.html; missing files stay 404.
    app.use((req, res, next) => {
      if ((req.method !== "GET" && req.method !== "HEAD") || path.extname(req.path)) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use((err, req, res, next) => {
    void next;
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ message: status >= 500 ? "Something went wrong on the server." : err.message });
  });

  return app;
}
