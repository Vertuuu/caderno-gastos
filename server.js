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
const TMP_FILE = DATA_FILE + ".tmp";
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const SAFETY_DIR = path.join(BACKUP_DIR, "antes-de-apagar");

const SCHEMA = 1;              // versão do formato do caderno.json
const KCOUNT = 10;             // quantidade de cores das tabelas
const MAX_VALUE = 1e9;         // R$ 1 bilhão por registro
const KEEP_DAILY_DAYS = 30;    // backups diários mantidos
const KEEP_SAFETY = 20;        // backups "antes de apagar" mantidos

fs.mkdirSync(SAFETY_DIR, { recursive: true });

// ---------- Utilidades ----------
const pad = (n) => String(n).padStart(2, "0");
const dayStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeStamp = (d = new Date()) => `${dayStamp(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const log = (...a) => console.log(`[${new Date().toLocaleTimeString("pt-BR")}]`, ...a);
const logErr = (...a) => console.error(`[${new Date().toLocaleTimeString("pt-BR")}]`, ...a);

// ---------- Normalização (formato garantido ao carregar) ----------
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
function normalize(raw, problems) {
  const d = isObj(raw) ? raw : {};
  if (!isObj(raw)) problems.push("conteúdo não era um objeto");
  const out = { schema: SCHEMA, rev: Number.isFinite(d.rev) ? d.rev : 0, settings: { expense: [], income: [] }, months: {}, goals: [], plans: [] };
  for (const k of ["expense", "income"]) {
    const list = isObj(d.settings) && Array.isArray(d.settings[k]) ? d.settings[k] : [];
    out.settings[k] = list.filter(c => isObj(c) && typeof c.id === "string" && typeof c.name === "string");
    if (out.settings[k].length !== list.length) problems.push(`tabelas inválidas descartadas em ${k}`);
  }
  if (isObj(d.months)) {
    for (const [id, m] of Object.entries(d.months)) {
      if (!MONTH_RE.test(id) || !isObj(m) || !Array.isArray(m.entries)) { problems.push(`mês ${id} inválido descartado`); continue; }
      const ok = m.entries.filter(e => isObj(e) && typeof e.id === "string" && typeof e.value === "number" && Number.isFinite(e.value));
      if (ok.length !== m.entries.length) problems.push(`registros inválidos descartados em ${id}`);
      out.months[id] = { entries: ok };
      if (Number.isFinite(m.opening) && Math.abs(m.opening) <= MAX_VALUE) out.months[id].opening = m.opening;
    }
  } else if (d.months !== undefined) problems.push("meses em formato inválido");
  out.goals = Array.isArray(d.goals) ? d.goals.filter(g => isObj(g) && typeof g.id === "string") : [];
  out.plans = Array.isArray(d.plans) ? d.plans.filter(x => isObj(x) && typeof x.id === "string") : [];
  // revisão da última mudança de cada documento (tabelas, metas e cada mês), para detectar conflitos
  out.docRev = {};
  if (isObj(d.docRev)) for (const [k, v] of Object.entries(d.docRev)) if (Number.isFinite(v)) out.docRev[k] = v;
  return out;
}

// ---------- Carregamento, com recuperação de arquivo corrompido ----------
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function backupCandidates() {
  const list = [];
  for (const dir of [BACKUP_DIR, SAFETY_DIR]) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const p = path.join(dir, f);
      list.push({ p, t: fs.statSync(p).mtimeMs });
    }
  }
  return list.sort((a, b) => b.t - a.t).map(x => x.p);
}
function load() {
  let raw;
  try {
    raw = readJson(DATA_FILE);
  } catch (e) {
    if (e.code === "ENOENT") return normalize({}, []);
    if (!(e instanceof SyntaxError)) {   // arquivo existe mas não deu para ler (travado, sem permissão): não mexe em nada
      logErr(`Não consegui ler ${DATA_FILE} (${e.code || e.message}). Feche programas que estejam usando o arquivo e tente de novo.`);
      process.exit(1);
    }
    logErr(`O arquivo ${DATA_FILE} está danificado (${e.message}). Procurando uma cópia boa…`);
    let from = null;
    for (const cand of [TMP_FILE, ...backupCandidates()]) {
      try { raw = readJson(cand); from = cand; break; } catch (_) { /* tenta a próxima */ }
    }
    if (!from) {
      logErr("Nenhuma cópia válida encontrada. Nada foi alterado. Restaure um backup manualmente na pasta", BACKUP_DIR);
      process.exit(1);
    }
    const bad = path.join(DATA_DIR, `caderno.corrompido-${timeStamp()}.json`);
    fs.renameSync(DATA_FILE, bad);
    log(`Recuperado de: ${from}`);
    log(`O arquivo danificado foi guardado como: ${bad}`);
    dirty = true;   // grava a cópia recuperada como o novo caderno.json
  }
  if (Number.isFinite(raw && raw.schema) && raw.schema > SCHEMA) {
    logErr(`\nEstes dados foram gravados por uma versão mais nova do Caderno de Gastos (formato ${raw.schema}).`);
    logErr("Atualize o app (git pull) antes de ligar o servidor. Nada foi alterado.\n");
    process.exit(1);
  }
  const problems = [];
  const out = normalize(raw, problems);
  if (problems.length) { log("Ajustes ao carregar os dados:", problems.join("; ")); dirty = true; }
  return out;
}

let dirty = false;           // há mudanças ainda não gravadas
let diskError = null;        // última falha de gravação (enquanto houver, novas mudanças são recusadas)
let data = load();

// ---------- Gravação segura ----------
let saveTimer = null, firstPendingAt = 0, retryTimer = null;

function dailyBackup() {
  const bk = path.join(BACKUP_DIR, `caderno-${dayStamp()}.json`);
  if (fs.existsSync(bk) || !fs.existsSync(DATA_FILE)) return;
  fs.copyFileSync(DATA_FILE, bk);   // estado de antes da primeira mudança do dia
  pruneBackups();
}

// Grava em arquivo temporário e troca de nome; tenta de novo se o Windows estiver segurando o arquivo.
function writeData() {
  const json = JSON.stringify(data, null, 2);
  const waits = [100, 250, 500];
  for (let i = 0; ; i++) {
    try {
      try { dailyBackup(); } catch (e) { logErr("Não consegui criar o backup do dia:", e.message); }
      fs.writeFileSync(TMP_FILE, json);
      fs.renameSync(TMP_FILE, DATA_FILE);
      if (diskError) log("Gravação voltou a funcionar.");
      dirty = false; diskError = null;
      return true;
    } catch (e) {
      if (i >= waits.length) {
        diskError = e;
        logErr(`Não consegui gravar ${DATA_FILE} (${e.code || e.message}). Tentando de novo a cada 5 s.`);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(flushNow, 5000);
        return false;
      }
      logErr(`Falha ao gravar (${e.code || e.message}), tentativa ${i + 2} de ${waits.length + 1}…`);
      sleepSync(waits[i]);
    }
  }
}

function flushNow() {
  clearTimeout(saveTimer); saveTimer = null; firstPendingAt = 0;
  if (dirty) writeData();
}

// Agrupa gravações próximas (200 ms), sem passar de 1 s de atraso.
function persist() {
  data.rev++;
  dirty = true;
  const now = Date.now();
  if (!firstPendingAt) firstPendingAt = now;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushNow, Math.max(0, Math.min(200, firstPendingAt + 1000 - now)));
}

// Cópia do estado atual antes de uma mudança que apaga coisas.
function safetyBackup(reason) {
  try {
    const file = path.join(SAFETY_DIR, `caderno-${timeStamp()}-${reason}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    const old = fs.readdirSync(SAFETY_DIR).filter(f => f.endsWith(".json")).sort().reverse().slice(KEEP_SAFETY);
    old.forEach(f => fs.unlinkSync(path.join(SAFETY_DIR, f)));
  } catch (e) { logErr("Não consegui criar o backup antes de apagar:", e.message); }
}

