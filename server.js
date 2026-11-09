const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (urlPath === "/info") {
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
    return;
  }

  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.setHeader(
      "Content-Type",
      MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    );
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: "/cs2_webradar" });

// code -> { sender: ws | null, viewers: Set<ws> }
const rooms = new Map();

wss.on("connection", (ws, req) => {
  let code = "default";
  let role = "viewer";

  try {
    const url = new URL(req.url, "http://localhost");
    code = url.searchParams.get("code") || code;
    role = url.searchParams.get("role") || role;
  } catch {}

  if (!rooms.has(code)) {
    const room = { sender: null, viewers: new Set(), pending: null };
    room.timer = setInterval(() => {
      if (room.pending !== null && room.viewers.size > 0) {
        room.viewers.forEach((viewer) => {
          if (viewer.readyState === 1) viewer.send(room.pending);
        });
      }
      room.pending = null;
    }, 200);
    rooms.set(code, room);
  }
  const room = rooms.get(code);

  if (role === "sender") {
    const old = room.sender;
    room.sender = ws;
    if (old && old !== ws) {
      try {
        old.close();
      } catch {}
    }
    console.log(`[sender] code=${code}`);
  } else {
    room.viewers.add(ws);
    console.log(`[viewer] code=${code} (${room.viewers.size} online)`);
  }

  ws.on("message", (message) => {
    if (role === "sender") room.pending = message;
  });

  ws.on("close", () => {
    if (role === "sender") {
      if (room.sender === ws) room.sender = null;
    } else {
      room.viewers.delete(ws);
    }
  });
});

server.listen(PORT, () => console.log(`cs2 radar relay listening on port ${PORT}`));
