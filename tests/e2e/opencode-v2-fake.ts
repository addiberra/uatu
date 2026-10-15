// A scripted fake OpenCode 2.0.28 server for e2e (opencode-v2-steering D13).
//
// The REAL `OpenCodeV2Provider` and `ChatAdapter` talk to it over HTTP and
// SSE exactly as they talk to `opencode serve`: the routes the pinned
// `@opencode/client` calls, its envelopes (`{ data }` for single records,
// `{ location, data }` for scoped catalogs, `{ data, cursor }` for pages,
// `204` for void routes, tagged JSON errors), and the `/api/event` stream.
//
// Turns are scripted, not simulated: a turn starts when OpenCode would start
// one and then waits for the test. `step()` is a step boundary (pending
// steers are delivered), `finish()` ends the turn with an assistant answer.
// The inbox follows 2.0.28 as design.md records it:
//   - a steer pending behind a running turn is delivered at the next step
//     boundary, in enqueue order;
//   - `resume: true` on an idle session wakes steer-scope input; a queue
//     prompt on an idle session starts a turn; a turn's start delivers
//     everything pending, oldest first;
//   - `interrupt` never deletes pending input; `?resume=true` starts a new
//     turn delivering the pending steers, absent or false wakes nothing;
//   - `inbox.cancel` answers 204 always, and only a pending entry is
//     cancelled (and announced); a delivered or missing one is a silent no-op.

import path from "node:path";

type InboxDelivery = "steer" | "queue";
type InboxFile = { mime: string; name: string; source: { type: "uri"; uri: string } };
type InboxEntry = {
  id: string;
  sessionID: string;
  time: { created: number };
  type: "user";
  payload: { text: string; files?: InboxFile[] };
  delivery: InboxDelivery;
};
type StoredMessage = Record<string, unknown> & { id: string; time: { created: number; completed?: number } };
type SessionState = {
  info: {
    id: string;
    projectID: string;
    title: string;
    location: { directory: string };
    time: { created: number; updated: number };
    agent: string;
    model: { id: string; providerID: string; variant?: string };
    parentID?: string;
    revert?: { messageID: string };
  };
  running: boolean;
  // Pending entries in enqueue order: not delivered, not cancelled.
  inbox: InboxEntry[];
  messages: StoredMessage[];
};

export type OpenCodeV2FakeSessionState = {
  running: boolean;
  pending: InboxEntry[];
  messages: Array<{ id: string; type: unknown; text?: unknown }>;
};

export type OpenCodeV2Fake = {
  readonly url: string;
  readonly password: string;
  /** Forget every session and close every event stream. */
  reset(): void;
  /** A step boundary in the running turn: delivers the pending steers. */
  step(sessionId: string): { delivered: string[] };
  /** Ends the running turn with an assistant answer; null when nothing runs. */
  finish(sessionId: string, text?: string): { assistantMessageId: string; delivered: string[] } | null;
  /** The next cancel of `inboxId` finds it already delivered (the too-late race). */
  raceDeliverOnCancel(inboxId: string): void;
  state(): { sessions: Record<string, OpenCodeV2FakeSessionState>; unhandled: string[] };
  stop(): Promise<void>;
};

const MODEL = { providerID: "opencode", modelID: "fake-model" };
const AGENTS = [
  { id: "build", name: "Build", description: "The default agent", mode: "primary", hidden: false },
  { id: "plan", name: "Plan", description: "Plans without editing", mode: "primary", hidden: false },
];
const MODELS = [{
  id: MODEL.modelID,
  modelID: MODEL.modelID,
  providerID: MODEL.providerID,
  name: "Fake Model",
  capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
  variants: [],
  limit: { context: 200_000, output: 32_000 },
  status: "active",
  enabled: true,
  cost: [],
  time: { released: 0 },
}];
const PROVIDERS = [{ id: MODEL.providerID, name: "OpenCode Zen", activation: "auto", package: "fake" }];