// Mantém os diários dos últimos 30 dias e o último de cada mês mais antigo.
function pruneBackups() {
  try {
    const re = /^caderno-(\d{4}-\d{2})-(\d{2})\.json$/;
    const limit = dayStamp(new Date(Date.now() - KEEP_DAILY_DAYS * 864e5));
    const files = fs.readdirSync(BACKUP_DIR).filter(f => re.test(f)).sort();
    const lastOfMonth = new Map();
    files.forEach(f => lastOfMonth.set(f.match(re)[1], f));
    const keep = new Set(lastOfMonth.values());
    for (const f of files) {
      const day = f.slice(8, 18);
      if (day >= limit || keep.has(f)) continue;
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }
  } catch (e) { logErr("Não consegui limpar backups antigos:", e.message); }
}
pruneBackups();
setInterval(pruneBackups, 864e5).unref();
if (dirty) flushNow();

// ---------- Validação (devolve objetos limpos, ou null se inválido) ----------
const isStr = (s, max) => typeof s === "string" && s.trim().length > 0 && s.length <= max;
const posNum = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
const optBool = (b) => b === undefined || typeof b === "boolean";
const uniqueIds = (list) => new Set(list.map(x => x.id)).size === list.length;

// Datas de recebimento de uma tabela de entradas: divide o valor em parcelas, cada uma com a sua regra de dia
// ("util" = N-ésimo dia útil do mês; "dia" = dia fixo, com ajuste quando cai em fim de semana ou feriado).
function cleanPay(p) {
  if (p === undefined) return undefined;
  if (!isObj(p) || typeof p.on !== "boolean" || !optBool(p.sat) || !Array.isArray(p.parts) || p.parts.length < 1 || p.parts.length > 6) return null;
  const ok = p.parts.every(x => isObj(x) && isStr(x.id, 40) && (x.type === "util" || x.type === "dia") && Number.isInteger(x.n) &&
    x.n >= 1 && x.n <= (x.type === "util" ? 23 : 31) && posNum(x.pct) && x.pct <= 100 &&
    (x.adjust === undefined || x.adjust === "antes" || x.adjust === "depois" || x.adjust === "manter"));
  if (!ok || !uniqueIds(p.parts)) return null;
  const sum = p.parts.reduce((s, x) => s + Math.round(x.pct * 100), 0);
  if (sum !== 10000) return null;
  return { on: p.on, sat: !!p.sat, parts: p.parts.map(x => ({ id: x.id, type: x.type, n: x.n, pct: x.pct, adjust: x.adjust || "antes" })) };
}

