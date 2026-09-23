import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { retrieve } from "../src/server/ai/retrieval";

async function main() {
  const startedAt = performance.now();
  const rows = await retrieve(
    "What did Dana ask about the pricing decision?",
    { workspaceId: process.env.DEMO_WORKSPACE_ID ?? "" },
    8,
  );
  console.log(
    JSON.stringify(
      {
        elapsedMs: Math.round(performance.now() - startedAt),
        count: rows.length,
        rows: rows.map((row) => ({
          title: row.meetingTitle,
          text: row.text,
          score: row.score,
        })),
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
