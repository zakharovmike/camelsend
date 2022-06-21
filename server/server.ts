/**
 * Copyright © 2022 Mike Zakharov
 * 
 * Licensed under the GNU AGPLv3 (https://www.gnu.org/licenses/agpl-3.0.html)
 */

import { readLines } from "https://deno.land/std@0.144.0/io/buffer.ts";

const words: { adjectives: string[]; nouns: string[] } = JSON.parse(
  await Deno.readTextFile("server/words.json"),
);

const connections = new Map<string, WebSocket>();
const reverseMap = new Map<WebSocket, string>();

const server = Deno.listen({ port: 8000 });

for await (const conn of server) {
  handle(conn);
}

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
  const upgradeHeader = req.headers.get("upgrade") || "";

  if (uri === "/" && upgradeHeader === "") {
    try {
      const template = await Deno.open("webclient/index.html", { read: true });
      let output = "";

      for await (const line of readLines(template)) {
        if (line.includes("{{xxx}}")) {
          const adj1 = words.adjectives[Math.floor(Math.random() * 2)];
          const adj2 = words.adjectives[Math.floor(Math.random() * 2)];
          const noun = words.nouns[Math.floor(Math.random() * 1)];

          output = output.concat(
            line.replace("{{xxx}}", `${adj1} ${adj2} ${noun}`) + "\n",
          );
        } else {
          output = output.concat(line + "\n");
        }
      }

      const headers = new Headers();
      headers.append("Content-Type", "text/html; charset=utf-8");

      return new Response(output, { headers: headers });
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  } else if (uri.endsWith(".css") || uri.endsWith(".js")) {
    try {
      const file = await Deno.open(`webclient/${uri}`, { read: true });
      const readableStream = file.readable;

      if (uri.endsWith(".js")) {
        const headers = new Headers();
        headers.append("Content-Type", "application/javascript");

        return new Response(readableStream, { headers: headers });
      }
      return new Response(readableStream);
    } catch {
      return new Response("404 Not Found", { status: 404 });
    }
  } else if (upgradeHeader.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onerror = () => {
      const id = reverseMap.get(socket);
      if (id != undefined) {
        connections.delete(id);
      }
      reverseMap.delete(socket);
    };

    socket.onclose = () => {
      const id = reverseMap.get(socket);
      if (id != undefined) {
        connections.delete(id);
      }
      reverseMap.delete(socket);
    };

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "register-connection") {
        if (connections.has(msg.id)) {
          socket.send(JSON.stringify({ type: "id-already-taken" }));
        } else {
          connections.set(msg.id, socket);
          reverseMap.set(socket, msg.id);
        }
      } else {
        // Need to upper-case because user is not guaranteed to type in all caps
        const to = msg.to.toUpperCase();
        connections.get(to)?.send(e.data);
      }
    };

    return response;
  }

  return new Response("404 Not Found", { status: 404 });
}