function cleanSettings(b) {
  if (!isObj(b)) return null;
  const out = {};
  for (const k of ["expense", "income"]) {
    const list = b[k];
    if (!Array.isArray(list) || list.length > 200) return null;
    if (!list.every(c => isObj(c) && isStr(c.id, 40) && isStr(c.name, 60) && optBool(c.repeat) &&
      (c.color === undefined || (Number.isInteger(c.color) && c.color >= 0 && c.color < KCOUNT)) && cleanPay(c.pay) !== null)) return null;
    out[k] = list.map(c => {
      const o = { id: c.id, name: c.name };
      if (c.color !== undefined) o.color = c.color;
      if (c.repeat !== undefined) o.repeat = c.repeat;
      if (c.pay !== undefined) o.pay = cleanPay(c.pay);
      return o;
    });
  }
  if (!uniqueIds([...out.expense, ...out.income])) return null;
  return out;
}

function cleanMonth(b) {
  if (!isObj(b) || !Array.isArray(b.entries) || b.entries.length > 5000) return null;
  if (!b.entries.every(e => isObj(e) && isStr(e.id, 40) && (e.kind === "expense" || e.kind === "income") && isStr(e.ctx, 40) &&
    isStr(e.name, 120) && posNum(e.value) && e.value <= MAX_VALUE && (e.at === undefined || posNum(e.at)) &&
    (e.day === undefined || (Number.isInteger(e.day) && e.day >= 1 && e.day <= 31)) && (e.part === undefined || isStr(e.part, 40)) && optBool(e.paid) &&
    (e.inst === undefined || (isObj(e.inst) && isStr(e.inst.plan, 40) && Number.isInteger(e.inst.k) && e.inst.k >= 0 && e.inst.k <= 120)))) return null;
  if (!uniqueIds(b.entries)) return null;
  // saldo no início do mês (opcional, pode ser negativo), usado na previsão do saldo
  if (b.opening !== undefined && !(typeof b.opening === "number" && Number.isFinite(b.opening) && Math.abs(b.opening) <= MAX_VALUE)) return null;
  const out = { entries: b.entries.map(e => {
    const o = { id: e.id, kind: e.kind, ctx: e.ctx, name: e.name, value: e.value };
    if (e.at !== undefined) o.at = e.at;
    if (e.day !== undefined) o.day = e.day;
    if (e.part !== undefined) o.part = e.part;
    if (e.paid === true) o.paid = true;      // conta de saída marcada como paga
    if (e.inst !== undefined) o.inst = { plan: e.inst.plan, k: e.inst.k };   // parcela k de uma compra parcelada (0 = antecipação)
    return o;
  }) };
  if (b.opening !== undefined) out.opening = Math.round(b.opening * 100) / 100;
  return out;
}