export function startOpenCodeV2Fake(options: { directory: string; password?: string }): OpenCodeV2Fake {
  const directory = path.resolve(options.directory);
  const password = options.password ?? "e2e-opencode-v2";
  const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
  const encoder = new TextEncoder();
  const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const sessions = new Map<string, SessionState>();
  const raceOnCancel = new Set<string>();
  const unhandled: string[] = [];
  let counter = 0;
  let clock = 0;
  // Strictly increasing: stored records sort by creation time.
  const now = () => (clock = Math.max(Date.now(), clock + 1));
  const mint = (prefix: string) => `${prefix}_fake${String(++counter).padStart(6, "0")}`;

  const write = (controller: ReadableStreamDefaultController<Uint8Array>, chunk: string) => {
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      subscribers.delete(controller);
    }
  };
  function emit(type: string, data: Record<string, unknown>, located = true): number {
    const created = now();
    const frame = { id: mint("evt"), created, type, ...(located ? { location: { directory } } : {}), data };
    for (const subscriber of [...subscribers]) write(subscriber, `data: ${JSON.stringify(frame)}\n\n`);
    return created;
  }
  const keepalive = setInterval(() => {
    for (const subscriber of [...subscribers]) write(subscriber, ": keepalive\n\n");
  }, 3_000);

  function deliver(session: SessionState, entry: InboxEntry): void {
    session.inbox = session.inbox.filter(candidate => candidate.id !== entry.id);
    const created = emit("session.inbox.delivered", { sessionID: session.info.id, inboxID: entry.id });
    session.messages.push({ id: entry.id, type: "user", time: { created }, text: entry.payload.text, ...(entry.payload.files ? { files: entry.payload.files } : {}) });
    session.info.time.updated = created;
  }
  function deliverAll(session: SessionState, filter: (entry: InboxEntry) => boolean): string[] {
    const due = session.inbox.filter(filter);
    for (const entry of due) deliver(session, entry);
    return due.map(entry => entry.id);
  }
  // A turn starts and takes everything pending with it, oldest first.
  function startTurn(session: SessionState, filter: (entry: InboxEntry) => boolean = () => true): string[] {
    session.running = true;
    emit("session.execution.started", { sessionID: session.info.id }, false);
    return deliverAll(session, filter);
  }

  function enqueue(session: SessionState, input: { id: string; text: string; files?: InboxFile[]; delivery: InboxDelivery; resume: boolean }): InboxEntry {
    const entry: InboxEntry = {
      id: input.id,
      sessionID: session.info.id,
      time: { created: now() },
      type: "user",
      payload: { text: input.text, ...(input.files?.length ? { files: input.files } : {}) },
      delivery: input.delivery,
    };
    session.inbox.push(entry);
    emit("session.inbox.enqueued", { sessionID: session.info.id, inboxID: entry.id, item: { type: "user", payload: entry.payload, delivery: entry.delivery } });
    if (!session.running) {
      // A queued prompt on a resting session starts a turn; a steer wakes it
      // only when asked to resume.
      if (input.delivery === "queue" || input.resume) startTurn(session);
    }
    return entry;
  }

  function finish(session: SessionState, text: string): { assistantMessageId: string; delivered: string[] } {
    const sessionID = session.info.id;
    // The final step begins at a boundary: steers pending now are part of it.
    const delivered = deliverAll(session, entry => entry.delivery === "steer");
    const assistantMessageID = mint("msg");
    const started = emit("session.step.started", { sessionID, agent: session.info.agent, model: session.info.model, assistantMessageID, started: now() });
    emit("session.text.started", { sessionID, assistantMessageID, ordinal: 0 });
    emit("session.text.delta", { sessionID, assistantMessageID, ordinal: 0, delta: text });
    emit("session.text.ended", { sessionID, assistantMessageID, ordinal: 0, text });
    const completed = emit("session.step.ended", { sessionID, assistantMessageID, finish: "stop", rawFinish: "stop" });
    session.messages.push({
      id: assistantMessageID,
      type: "assistant",
      time: { created: started, completed },
      agent: session.info.agent,
      model: session.info.model,
      content: [{ type: "text", text }],
      finish: "stop",
    });
    session.running = false;
    session.info.time.updated = completed;
    emit("session.execution.succeeded", { sessionID }, false);
    // Natively queued input waits for the turn to end, then starts the next.
    if (session.inbox.some(entry => entry.delivery === "queue")) startTurn(session);
    return { assistantMessageId: assistantMessageID, delivered };
  }

  function createSession(body: Record<string, unknown>): SessionState {
    const created = now();
    const model = body.model as { id?: string; providerID?: string; variant?: string } | undefined;
    const info: SessionState["info"] = {
      id: mint("ses"),
      projectID: "global",
      title: typeof body.title === "string" && body.title ? body.title : `New session - ${new Date(created).toISOString()}`,
      location: { directory },
      time: { created, updated: created },
      agent: typeof body.agent === "string" ? body.agent : "build",
      model: model?.id && model.providerID
        ? { id: model.id, providerID: model.providerID, ...(model.variant ? { variant: model.variant } : {}) }
        : { id: MODEL.modelID, providerID: MODEL.providerID },
    };
    const session: SessionState = { info, running: false, inbox: [], messages: [] };
    sessions.set(info.id, session);
    emit("session.created", { sessionID: info.id, title: info.title, location: info.location, projectID: info.projectID, version: "2.0.28" });
    return session;
  }

  const scoped = (data: unknown) => Response.json({ location: { directory }, data });
  const enveloped = (data: unknown) => Response.json({ data });
  const noContent = () => new Response(null, { status: 204 });
  const sessionNotFound = (sessionID: string) => Response.json({ _tag: "SessionNotFoundError", sessionID, message: `Session not found: ${sessionID}` }, { status: 404 });
  const notFound = (what: string) => Response.json({ _tag: "NotFoundError", message: what }, { status: 404 });
  const mimeOf = (name: string) => ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" })[path.extname(name).toLowerCase()] ?? "application/octet-stream";

  function eventStream(signal: AbortSignal): Response {
    let self: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        self = controller;
        subscribers.add(controller);
        write(controller, `data: ${JSON.stringify({ id: mint("evt"), type: "server.connected", data: {} })}\n\n`);
      },
      cancel() {
        if (self) subscribers.delete(self);
      },
    });
    signal.addEventListener("abort", () => { if (self) subscribers.delete(self); }, { once: true });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  }

  async function handle(request: Request): Promise<Response> {
    if (request.headers.get("authorization") !== authorization) return Response.json({ _tag: "UnauthorizedError", message: "unauthorized" }, { status: 401 });
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    const body = request.method === "GET" || request.method === "DELETE" ? {} : await request.json().catch(() => ({})) as Record<string, unknown>;
    if (route === "GET /api/event") return eventStream(request.signal);
    if (route === "GET /api/agent") return scoped(AGENTS);
    if (route === "GET /api/command" || route === "GET /api/skill" || route === "GET /api/mcp" || route === "GET /api/form" || route === "GET /api/permission/request") return scoped([]);
    if (route === "GET /api/model") return scoped(MODELS);
    if (route === "GET /api/model/default") return scoped({ id: MODEL.modelID, ...MODEL });
    if (route === "GET /api/provider") return scoped(PROVIDERS);
    if (route === "POST /api/location/reload") {
      emit("location.shutdown", {});
      for (const type of ["command.updated", "skill.updated", "model.updated", "agent.updated"]) emit(type, {});
      return noContent();
    }
    if (route === "GET /api/session") {
      const wanted = url.searchParams.get("directory");
      const listed = [...sessions.values()]
        .filter(session => !wanted || path.resolve(wanted) === session.info.location.directory)
        .map(session => session.info)
        .sort((left, right) => url.searchParams.get("order") === "asc" ? left.time.updated - right.time.updated : right.time.updated - left.time.updated);
      return Response.json({ data: listed, cursor: { next: null } });
    }
    if (route === "POST /api/session") return enveloped(createSession(body).info);
    if (url.pathname.startsWith("/api/permission/request/") && request.method === "POST") return noContent();

    const match = /^\/api\/session\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
    if (!match) {
      unhandled.push(route);
      return notFound(`no route ${route}`);
    }
    const sessionID = decodeURIComponent(match[1]!);
    const rest = match[2] ?? "";
    const session = sessions.get(sessionID);
    if (!session) return sessionNotFound(sessionID);
    const sub = `${request.method} ${rest}`;

    if (sub === "GET ") return enveloped(session.info);
    if (sub === "PATCH ") {
      if (typeof body.title === "string") {
        session.info.title = body.title;
        session.info.time.updated = emit("session.renamed", { sessionID, title: body.title });
      }
      return noContent();
    }
    if (sub === "POST model") {
      const model = body.model as { id: string; providerID: string; variant?: string };
      session.info.model = { id: model.id, providerID: model.providerID, ...(model.variant ? { variant: model.variant } : {}) };
      return noContent();
    }
    if (sub === "POST agent") {
      session.info.agent = String(body.agent);
      return noContent();
    }
    if (sub === "POST prompt") {
      const files = Array.isArray(body.files)
        ? (body.files as Array<{ uri: string; name: string }>).map(file => ({ mime: mimeOf(file.name), name: file.name, source: { type: "uri" as const, uri: file.uri } }))
        : undefined;
      const entry = enqueue(session, {
        id: typeof body.id === "string" ? body.id : mint("msg"),
        text: String(body.text ?? ""),
        ...(files?.length ? { files } : {}),
        // 2.x's default delivery is steer.
        delivery: body.delivery === "queue" ? "queue" : "steer",
        resume: body.resume === true,
      });
      return enveloped(entry);
    }
    if (sub === "POST command") {
      // The server mints the id and expands the template; this fake runs the
      // command's text as a natively queued prompt.
      enqueue(session, { id: mint("msg"), text: `/${String(body.name)}${body.text ? ` ${String(body.text)}` : ""}`, delivery: "queue", resume: true });
      return noContent();
    }
    if (sub === "POST compact") {
      return enveloped({ id: typeof body.id === "string" ? body.id : mint("msg"), sessionID, time: { created: now() }, type: "compaction", payload: {}, delivery: "queue" });
    }
    if (sub === "POST interrupt") {
      const wasRunning = session.running;
      if (wasRunning) {
        session.running = false;
        emit("session.execution.interrupted", { sessionID, reason: "user" }, false);
      }
      // Pending input is never deleted; only `resume=true` wakes the steers.
      if (url.searchParams.get("resume") === "true" && session.inbox.some(entry => entry.delivery === "steer")) {
        startTurn(session, entry => entry.delivery === "steer");
      }
      return Response.json({ interrupted: wasRunning });
    }
    if (sub === "GET inbox") return Response.json({ data: session.inbox });
    const inboxMatch = /^(DELETE|PATCH) inbox\/(.+)$/.exec(sub);
    if (inboxMatch) {
      const inboxID = decodeURIComponent(inboxMatch[2]!);
      const entry = session.inbox.find(candidate => candidate.id === inboxID);
      if (inboxMatch[1] === "PATCH") {
        // Uatu never switches delivery through the inbox (design D1).
        if (entry && (body.delivery === "steer" || body.delivery === "queue") && entry.delivery !== body.delivery) {
          entry.delivery = body.delivery;
          emit("session.inbox.delivery.changed", { sessionID, inboxID, delivery: entry.delivery });
        }
        return noContent();
      }
      if (entry && raceOnCancel.delete(inboxID)) {
        // Too late: the boundary took it before the cancel arrived.
        if (!session.running) startTurn(session, () => false);
        deliver(session, entry);
        return noContent();
      }
      if (entry) {
        session.inbox = session.inbox.filter(candidate => candidate !== entry);
        emit("session.inbox.cancelled", { sessionID, inboxID });
      }
      // A delivered or missing entry: 204 and nothing announced (2.0.28).
      return noContent();
    }
    if (sub === "GET message") {
      const ordered = [...session.messages].sort((left, right) => left.time.created - right.time.created);
      return Response.json({ data: url.searchParams.get("order") === "desc" ? ordered.reverse() : ordered, cursor: { next: null } });
    }
    if (sub === "POST revert/stage") {
      session.info.revert = { messageID: String(body.messageID) };
      return enveloped({});
    }
    if (sub === "DELETE revert") {
      delete session.info.revert;
      return noContent();
    }
    unhandled.push(route);
    return notFound(`no route ${route}`);
  }

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    // Event streams sit quiet between keepalives; never time them out.
    idleTimeout: 0,
    fetch: request => handle(request).catch(error => Response.json({ _tag: "InternalError", message: String(error) }, { status: 500 })),
  });

  function closeStreams(): void {
    for (const subscriber of [...subscribers]) {
      try {
        subscriber.close();
      } catch {
        // already closed
      }
    }
    subscribers.clear();
  }

  return {
    url: `http://127.0.0.1:${server.port}`,
    password,
    reset() {
      closeStreams();
      sessions.clear();
      raceOnCancel.clear();
      unhandled.length = 0;
    },
    step(sessionId) {
      const session = sessions.get(sessionId);
      if (!session?.running) return { delivered: [] };
      return { delivered: deliverAll(session, entry => entry.delivery === "steer") };
    },
    finish(sessionId, text) {
      const session = sessions.get(sessionId);
      if (!session?.running) return null;
      const answers = session.messages.filter(message => message.type === "assistant").length;
      return finish(session, text ?? `Answer ${answers + 1}`);
    },
    raceDeliverOnCancel(inboxId) {
      raceOnCancel.add(inboxId);
    },
    state() {
      const result: Record<string, OpenCodeV2FakeSessionState> = {};
      for (const [id, session] of sessions) {
        result[id] = {
          running: session.running,
          pending: session.inbox.map(entry => ({ ...entry })),
          messages: session.messages.map(message => ({ id: message.id, type: message.type, ...(message.type === "user" ? { text: message.text } : {}) })),
        };
      }
      return { sessions: result, unhandled: [...unhandled] };
    },
    async stop() {
      clearInterval(keepalive);
      closeStreams();
      await server.stop(true);
    },
  };
}
