import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { trackRoutes } from "./routes/tracks";
import { analyzeRoutes } from "./routes/analyze";
import { checkHealth } from "./services/ml-client";

const app = new Elysia()
  .use(cors())
  .use(trackRoutes)
  .use(analyzeRoutes)
  .get("/api/health", async () => {
    const mlHealthy = await checkHealth();
    return { status: "ok", ml_service: mlHealthy };
  })
  .listen(3000);

console.log(`Backend running at http://localhost:${app.server?.port}`);
