// Caderno de Gastos — servidor local sem dependências.
// Uso: node server.js   (porta padrão 3000; mude com PORT=8080 node server.js)
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "dados");
const DATA_FILE = path.join(DATA_DIR, "caderno.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ---------- Dados ----------
let data = { rev: 0, settings: { expense: [], income: [] }, months: {}, goals: [] };
try {
  data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
} catch (e) {
  if (e.code !== "ENOENT") { console.error("Não consegui ler", DATA_FILE, "-", e.message); process.exit(1); }
}

let saveTimer = null;
function persist() {
  data.rev++;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DATA_FILE);
    // um backup por dia
    const n = new Date();
    const day = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    const bk = path.join(BACKUP_DIR, `caderno-${day}.json`);
    fs.copyFileSync(DATA_FILE, bk);
  }, 200);
}

// ---------- Validação ----------
const isStr = (s, max) => typeof s === "string" && s.trim().length > 0 && s.length <= max;
function validSettings(b) {
  if (!b || typeof b !== "object") return false;
  return ["expense", "income"].every(k => Array.isArray(b[k]) && b[k].length <= 200 &&
    b[k].every(c => c && isStr(c.id, 40) && isStr(c.name, 60)));
}
function validMonth(b) {
  return b && Array.isArray(b.entries) && b.entries.length <= 5000 && b.entries.every(e =>
    e && isStr(e.id, 40) && (e.kind === "expense" || e.kind === "income") && isStr(e.ctx, 40) &&
    isStr(e.name, 120) && typeof e.value === "number" && Number.isFinite(e.value) && e.value >= 0);
}

const posNum = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
function validGoals(b) {
  return b && Array.isArray(b.goals) && b.goals.length <= 500 && b.goals.every(g =>
    g && isStr(g.id, 40) && isStr(g.name, 120) && posNum(g.value) && g.value > 0 &&
    (g.basis === "monthly" || g.basis === "months") &&
    (g.basis === "monthly" ? posNum(g.monthly) && g.monthly > 0 : Number.isInteger(g.months) && g.months > 0 && g.months <= 1200) &&
    posNum(g.saved || 0) && Number.isInteger(g.color) && g.color >= 0 && g.color < 10);
}

// ---------- HTTP ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 2_000_000) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (p === "/api/data" && req.method === "GET") {
      if (url.searchParams.get("rev") === String(data.rev)) return send(res, 200, { rev: data.rev, unchanged: true });
      return send(res, 200, data);
    }
    if (p === "/api/settings" && req.method === "PUT") {
      const b = await readBody(req);
      if (!validSettings(b)) return send(res, 400, { error: "Contextos inválidos" });
      data.settings = { expense: b.expense, income: b.income };
      persist();
      return send(res, 200, { rev: data.rev });
    }
    if (p === "/api/goals" && req.method === "PUT") {
      const b = await readBody(req);
      if (!validGoals(b)) return send(res, 400, { error: "Metas inválidas" });
      data.goals = b.goals;
      persist();
      return send(res, 200, { rev: data.rev });
    }
    const m = p.match(/^\/api\/months\/(\d{4}-\d{2})$/);
    if (m && req.method === "PUT") {
      const b = await readBody(req);
      if (!validMonth(b)) return send(res, 400, { error: "Registros inválidos" });
      data.months[m[1]] = { entries: b.entries };
      persist();
      return send(res, 200, { rev: data.rev });
    }
    if (m && req.method === "DELETE") {
      if (!data.months[m[1]]) return send(res, 404, { error: "Mês não encontrado" });
      delete data.months[m[1]];
      persist();
      return send(res, 200, { rev: data.rev });
    }
    // Desligamento pedido pelo app de controle (só aceito do próprio computador)
    if (p === "/api/shutdown" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "";
      if (!/^(::1|127\.|::ffff:127\.)/.test(ip)) return send(res, 403, { error: "Proibido" });
      send(res, 200, { ok: true });
      return setTimeout(flushAndExit, 50);
    }
    if (p.startsWith("/api/")) return send(res, 404, { error: "Rota não encontrada" });

    // arquivos estáticos
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Método não permitido" });
    const file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : decodeURIComponent(p)));
    if (!file.startsWith(PUBLIC)) return send(res, 403, "Proibido", "text/plain");
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, "Não encontrado", "text/plain; charset=utf-8");
      send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
    });
  } catch (e) {
    send(res, 400, { error: "Requisição inválida" });
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\nA porta ${PORT} já está em uso.`);
    console.error(`Provavelmente o Caderno de Gastos já está aberto em outra janela: acesse http://localhost:${PORT}`);
    console.error(`Se não estiver, feche o programa que usa a porta ou rode com outra porta: set PORT=3001 && node server.js\n`);
  } else {
    console.error("\nNão foi possível iniciar o servidor:", e.message, "\n");
  }
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nCaderno de Gastos rodando.\n`);
  console.log(`  Neste computador:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  Na rede (Wi-Fi):   http://${a.address}:${PORT}`);
    }
  }
  console.log(`\n  Dados em: ${DATA_FILE}\n  Ctrl+C para parar.\n`);
});

function flushAndExit() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }
  process.exit(0);
}
process.on("SIGINT", flushAndExit);
process.on("SIGTERM", flushAndExit);
