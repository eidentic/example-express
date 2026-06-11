# Eidentic x Express — memory-backed chat

A standalone example showing how to drop the [eidentic](https://github.com/eidentic/eidentic) `Agent` into an existing Express app and stream responses over Server-Sent Events (SSE). The agent remembers details across the conversation thanks to `LibsqlStore` and per-session memory, all persisted locally in a SQLite file.

---

## What you get

- **Express 4 server** (`src/index.ts`) — one `POST /api/chat` route that runs `agent.query()` and streams every `StreamEvent` as an SSE frame.
- **Vanilla-JS chat client** (`public/index.html`) — served statically by Express, no build step required. Connects with a stable `sessionId` (stored in `localStorage`) and renders streamed text deltas in real time.
- **Persistent memory** — `LibsqlStore` writes events and memory blocks to `eidentic.db` on disk; the agent picks up where it left off across server restarts.

---

## Prerequisites

- Node.js 20+
- An OpenAI API key (or swap to another provider — see below)

---

## Install

```bash
git clone <this-repo>
cd eidentic-express-example
npm install
```

## Configure

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY=sk-...
```

## Run

```bash
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) in your browser.

For production:

```bash
npm start
```

---

## How it works

### `agent.query()` as an async generator

`Agent.query(input, { sessionId })` returns an `AsyncIterable<StreamEvent>`. The Express route iterates it with `for await` and writes each event as an SSE frame:

```ts
for await (const ev of agent.query(message, { sessionId })) {
  res.write(`data: ${JSON.stringify(ev)}\n\n`);
}
res.end();
```

### StreamEvent shape

`StreamEvent` is a discriminated union on the `type` field. The key variants:

| `type` | Payload | Purpose |
|---|---|---|
| `"session.init"` | `{ sessionId, agentId, tools, model }` | emitted once at the start of every run |
| `"stream.delta"` | `{ delta: { text: string } }` | incremental text output |
| `"assistant"` | `{ content: ContentBlock[], usage }` | full assistant turn + token usage |
| `"tool.result"` | `{ callId, toolName, output, isError }` | tool execution result |
| `"result"` | `{ subtype, output, usage, numTurns, sessionId, cost? }` | terminal event (success / error / aborted / …) |
| `"compaction"` | `{ before, after, stages }` | context-window compaction audit |

The client filters for `ev.type === "stream.delta"` and appends `ev.delta.text` to build the streamed response.

### LibsqlStore persists memory per sessionId

```ts
const store = new LibsqlStore("file:eidentic.db");
// store.migrate() is called automatically on first use by the Agent
```

Each `query()` call passes a `sessionId` so the agent loads the session's event log, rebuilds context, and appends new events — giving the agent cross-turn memory within a session.

---

## Swap the model provider

Install the AI SDK adapter for your provider and update `src/index.ts`:

```bash
npm install @ai-sdk/anthropic
```

```ts
import { anthropic } from "@ai-sdk/anthropic";
// ...
model: new AIModel(anthropic("claude-sonnet-4-5")),
```

`AIModel` is a thin wrapper that adapts any AI SDK `LanguageModel` to eidentic's `ModelPort` — the rest of the code is unchanged.

---

## Links

- GitHub: https://github.com/eidentic/eidentic
- Docs: https://docs.eidentic.dev

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
