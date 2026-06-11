import "dotenv/config";
import express, { Request, Response } from "express";
import path from "node:path";
import { Agent } from "eidentic";
import { AIModel } from "eidentic";
import { LibsqlStore } from "@eidentic/libsql";
import { openai } from "@ai-sdk/openai";
import type { StreamEvent } from "eidentic";

// ---------------------------------------------------------------------------
// Store & Agent
// ---------------------------------------------------------------------------

const store = new LibsqlStore("file:eidentic.db");

const agent = new Agent({
  id: "chat-agent",
  instructions:
    "You are a helpful assistant with persistent memory. " +
    "Remember details the user shares across the conversation.",
  model: new AIModel(openai("gpt-4o-mini")),
  store,
});

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// POST /api/chat — SSE streaming endpoint
app.post("/api/chat", async (req: Request, res: Response): Promise<void> => {
  const { message, sessionId } = req.body as {
    message?: string;
    sessionId?: string;
  };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }

  // --- SSE headers ---
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx proxy buffering
  res.flushHeaders();

  const sendEvent = (ev: StreamEvent): void => {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };

  try {
    for await (const ev of agent.query(message, { sessionId })) {
      sendEvent(ev);
      // Flush each event immediately so the browser sees it without buffering.
      // Express 4 wraps the underlying Node.js socket; calling (res as any).flush()
      // triggers compression middleware flushes when present.
      if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
        (res as unknown as { flush: () => void }).flush();
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const errEvent: { type: string; error: string } = {
      type: "error",
      error: message,
    };
    res.write(`data: ${JSON.stringify(errEvent)}\n\n`);
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 8787);

app.listen(PORT, () => {
  console.log(`Eidentic × Express chat running at http://localhost:${PORT}`);
});
