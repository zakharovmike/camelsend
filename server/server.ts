/**
 * Copyright © 2022 Mike Zakharov
 *
 * Licensed under the GNU AGPLv3 (https://www.gnu.org/licenses/agpl-3.0.html)
 */

import { readLines } from "https://deno.land/std@0.144.0/io/buffer.ts";

interface Words {
  first: string[];
  second: string[];
  nouns: string[];
}

const words: Words = JSON.parse(
  await Deno.readTextFile("server/words.json"),
);

type Id = string;
type Token = string;
type TimeoutId = number;

const connections = new Map<Id, [Token, WebSocket | null, TimeoutId]>();
const reverseMap = new Map<WebSocket, Id>();

const server = Deno.listen({ port: 8000 });

for await (const conn of server) {
  handle(conn);
}

/* ==================================== */

async function handle(conn: Deno.Conn) {
  const httpConn = Deno.serveHttp(conn);
  for await (const requestEvent of httpConn) {
    try {
      await requestEvent.respondWith(handleReq(requestEvent.request));
    } catch { /**/ }
  }
}

async function handleReq(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const uri = decodeURIComponent(url.pathname);

  const staticFile = uri.endsWith(".ico") ||
    uri.endsWith(".js") ||
    uri.endsWith(".css") ||
    uri.endsWith(".png") ||
    uri.endsWith(".woff2");
  const websocketUpgrade =
    req.headers.get("upgrade")?.toLowerCase() === "websocket";

  if (staticFile) {
    return await serveStaticFile(uri);
  } else if (websocketUpgrade) {
    return handleWebSocketUpgrade(req);
  } else {
    return await serveWebsite();
  }
}

async function serveStaticFile(uri: string): Promise<Response> {
  let file;
  try {
    file = (await Deno.open(`webclient/${uri}`, { read: true })).readable;
  } catch {
    return new Response("404 Not Found", { status: 404 });
  }

  const headers = new Headers();
  if (uri.endsWith(".js")) {
    headers.append("Content-Type", "application/javascript");
  }

  return new Response(file, { headers: headers });
}

function handleWebSocketUpgrade(req: Request): Response {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onerror = () => clearEntriesFor(socket);
  socket.onclose = () => clearEntriesFor(socket);
  socket.onmessage = (e) => handleSocketMessage(e, socket);

  return response;
}

function clearEntriesFor(socket: WebSocket) {
  const id = reverseMap.get(socket);
  if (id !== undefined) connections.delete(id);
  reverseMap.delete(socket);
}

function handleSocketMessage(e: MessageEvent, socket: WebSocket) {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "register-connection":
      handleRegisterConnectionMessage(msg.id, msg.token, socket);
      break;

    case "id-request":
      handleIdRequestMessage(socket);
      break;

    default:
      connections.get(msg.to)?.[1]?.send(e.data);
      break;
  }
}

function handleRegisterConnectionMessage(
  id: Id,
  token: Token,
  socket: WebSocket,
) {
  const entry = connections.get(id);
  if (entry === undefined) return;

  const [entryToken, _, entryTimeoutId] = entry;

  // Rudimentary security policy:
  // The server knows the token to every session ID it generates, and passes it
  // onto the client making a session ID request (directly or via website load).
  // The client must then prove that they are the true owners of that session ID
  // by returning the same token (that they previously received) as the one
  // registerd on the server.
  // Without checking tokens, a malevolent client could brute force session IDs
  // (since they are all known) and attempt to hijack a session ID to redirect
  // signaling messages to their socket.
  // Since a token cannot (in a reasonable time) be brute forced, this should
  // prevent such hijacking.
  if (token !== entryToken) return;

  clearTimeout(entryTimeoutId);
  connections.set(id, [entryToken, socket, -1]);
  reverseMap.set(socket, id);
}

function handleIdRequestMessage(socket: WebSocket) {
  const token = generateToken();
  let sessionId;
  try {
    sessionId = generateSessionId();
  } catch {
    socket.send(JSON.stringify({ type: "id-failed-response" }));
    return;
  }
  registerSessionId(sessionId, token);

  socket.send(
    JSON.stringify({ type: "id-response", id: sessionId, token: token }),
  );
}

async function serveWebsite(): Promise<Response> {
  const token = generateToken();
  let sessionId;
  try {
    sessionId = generateSessionId();
  } catch {
    return new Response("503 Service Unavailable", { status: 503 });
  }
  registerSessionId(sessionId, token);

  const template = await Deno.open("webclient/index.html", { read: true });
  let html = "";

  for await (const line of readLines(template)) {
    if (line.includes("{{xxx}}")) {
      const lineWithTokenAndId = line
        .replace("{{token}}", token)
        .replace("{{xxx}}", sessionId);

      html = html.concat(lineWithTokenAndId + "\n");
    } else {
      html = html.concat(line + "\n");
    }
  }

  template.close();

  const headers = new Headers();
  headers.append("Content-Type", "text/html; charset=utf-8");

  return new Response(html, { headers: headers });
}

function generateToken(): Token {
  return self.crypto.randomUUID();
}

function generateSessionId(): Id {
  const pickSessionId = (): Id => {
    const first = words.first[Math.floor(Math.random() * words.first.length)];
    const second =
      words.second[Math.floor(Math.random() * words.second.length)];
    const noun = words.nouns[Math.floor(Math.random() * words.nouns.length)];

    return `${first} ${second} ${noun}`.toUpperCase();
  };

  let sessionId = pickSessionId();

  let retries = 0;
  while (connections.has(sessionId)) {
    sessionId = pickSessionId();

    retries++;
    if (retries >= 100) {
      throw new Error("Failed to generate a unique session ID in 100 tries");
    }
  }

  return sessionId;
}

function registerSessionId(sessionId: Id, token: Token) {
  // If a reserved session ID is not claimed within 15 seconds after registration,
  // it is recycled for future use.
  const timeoutId = setTimeout(() => {
    connections.delete(sessionId);
  }, 15_000);

  connections.set(sessionId, [token, null, timeoutId]);
}
