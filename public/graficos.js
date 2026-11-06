// Página de gráficos do Caderno de Gastos.
// Usa window.caderno (exposto por index.html) e desenha tudo em SVG/HTML, sem bibliotecas,
// para funcionar mesmo sem internet.
(() => {
  const SVGNS = "http://www.w3.org/2000/svg";
  const PREF_KEY = "caderno-graficos";
  const MAX_SERIES = 8; // acima disso, o resto vira "Outros"
  const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  // Preferências guardadas neste aparelho; valores desconhecidos voltam ao padrão.
  const ALLOWED = { period: ["month", "semester", "year"], data: ["expense", "income", "all"], comp: ["donut", "bars", "columns"], evo: ["stacked", "lines"] };
  const cs = { period: "month", key: null, data: "expense", comp: "donut", evo: "stacked" };
  (() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) {}
    for (const [k, list] of Object.entries(ALLOWED)) if (list.includes(saved[k])) cs[k] = saved[k];
  })();
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ period: cs.period, data: cs.data, comp: cs.comp, evo: cs.evo })); } catch (e) {} };

  let api = null;
  const $ = (id) => document.getElementById(id);

  function el(tag, attrs = {}, ...kids) { return api.el(tag, attrs, ...kids); }
  function svg(tag, attrs = {}, ...kids) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
    kids.flat().forEach(k => k != null && k !== false && e.append(k));
    return e;
  }

  // ---------- Períodos ----------
  const ym = (id) => id.split("-").map(Number);
  const shortMonth = (id) => { const [y, m] = ym(id); return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`; };
  function periodOf(monthId, period) {
    const [y, m] = ym(monthId);
    if (period === "year") return String(y);
    if (period === "semester") return `${y}-S${m <= 6 ? 1 : 2}`;
    return monthId;
  }
  function periodLabel(key, period) {
    if (period === "year") return `Ano de ${key}`;
    if (period === "semester") { const [y, s] = key.split("-S"); return `${s}º semestre de ${y}`; }
    return api.monthLabel(key);
  }
  function monthsIn(key, period) {
    return api.monthIds().filter(id => periodOf(id, period) === key);
  }
  function prevKey(key, period) {
    if (period === "year") return String(Number(key) - 1);
    if (period === "semester") { const [y, s] = key.split("-S").map(Number); return s === 2 ? `${y}-S1` : `${y - 1}-S2`; }
    let [y, m] = ym(key); m--; if (m < 1) { m = 12; y--; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  function periodOptions(period) {
    return [...new Set(api.monthIds().map(id => periodOf(id, period)))].sort().reverse();
  }

  // ---------- Agregação ----------
  const ORPHAN = "_semtabela";
  function entriesOf(months) { return months.flatMap(id => api.state.months[id] ? api.state.months[id].entries : []); }
  // Soma por tabela, em centavos; registros de tabelas que não existem mais viram uma única "Sem tabela".
  function sumBy(months, kind) {
    const known = new Set(api.ctxs(kind).map(c => c.id));
    const map = new Map();
    entriesOf(months).forEach(e => {
      if (e.kind !== kind) return;
      const id = known.has(e.ctx) ? e.ctx : ORPHAN;
      map.set(id, (map.get(id) || 0) + Math.round(e.value * 100));
    });
    for (const [k, c] of map) map.set(k, c / 100);
    return map;
  }
  const total = (months, kind) => api.sumMoney(entriesOf(months).filter(e => e.kind === kind).map(e => e.value));
  function ctxName(id) { if (id === ORPHAN) return "Sem tabela"; const c = api.findCtx(id)[1]; return c ? c.name : "Sem tabela"; }
  function ctxColor(kind, id) { const c = id === ORPHAN ? null : api.findCtx(id)[1]; return c ? api.colorOf(kind, c) : "var(--faint)"; }

  // Itens de composição na ordem de valor; o que passar de MAX_SERIES vira "Outros".
  function compItems(months, kind) {
    const map = sumBy(months, kind);
    let items = [...map].filter(([, v]) => v > 0).map(([id, v]) => ({ id, label: ctxName(id), value: v, color: ctxColor(kind, id) }))
      .sort((a, b) => b.value - a.value);
    if (items.length > MAX_SERIES) {
      const rest = items.slice(MAX_SERIES - 1);
      items = items.slice(0, MAX_SERIES - 1);
      items.push({ id: "_outros", label: `Outros (${rest.length})`, value: api.sumMoney(rest.map(i => i.value)), color: "var(--muted)" });
    }
    return items;
  }

  // ---------- Formatação ----------
  const pct = (v, base) => base > 0 ? v / base * 100 : 0;
  const fmtPct = (p, d = 0) => `${p.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d })}%`;
  function fmtCompact(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
    if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
    return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;   // mostra centavos em eixos pequenos (0,75 · 1,5)
  }
  function niceMax(v) {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  function delta(cur, prev) {
    if (!(prev > 0)) return null;
    return (cur - prev) / prev * 100;
  }

  // ---------- Tooltip ----------
  let tip = null;
  function ensureTip() {
    if (tip) return tip;
    tip = el("div", { class: "ctip", role: "tooltip", hidden: true });
    document.body.append(tip);
    return tip;
  }
  function bindTips(root) {
    const t = ensureTip();
    const show = (target, x, y) => {
      const lines = target.getAttribute("data-tip").split("\n");
      t.replaceChildren(el("strong", {}, lines[0]), ...lines.slice(1).map(l => el("span", {}, l)));
      t.hidden = false;
      const r = t.getBoundingClientRect();
      let left = x + 14, top = y + 14;
      if (left + r.width > innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > innerHeight - 8) top = y - r.height - 14;
      t.style.left = Math.max(8, left) + "px"; t.style.top = Math.max(8, top) + "px";
    };
    root.addEventListener("pointermove", (e) => {
      const target = e.target.closest("[data-tip]");
      if (!target || !root.contains(target)) { t.hidden = true; root.querySelectorAll(".is-hot").forEach(n => n.classList.remove("is-hot")); return; }
      root.querySelectorAll(".is-hot").forEach(n => n !== target && n.classList.remove("is-hot"));
      target.classList.add("is-hot");
      show(target, e.clientX, e.clientY);
    });
    root.addEventListener("pointerleave", () => { t.hidden = true; root.querySelectorAll(".is-hot").forEach(n => n.classList.remove("is-hot")); });
    root.addEventListener("focusin", (e) => {
      const target = e.target.closest("[data-tip]");
      if (target) { const r = target.getBoundingClientRect(); show(target, r.right, r.top); }
    });
    root.addEventListener("focusout", () => { t.hidden = true; });
  }

  // ---------- Gráficos de composição ----------
  function donut(items, centerTop, centerBottom) {
    const S = 240, R = 108, r = 70, cx = S / 2, cy = S / 2;
    const sum = items.reduce((s, i) => s + i.value, 0);
    const g = svg("g");
    const pt = (a, rad) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
    let a0 = 0;
    items.forEach(it => {
      const frac = it.value / sum;
      const tipText = `${it.label}\n${api.fmt(it.value)}\n${fmtPct(frac * 100, 1)} do total`;
      if (frac >= 0.9999) {
        g.append(svg("path", { d: `M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0M${cx - r},${cy}a${r},${r} 0 1,1 ${2 * r},0a${r},${r} 0 1,1 ${-2 * r},0`, "fill-rule": "evenodd", fill: it.color, class: "mark", "data-tip": tipText, tabindex: "0" }));
        return;
      }
      const a1 = a0 + frac * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
      const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [x2, y2] = pt(a1, r), [x3, y3] = pt(a0, r);
      g.append(svg("path", {
        d: `M${x0},${y0}A${R},${R} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r},${r} 0 ${large} 0 ${x3},${y3}Z`,
        fill: it.color, class: "mark arc", "data-tip": tipText, tabindex: "0",
      }));
      a0 = a1;
    });
    return svg("svg", { viewBox: `0 0 ${S} ${S}`, class: "donut", role: "img", "aria-label": `Gráfico de rosca: ${items.map(i => `${i.label} ${fmtPct(pct(i.value, sum))}`).join(", ")}` },
      g,
      svg("text", { x: cx, y: cy - 4, class: "donut-top", "text-anchor": "middle" }, centerTop),
      svg("text", { x: cx, y: cy + 18, class: "donut-bottom", "text-anchor": "middle" }, centerBottom));
  }

  function legendList(items, base) {
    return el("ul", { class: "clegend" }, ...items.map(it =>
      el("li", { "data-tip": `${it.label}\n${api.fmt(it.value)}\n${fmtPct(pct(it.value, base), 1)} do total`, tabindex: "0" },
        el("i", { style: `background:${it.color}` }, ""),
        el("span", { class: "nm" }, it.label),
        el("span", { class: "pc num" }, fmtPct(pct(it.value, base))),
        el("span", { class: "vl num" }, api.fmtPlain(it.value)))));
  }

  function hbars(items, base) {
    const max = Math.max(...items.map(i => i.value));
    return el("div", { class: "hbars", role: "list" }, ...items.map(it =>
      el("div", { class: "hbar", role: "listitem", "data-tip": `${it.label}\n${api.fmt(it.value)}\n${fmtPct(pct(it.value, base), 1)} do total`, tabindex: "0" },
        el("span", { class: "nm" }, it.label),
        el("span", { class: "track" }, el("i", { class: "mark", style: `width:${Math.max(it.value / max * 100, 1.5)}%;background:${it.color}` })),
        el("span", { class: "vl num" }, `${fmtPct(pct(it.value, base))}`, el("small", {}, api.fmtPlain(it.value))))));
  }

  // Colunas verticais com topo arredondado de 4px e base reta na linha zero.
  function colPath(x, y, w, h) {
    const rr = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  }
  function axis(g, W, H, padL, padT, max) {
    for (let i = 0; i <= 4; i++) {
      const v = max / 4 * i, y = padT + H - H * i / 4;
      g.append(svg("line", { x1: padL, x2: W, y1: y, y2: y, class: i === 0 ? "baseline" : "grid" }));
      g.append(svg("text", { x: padL - 8, y: y + 4, "text-anchor": "end", class: "tick" }, fmtCompact(v)));
    }
  }
  function columns(items, base) {
    const n = items.length, band = 76, padL = 64, padT = 22, H = 200, padB = 34;
    const W = Math.max(padL + n * band + 8, 360);
    const max = niceMax(Math.max(...items.map(i => i.value)));
    const g = svg("g");
    axis(g, W, H, padL, padT, max);
    items.forEach((it, i) => {
      const w = Math.min(44, band * 0.62), x = padL + i * band + (band - w) / 2;
      const h = Math.max(it.value / max * H, 1.5), y = padT + H - h;
      g.append(svg("path", { d: colPath(x, y, w, h), fill: it.color, class: "mark", "data-tip": `${it.label}\n${api.fmt(it.value)}\n${fmtPct(pct(it.value, base), 1)} do total`, tabindex: "0" }));
      g.append(svg("text", { x: x + w / 2, y: y - 6, "text-anchor": "middle", class: "vlabel" }, fmtPct(pct(it.value, base))));
      const name = it.label.length > 11 ? it.label.slice(0, 10) + "…" : it.label;
      g.append(svg("text", { x: x + w / 2, y: padT + H + 20, "text-anchor": "middle", class: "xlabel" }, name));
    });
    return el("div", { class: "scrollx" }, svg("svg", { viewBox: `0 0 ${W} ${padT + H + padB}`, width: W, class: "cols", role: "img", "aria-label": `Gráfico de colunas: ${items.map(i => `${i.label} ${api.fmt(i.value)}`).join(", ")}` }, g));
  }

  // ---------- Evolução no tempo ----------
  function evoSeries(months, mode) {
    if (mode === "all") {
      return [
        { id: "in", label: "Entradas", color: "var(--earn)", values: months.map(m => total([m], "income")) },
        { id: "out", label: "Gastos", color: "var(--spend)", values: months.map(m => total([m], "expense")) },
      ];
    }
    const items = compItems(months, mode);
    const keep = new Set(items.filter(i => i.id !== "_outros").map(i => i.id));
    return items.map(it => ({
      id: it.id, label: it.label, color: it.color,
      values: months.map(m => {
        const map = sumBy([m], mode);
        if (it.id !== "_outros") return map.get(it.id) || 0;
        return [...map].filter(([id]) => !keep.has(id)).reduce((s, [, v]) => s + v, 0);
      }),
    }));
  }

  function evolution(months, series, type, mode) {
    const n = months.length, band = Math.max(64, Math.min(110, 640 / Math.max(n, 1))), padL = 64, padT = 16, H = 220, padB = 30;
    const W = Math.max(padL + n * band + 8, 360);
    const grouped = mode === "all" && type === "stacked";
    const totals = months.map((_, i) => series.reduce((s, se) => s + se.values[i], 0));
    const peak = type === "lines" || grouped ? Math.max(...series.flatMap(s => s.values)) : Math.max(...totals);
    const max = niceMax(peak);
    const g = svg("g");
    axis(g, W, H, padL, padT, max);
    const yOf = (v) => padT + H - v / max * H;
    const tipFor = (i) => {
      const lines = [api.monthLabel(months[i]), ...series.map(s => `${s.label}: ${api.fmt(s.values[i])}`)];
      const val = (id) => { const s = series.find(x => x.id === id); return s ? s.values[i] : 0; };   // a série pode ter sido filtrada
      if (mode === "all") lines.push(`Saldo: ${api.fmt(api.sumMoney([val("in"), -val("out")]))}`);
      else lines.push(`Total: ${api.fmt(totals[i])}`);
      return lines.join("\n");
    };

    months.forEach((m, i) => {
      const x0 = padL + i * band;
      g.append(svg("text", { x: x0 + band / 2, y: padT + H + 20, "text-anchor": "middle", class: "xlabel" }, shortMonth(m)));
      if (type === "lines") return;
      if (grouped) {
        const w = Math.min(26, band * 0.3), gap = 2, start = x0 + (band - (2 * w + gap)) / 2;
        series.forEach((s, k) => {
          const v = s.values[i], h = Math.max(v / max * H, v > 0 ? 1.5 : 0);
          if (h > 0) g.append(svg("path", { d: colPath(start + k * (w + gap), padT + H - h, w, h), fill: s.color, class: "mark" }));
        });
      } else {
        const w = Math.min(44, band * 0.56), x = x0 + (band - w) / 2;
        let acc = 0;
        const segs = series.map(s => ({ s, v: s.values[i] })).filter(o => o.v > 0);
        segs.forEach((o, k) => {
          const y1 = yOf(acc), y2 = yOf(acc + o.v); acc += o.v;
          const h = y1 - y2;
          const d = k === segs.length - 1 ? colPath(x, y2, w, h) : `M${x},${y1}V${y2}H${x + w}V${y1}Z`;
          g.append(svg("path", { d, fill: o.s.color, class: "mark seg" }));
        });
        if (totals[i] > 0) g.append(svg("text", { x: x + w / 2, y: yOf(totals[i]) - 6, "text-anchor": "middle", class: "vlabel" }, fmtCompact(totals[i])));
      }
    });

    if (type === "lines") {
      series.forEach(s => {
        const pts = s.values.map((v, i) => [padL + i * band + band / 2, yOf(v)]);
        g.append(svg("polyline", { points: pts.map(p => p.join(",")).join(" "), class: "line", stroke: s.color }));
        pts.forEach(([x, y]) => g.append(svg("circle", { cx: x, cy: y, r: 4.5, class: "dot", fill: s.color })));
      });
    }
    // camada de hover por mês (alvo maior que a marca)
    months.forEach((m, i) => {
      g.append(svg("rect", { x: padL + i * band, y: padT, width: band, height: H, class: "hit", "data-tip": tipFor(i), tabindex: "0" }));
    });
    return el("div", { class: "scrollx" }, svg("svg", { viewBox: `0 0 ${W} ${padT + H + padB}`, width: W, class: "evo", role: "img", "aria-label": `Evolução de ${shortMonth(months[0])} a ${shortMonth(months[n - 1])}` }, g));
  }

  // ---------- Análises ----------
  function insights(ctx) {
    const { months, avgMonths, prevMonths, mode, period, tin, tout, ptin, ptout, compOut, compIn, partial, skipped } = ctx;
    const out = [];
    const add = (tone, icon, html) => out.push({ tone, icon, html });
    const b = (t) => `<b>${escapeHtml(t)}</b>`;
    const plabel = { month: "mês", semester: "semestre", year: "ano" }[period];
    const prevLabel = { month: "ao mês anterior", semester: "ao semestre anterior", year: "ao ano anterior" }[period];
    // Em semestre/ano, compara médias mensais (os períodos podem ter quantidades diferentes de meses),
    // sem contar o mês em andamento, que ainda está incompleto.
    const byMonth = period !== "month";
    const nC = byMonth ? Math.max(avgMonths.length, 1) : 1, nP = byMonth ? Math.max(prevMonths.length, 1) : 1;
    const aout = byMonth ? total(avgMonths, "expense") / nC : tout, ain = byMonth ? total(avgMonths, "income") / nC : tin;
    const avgTxt = byMonth ? "A média mensal de gastos" : "Os gastos";
    const skipTxt = skipped ? " (sem contar o mês em andamento)" : "";
    if (partial) add("info", "⏳", `${b("Mês em andamento")}: os valores ainda vão mudar, e as comparações com o mês anterior são parciais.`);

    if (mode !== "income" && tout > 0) {
      if (tin > 0) {
        const p = pct(tout, tin);
        const tone = p > 100 ? "bad" : p > 90 ? "warn" : "good";
        add(tone, p > 100 ? "!" : p > 90 ? "!" : "✓", `Os gastos consumiram ${b(fmtPct(p))} das entradas do ${plabel}${p > 100 ? `, ${b(api.fmt(tout - tin))} além do que entrou` : ""}.`);
      }
      const top = compOut[0];
      if (top) add("info", "★", `${b(top.label)} é o maior tipo de gasto: ${b(api.fmt(top.value))}, ou ${b(fmtPct(pct(top.value, tout)))} das saídas.`);
      if (compOut.length >= 4) {
        const t3 = compOut.slice(0, 3).reduce((s, i) => s + i.value, 0);
        add("info", "≡", `As 3 maiores tabelas (${compOut.slice(0, 3).map(i => escapeHtml(i.label)).join(", ")}) somam ${b(fmtPct(pct(t3, tout)))} dos gastos.`);
      }
      const d = prevMonths.length ? delta(aout, ptout / nP) : null;
      if (d != null && Math.abs(d) < 0.5) add("info", "=", `${avgTxt} ${byMonth ? "ficou estável" : "ficaram estáveis"} em relação ${prevLabel}${skipTxt}.`);
      else if (d != null) add(d > 5 ? "warn" : d < -5 ? "good" : "info", d > 0 ? "↑" : "↓", `${avgTxt} ${d >= 0 ? (byMonth ? "subiu" : "subiram") : (byMonth ? "caiu" : "caíram")} ${b(fmtPct(Math.abs(d)))} em relação ${prevLabel}${partial ? " até agora" : ""} (${api.fmt(ptout / nP)} → ${api.fmt(aout)}${byMonth ? " por mês" : ""})${skipTxt}.`);
      if (prevMonths.length) {
        const cur = sumBy(byMonth ? avgMonths : months, "expense"), prev = sumBy(prevMonths, "expense");
        const changes = [...new Set([...cur.keys(), ...prev.keys()])].map(id => ({ id, d: (cur.get(id) || 0) / nC - (prev.get(id) || 0) / nP })).filter(c => Math.abs(c.d) >= 0.01);
        changes.sort((a, b2) => b2.d - a.d);
        const up = changes[0], down = changes[changes.length - 1];
        const per = byMonth ? " por mês" : "";
        if (up && up.d > 0) add("warn", "↑", `${b(ctxName(up.id))} foi o que mais cresceu: ${b("+" + api.fmt(up.d))}${per} em relação ${prevLabel}.`);
        if (down && down.d < 0) add("good", "↓", `${b(ctxName(down.id))} foi o que mais caiu: ${b(api.fmt(down.d))}${per}.`);
      }
      const biggest = entriesOf(months).filter(e => e.kind === "expense").sort((a, b2) => b2.value - a.value)[0];
      if (biggest) add("info", "◆", `Maior gasto individual: ${b(biggest.name)} (${escapeHtml(ctxName(biggest.ctx))}), ${b(api.fmt(biggest.value))}.`);
    }

    if (mode !== "expense" && tin > 0) {
      const top = compIn[0];
      if (top) {
        const p = pct(top.value, tin);
        add(p >= 85 && compIn.length > 1 ? "warn" : "info", "★", `${b(top.label)} é a principal entrada: ${b(fmtPct(p))} de tudo que entrou${p >= 85 ? ", quase toda a renda depende dela" : ""}.`);
      }
      const d = prevMonths.length ? delta(ain, ptin / nP) : null;
      if (d != null && Math.abs(d) < 0.5) add("info", "=", `${byMonth ? "A média mensal de entradas ficou estável" : "As entradas ficaram estáveis"} em relação ${prevLabel}.`);
      else if (d != null) add(d < -5 ? "warn" : d > 5 ? "good" : "info", d >= 0 ? "↑" : "↓", `${byMonth ? "A média mensal de entradas" : "As entradas"} ${d >= 0 ? (byMonth ? "aumentou" : "aumentaram") : (byMonth ? "diminuiu" : "diminuíram")} ${b(fmtPct(Math.abs(d)))} em relação ${prevLabel}.`);
    }

    if (mode === "all" && tin > 0) {
      const rate = pct(tin - tout, tin);
      const [tone, word] = rate >= 20 ? ["good", "ótima"] : rate >= 10 ? ["good", "boa"] : rate >= 0 ? ["warn", "apertada"] : ["bad", "negativa"];
      add(tone, rate >= 0 ? "✓" : "!", `Sobrou ${b(api.fmt(tin - tout))}: uma taxa de economia ${word} de ${b(fmtPct(rate))}.`);
    }

    if (period !== "month" && avgMonths.length > 1) {
      const per = avgMonths.map(m => ({ m, out: total([m], "expense"), in: total([m], "income") }));
      if (mode !== "income") {
        add("info", "∅", `Média de ${b(api.fmt(aout))} de gastos por mês, em ${avgMonths.length} meses registrados${skipTxt}.`);
        const hi = per.reduce((a, c) => c.out > a.out ? c : a), lo = per.reduce((a, c) => c.out < a.out ? c : a);
        if (hi.out > 0 && hi.m !== lo.m) add("info", "▲", `Mês mais caro: ${b(api.monthLabel(hi.m))} (${api.fmt(hi.out)}). Mais econômico: ${b(api.monthLabel(lo.m))} (${api.fmt(lo.out)}).`);
      }
      if (mode === "all") {
        // gastou mais do que entrou, mesmo que nenhuma entrada tenha sido registrada no mês
        const red = per.filter(p => p.out > p.in).length;
        add(red ? "warn" : "good", red ? "!" : "✓", red ? `${b(String(red))} ${red === 1 ? "mês fechou" : "meses fecharam"} no vermelho neste ${plabel}${skipTxt}.` : `Nenhum mês fechou no vermelho neste ${plabel}${skipTxt}.`);
      }
    }
    if (!out.length) add("info", "i", "Registre entradas e gastos neste período para ver as análises.");
    return out;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- Controles ----------
  function seg(name, value, options, onChange) {
    return el("div", { class: "cseg", role: "group", "aria-label": name },
      ...options.map(([v, label]) => el("button", { type: "button", "aria-pressed": String(v === value), onclick: () => onChange(v) }, label)));
  }
  function update(patch) { Object.assign(cs, patch); savePrefs(); render(); }

  // ---------- Render ----------
  function render() {
    const root = $("charts");
    if (!api || !root) return;
    const ids = api.monthIds();
    if (!ids.length) {
      root.replaceChildren(el("div", { class: "welcome" }, el("h2", {}, "Nada para analisar ainda"), el("p", {}, "Crie um mês e registre entradas e gastos na aba Lançamentos. Os gráficos aparecem aqui.")));
      return;
    }
    const opts = periodOptions(cs.period);
    if (!cs.key || !opts.includes(cs.key)) cs.key = periodOf(api.state.selected || ids[ids.length - 1], cs.period);
    if (!opts.includes(cs.key)) cs.key = opts[0];

    const months = monthsIn(cs.key, cs.period);
    const pKey = prevKey(cs.key, cs.period);
    const prevMonths = monthsIn(pKey, cs.period);
    const mode = cs.data;
    const tin = total(months, "income"), tout = total(months, "expense");
    const ptin = total(prevMonths, "income"), ptout = total(prevMonths, "expense");
    const compOut = compItems(months, "expense"), compIn = compItems(months, "income");
    // Mês em andamento (o mês atual do calendário): ainda incompleto.
    const curId = api.currentMonthId();
    const partial = cs.period === "month" && cs.key === curId;
    const complete = months.filter(m => m !== curId);
    const avgMonths = cs.period !== "month" && complete.length ? complete : months;   // médias só com meses completos
    const skipped = avgMonths.length < months.length;
    // mês mais recente do período visto: ao trocar Mês/Semestre/Ano, o período escolhido continua o mesmo
    const anchor = cs.period === "month" ? cs.key : (months[months.length - 1] || api.state.selected || ids[ids.length - 1]);

    // Filtros acima dos gráficos: o seletor do período exibido sozinho na primeira linha, os botões embaixo
    const keySel = el("select", { id: "cKey", class: "ckey", "aria-label": "Período exibido", onchange: (e) => update({ key: e.target.value }) },
      ...opts.map(k => el("option", { value: k }, periodLabel(k, cs.period))));
    keySel.value = cs.key;
    const filters = el("div", { class: "cfilters" },
      keySel,
      el("div", { class: "crow" },
        el("div", { class: "cfield" }, el("span", { class: "clab" }, "Período"),
          seg("Período", cs.period, [["month", "Mês"], ["semester", "Semestre"], ["year", "Ano"]], (v) => update({ period: v, key: periodOf(anchor, v) }))),
        el("div", { class: "cfield" }, el("span", { class: "clab" }, "Dados"),
          seg("Dados", mode, [["expense", "Gastos"], ["income", "Entradas"], ["all", "Geral"]], (v) => update({ data: v })))));

    // KPIs
    const kpi = (label, value, sub, tone, d, goodWhenUp) => {
      let dEl = null;
      if (d != null) {
        const good = goodWhenUp ? d >= 0 : d <= 0;
        dEl = el("span", { class: `kdelta ${Math.abs(d) < 0.5 ? "flat" : good ? "good" : "bad"}` }, `${d >= 0 ? "▲" : "▼"} ${fmtPct(Math.abs(d))}`);
      }
      return el("div", { class: `kpi ${tone || ""}` }, el("span", { class: "klab" }, label), el("span", { class: "kval num" }, value), el("span", { class: "ksub" }, dEl, sub ? el("span", {}, sub) : null));
    };
    const byMonth = cs.period !== "month";
    const nC = byMonth ? Math.max(avgMonths.length, 1) : 1, nP = byMonth ? Math.max(prevMonths.length, 1) : 1;
    const ain = byMonth ? total(avgMonths, "income") / nC : tin, aout = byMonth ? total(avgMonths, "expense") / nC : tout;
    const vsTxt = prevMonths.length ? `${partial ? "parcial " : ""}${byMonth ? "média/mês " : ""}vs. ${periodLabel(pKey, cs.period).replace(/^Ano de /, "")}` : "sem período anterior";
    const saldo = api.sumMoney([tin, -tout]), psaldo = api.sumMoney([ptin, -ptout]);
    const kpis = el("div", { class: "kpis" },
      kpi("Entradas", api.fmt(tin), vsTxt, "in", prevMonths.length ? delta(ain, ptin / nP) : null, true),
      kpi("Gastos", api.fmt(tout), vsTxt, "out", prevMonths.length ? delta(aout, ptout / nP) : null, false),
      kpi("Saldo", api.fmt(saldo), partial ? "mês em andamento" : prevMonths.length ? `antes: ${api.fmt(psaldo)}` : "", saldo < 0 ? "neg" : ""),
      cs.period === "month"
        ? kpi("Renda gasta", tin > 0 ? fmtPct(pct(tout, tin)) : "–", tin > 0 ? `${fmtPct(Math.max(0, pct(saldo, tin)))} economizado` : "sem entradas", "")
        : kpi("Média mensal de gastos", api.fmt(aout), skipped ? `${avgMonths.length} ${avgMonths.length === 1 ? "mês completo" : "meses completos"}, sem o atual` : `${months.length} ${months.length === 1 ? "mês" : "meses"} com registro`, ""));

    // Composição
    let items, base, compTitle, compSub;
    if (mode === "expense") { items = compOut; base = tout; compTitle = "Tipos de gasto"; compSub = "Porcentagem de cada tabela de saída sobre o total gasto"; }
    else if (mode === "income") { items = compIn; base = tin; compTitle = "Fontes de entrada"; compSub = "Porcentagem de cada tabela de entrada sobre o total recebido"; }
    else {
      items = compOut.slice();
      if (saldo > 0) items.push({ id: "_sobra", label: "Sobra", value: saldo, color: "var(--earn)" });
      base = Math.max(tin, tout); compTitle = "Para onde foi a renda";
      compSub = saldo >= 0 ? "Cada tabela de gasto como parte das entradas, mais o que sobrou" : `Os gastos passaram as entradas em ${api.fmt(-saldo)}; porcentagens sobre o total gasto`;
    }
    const compBody = !items.length || base <= 0
      ? el("p", { class: "cempty" }, mode === "income" ? "Nenhuma entrada neste período." : "Nenhum gasto neste período.")
      : cs.comp === "bars" ? hbars(items, base)
      : cs.comp === "columns" ? el("div", {}, columns(items, base), legendList(items, base))
      : el("div", { class: "donutwrap" }, donut(items, api.fmt(mode === "income" ? tin : mode === "expense" ? tout : tin || tout), mode === "income" ? "recebido" : mode === "expense" || !tin ? "gasto" : "de entradas"), legendList(items, base));
    const compCard = el("section", { class: "ccard comp" },
      el("header", { class: "chead" },
        el("div", {}, el("h3", {}, compTitle), el("p", {}, compSub)),
        seg("Tipo de gráfico", cs.comp, [["donut", "Rosca"], ["bars", "Barras"], ["columns", "Colunas"]], (v) => update({ comp: v }))),
      compBody);

    // Análises
    const ins = insights({ months, avgMonths, prevMonths, mode, period: cs.period, tin, tout, ptin, ptout, compOut, compIn, partial, skipped });
    const insCard = el("section", { class: "ccard ins" },
      el("header", { class: "chead" }, el("div", {}, el("h3", {}, `Análise do ${{ month: "mês", semester: "semestre", year: "ano" }[cs.period]}`), el("p", {}, periodLabel(cs.key, cs.period)))),
      el("ul", { class: "inslist" }, ...ins.map(i => { const li = el("li", { class: `t-${i.tone}` }, el("span", { class: "ico", "aria-hidden": "true" }, i.icon)); const sp = el("span", {}); sp.innerHTML = i.html; li.append(sp); return li; })));

    // Evolução: no mês, mostra os 6 meses até ele; no semestre/ano, os meses do período
    // (meses do calendário: um mês sem registro aparece como zero, sem "encolher" o eixo)
    const evoMonths = cs.period === "month"
      ? [-5, -4, -3, -2, -1, 0].map(n => api.shiftMonth(cs.key, n)).filter(id => id >= ids[0])
      : months;
    const series = evoSeries(evoMonths, mode).filter(s => s.values.some(v => v > 0));
    const evoCard = el("section", { class: "ccard evo-card" },
      el("header", { class: "chead" },
        el("div", {}, el("h3", {}, "Evolução mês a mês"), el("p", {}, cs.period === "month" ? `Últimos ${evoMonths.length} meses até ${api.monthLabel(cs.key)}` : periodLabel(cs.key, cs.period))),
        seg("Tipo de gráfico da evolução", cs.evo, [["stacked", mode === "all" ? "Colunas" : "Empilhado"], ["lines", "Linhas"]], (v) => update({ evo: v }))),
      series.length
        ? el("div", {}, el("ul", { class: "slegend" }, ...series.map(s => el("li", {}, el("i", { style: `background:${s.color}` }), s.label))), evolution(evoMonths, series, cs.evo, mode))
        : el("p", { class: "cempty" }, "Sem valores para mostrar neste intervalo."));

    // Tabela
    const rows = [];
    const addRows = (kind) => {
      const cur = sumBy(months, kind), prev = sumBy(prevMonths, kind), tot = kind === "income" ? tin : tout;
      const avg = byMonth ? sumBy(avgMonths, kind) : cur;   // média só com meses completos
      [...new Set([...cur.keys(), ...prev.keys()])].map(id => ({ id, v: cur.get(id) || 0, a: (avg.get(id) || 0) / nC, p: prev.get(id) || 0 }))
        .sort((a, b2) => b2.v - a.v)
        .forEach(r => {
          const d = delta(r.a, r.p / nP);
          rows.push(el("tr", {},
            el("td", {}, el("span", { class: "tname" }, el("i", { style: `background:${ctxColor(kind, r.id)}` }), ctxName(r.id))),
            mode === "all" ? el("td", {}, kind === "income" ? "Entrada" : "Gasto") : null,
            el("td", { class: "num r" }, api.fmtPlain(r.v)),
            byMonth ? el("td", { class: "num r" }, api.fmtPlain(r.a)) : null,
            el("td", { class: "num r" }, fmtPct(pct(r.v, tot), 1)),
            el("td", { class: "num r muted" }, prevMonths.length ? api.fmtPlain(r.p / nP) : "–"),
            el("td", { class: `num r ${d == null ? "muted" : (kind === "expense" ? d > 0 : d < 0) ? "neg" : "pos"}` }, d == null ? (r.p === 0 && r.v > 0 && prevMonths.length ? "novo" : "–") : `${d >= 0 ? "+" : ""}${fmtPct(d)}`)));
        });
    };
    if (mode !== "income") addRows("expense");
    if (mode !== "expense") addRows("income");
    const tableCard = el("section", { class: "ccard" },
      el("header", { class: "chead" }, el("div", {}, el("h3", {}, "Tabela"), el("p", {}, `Valores por tabela, comparados com ${prevMonths.length ? periodLabel(pKey, cs.period).toLowerCase() : "o período anterior (sem registros)"}`))),
      rows.length ? el("div", { class: "scrollx" }, el("table", { class: "ctable" },
        el("thead", {}, el("tr", {}, el("th", {}, "Tabela"), mode === "all" ? el("th", {}, "Tipo") : null, el("th", { class: "r" }, "Valor (R$)"), byMonth ? el("th", { class: "r" }, skipped ? "Média/mês (completos)" : "Média/mês") : null, el("th", { class: "r" }, "% do tipo"), el("th", { class: "r" }, byMonth ? "Anterior (média/mês)" : "Anterior"), el("th", { class: "r" }, byMonth ? "Variação (média/mês)" : "Variação"))),
        el("tbody", {}, ...rows))) : el("p", { class: "cempty" }, "Sem registros neste período."));

    const empty = !months.length;
    root.replaceChildren(
      el("div", { class: "chartshead" }, el("h2", {}, "Gráficos")),
      filters,
      empty ? el("p", { class: "cempty" }, "Nenhum mês registrado neste período.") : kpis,
      empty ? null : el("div", { class: "cgrid" }, compCard, insCard),
      empty ? null : evoCard,
      empty ? null : tableCard);
    if (!root.dataset.tips) { bindTips(root); root.dataset.tips = "1"; }
    if (tip) tip.hidden = true;
  }

  window.renderCharts = (a) => { api = a; render(); };
})();