function cleanGoals(b) {
  if (!isObj(b) || !Array.isArray(b.goals) || b.goals.length > 500) return null;
  const ok = b.goals.every(g => isObj(g) && isStr(g.id, 40) && isStr(g.name, 120) && posNum(g.value) && g.value > 0 && g.value <= MAX_VALUE &&
    (g.basis === "monthly" || g.basis === "months") &&
    (g.basis === "monthly" ? posNum(g.monthly) && g.monthly > 0 : Number.isInteger(g.months) && g.months > 0 && g.months <= 1200) &&
    (g.saved === undefined || posNum(g.saved)) && optBool(g.active) &&
    Number.isInteger(g.color) && g.color >= 0 && g.color < KCOUNT);
  if (!ok || !uniqueIds(b.goals)) return null;
  return b.goals.map(g => {
    const o = { id: g.id, name: g.name, value: g.value, basis: g.basis, color: g.color, saved: g.saved || 0 };
    if (posNum(g.monthly)) o.monthly = g.monthly;
    if (Number.isInteger(g.months) && g.months > 0) o.months = g.months;
    if (g.active !== undefined) o.active = g.active;
    return o;
  });
}

// Compras parceladas: total dividido em n parcelas mensais a partir de "first"; "until" = mês em que o resto foi antecipado
function cleanPlans(b) {
  if (!isObj(b) || !Array.isArray(b.plans) || b.plans.length > 500) return null;
  const ok = b.plans.every(x => isObj(x) && isStr(x.id, 40) && isStr(x.name, 100) && isStr(x.ctx, 40) && posNum(x.total) && x.total > 0 && x.total <= MAX_VALUE &&
    Number.isInteger(x.n) && x.n >= 2 && x.n <= 120 && typeof x.first === "string" && MONTH_RE.test(x.first) &&
    (x.until === undefined || (typeof x.until === "string" && MONTH_RE.test(x.until))) &&
    (x.day === undefined || (Number.isInteger(x.day) && x.day >= 1 && x.day <= 31)) && (x.at === undefined || posNum(x.at)));
  if (!ok || !uniqueIds(b.plans)) return null;
  return b.plans.map(x => {
    const o = { id: x.id, name: x.name, ctx: x.ctx, total: x.total, n: x.n, first: x.first };
    if (x.until !== undefined) o.until = x.until;
    if (x.day !== undefined) o.day = x.day;
    if (x.at !== undefined) o.at = x.at;
    return o;
  });
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
    req.on("data", c => { size += c.length; if (size > 2_000_000) { const e = new Error("too_large"); e.status = 413; reject(e); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")); } catch (e) { e.status = 400; reject(e); } });
    req.on("error", reject);
  });
}

// Conferência de versão: o aparelho diz em que revisão do documento se baseou (baseRev).
// Se outro aparelho mudou o documento depois disso, responde 409 com a versão atual para o aparelho mesclar.
// Sem baseRev (página antiga aberta em algum aparelho) aceita como antes.
function conflict(res, key, baseRev, current) {
  if (baseRev === undefined) return false;
  const cur = data.docRev[key] || 0;
  if (baseRev === cur) return false;
  send(res, 409, { conflict: true, rev: data.rev, docRev: cur, doc: current() });
  return true;
}
// Registra a mudança: nova revisão global, revisão dos documentos alterados e gravação.
function commit(keys) {
  const prevRev = data.rev;
  persist();
  const docRev = {};
  for (const k of keys) docRev[k] = data.docRev[k] = data.rev;
  return keys.length === 1 ? { rev: data.rev, prevRev, docRev: docRev[keys[0]] } : { rev: data.rev, prevRev, docRev };
}

// Enquanto o disco estiver recusando gravações, não aceita mudanças (para a tela mostrar o erro).
function diskBlocked(res) {
  if (!diskError) return false;
  flushNow();
  if (!diskError) return false;
  send(res, 503, { error: "Não consegui gravar no disco. Feche programas que possam estar usando a pasta dos dados (OneDrive, antivírus) e tente de novo." });
  return true;
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
      const raw = await readBody(req);
      const b = cleanSettings(raw);
      if (!b) return send(res, 400, { error: "Contextos inválidos" });
      if (conflict(res, "settings", raw.baseRev, () => data.settings) || diskBlocked(res)) return;
      const ids = new Set([...b.expense, ...b.income].map(c => c.id));
      if ([...data.settings.expense, ...data.settings.income].some(c => !ids.has(c.id))) safetyBackup("tabela");
      data.settings = b;
      return send(res, 200, commit(["settings"]));
    }
    if (p === "/api/goals" && req.method === "PUT") {
      const raw = await readBody(req);
      const goals = cleanGoals(raw);
      if (!goals) return send(res, 400, { error: "Metas inválidas" });
      if (conflict(res, "goals", raw.baseRev, () => ({ goals: data.goals })) || diskBlocked(res)) return;
      data.goals = goals;
      return send(res, 200, commit(["goals"]));
    }
    if (p === "/api/plans" && req.method === "PUT") {
      const raw = await readBody(req);
      const plans = cleanPlans(raw);
      if (!plans) return send(res, 400, { error: "Compras parceladas inválidas" });
      if (conflict(res, "plans", raw.baseRev, () => ({ plans: data.plans })) || diskBlocked(res)) return;
      data.plans = plans;
      return send(res, 200, commit(["plans"]));
    }
    const m = p.match(/^\/api\/months\/([^/]+)$/);
    if (m && !MONTH_RE.test(m[1])) return send(res, 404, { error: "Mês inválido" });
    if (m && req.method === "PUT") {
      const raw = await readBody(req);
      const b = cleanMonth(raw);
      if (!b) return send(res, 400, { error: "Registros inválidos" });
      const key = "m:" + m[1];
      if (conflict(res, key, raw.baseRev, () => data.months[m[1]] || null) || diskBlocked(res)) return;
      const before = data.months[m[1]];
      if (before && before.entries.length > 0 && b.entries.length === 0) safetyBackup("limpar-mes");
      data.months[m[1]] = b;
      return send(res, 200, commit([key]));
    }
    if (m && req.method === "DELETE") {
      if (!data.months[m[1]]) return send(res, 404, { error: "Mês não encontrado", rev: data.rev, docRev: data.docRev["m:" + m[1]] || 0 });
      if (diskBlocked(res)) return;
      safetyBackup("excluir-mes");
      delete data.months[m[1]];
      return send(res, 200, commit(["m:" + m[1]]));
    }
    // Exclui uma tabela e todos os registros dela, em todos os meses, numa única mudança
    const cx = p.match(/^\/api\/contexts\/(expense|income)\/([^/]{1,40})$/);
    if (cx && req.method === "DELETE") {
      const [, kind, id] = cx;
      if (diskBlocked(res)) return;
      const keys = [];
      const has = data.settings[kind].some(c => c.id === id);
      const touched = Object.keys(data.months).filter(mid => data.months[mid].entries.some(e => e.ctx === id));
      if (has || touched.length) {
        safetyBackup("tabela");
        if (has) { data.settings = { ...data.settings, [kind]: data.settings[kind].filter(c => c.id !== id) }; keys.push("settings"); }
        for (const mid of touched) { data.months[mid] = { ...data.months[mid], entries: data.months[mid].entries.filter(e => e.ctx !== id) }; keys.push("m:" + mid); }
      }
      const out = keys.length ? commit(keys) : { rev: data.rev, prevRev: data.rev, docRev: {} };
      out.docs = {};
      if (has) out.docs.settings = data.settings;
      for (const mid of touched) out.docs["m:" + mid] = data.months[mid];
      return send(res, 200, out);
    }
    // Desligamento pedido pelo app de controle (só aceito do próprio computador)
    if (p === "/api/shutdown" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "";
      if (!/^(::1|127\.|::ffff:127\.)/.test(ip)) return send(res, 403, { error: "Proibido" });
      send(res, 200, { ok: true });
      return setTimeout(() => flushAndExit(0), 50);
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
    if (e.status === 413) return send(res, 413, { error: "Dados grandes demais" });
    if (e.status === 400 || e instanceof SyntaxError || e instanceof URIError) return send(res, 400, { error: "Requisição inválida" });
    logErr("Erro interno:", e);
    if (!res.headersSent) send(res, 500, { error: "Erro interno do servidor" });
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

// Grava o que estiver pendente antes de sair (Ctrl+C, fechar o terminal, desligamento pelo painel).
function flushAndExit(code = 0) {
  try { flushNow(); } catch (e) { logErr("Falha ao gravar antes de sair:", e.message); }
  process.exit(code);
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, () => flushAndExit(0));
process.on("uncaughtException", (e) => { logErr("Erro inesperado:", e); flushAndExit(1); });
process.on("unhandledRejection", (e) => { logErr("Erro inesperado:", e); flushAndExit(1); });
