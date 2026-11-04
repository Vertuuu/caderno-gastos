// Página de Metas do Caderno de Gastos.
// Cada meta guarda o valor total e UMA base escolhida pelo usuário:
//   basis "monthly" -> gasto mensal informado, meses calculados (valor ÷ mensal, arredondado para cima)
//   basis "months"  -> meses informados, gasto mensal calculado (valor ÷ meses)
(() => {
  const KCOUNT = 10;
  const MAX_MONTHS = 1200;   // mesmo limite do servidor
  const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  let api = null;
  let edit = null;        // { id, field }
  let colorOpen = null;   // id da meta com paleta aberta
  let draft = { name: "", value: "", monthly: "", months: "" };
  let lastTyped = null;   // "monthly" | "months": qual dos dois o usuário digitou por último
  let formErr = "";
  let focusAdd = false;
  let notice = null;      // { id, text }: aviso mostrado embaixo do "Guardado" de uma meta

  const $ = (id) => document.getElementById(id);
  const el = (...a) => api.el(...a);
  const goals = () => api.state.goals || (api.state.goals = []);
  const round2 = (n) => Math.round(n * 100) / 100;
  const isActive = (g) => g.active !== false; // metas antigas, sem o campo, contam como ativas

  function parseInt0(s) {
    s = String(s || "").trim().replace(/\s*m[eê]s(es)?$/i, "");   // aceita "12", "1 mês", "2 meses"
    if (!/^\d+$/.test(s)) return NaN;
    return Number(s);
  }

  // ---------- Ligação com a tabela "Metas" dos lançamentos ----------
  // Todo registro na tabela de saída "Metas" cujo nome é igual ao da meta (sem diferenciar maiúsculas/acentos)
  // conta como valor guardado para ela, em qualquer mês.
  const norm = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
  const goalsCtx = () => api.ctxs("expense").find(c => norm(c.name) === "metas") || null;
  function ensureGoalsCtx() {
    let c = goalsCtx();
    if (c) return c;
    const used = new Set(api.ctxs("expense").map(x => x.color).filter(Number.isInteger));
    c = { id: api.uid(), name: "Metas", color: [2, 5, 4, 7, 3, 6, 8, 1, 9, 0].find(i => !used.has(i)) ?? 2, repeat: false };
    api.state.settings.expense = [...api.ctxs("expense"), c];
    api.store.saveSettings();
    return c;
  }
  function contributions(g) {
    const c = goalsCtx();
    if (!c) return [];
    const key = norm(g.name), out = [];
    for (const [mid, m] of Object.entries(api.state.months)) {
      for (const e of m.entries) if (e.kind === "expense" && e.ctx === c.id && norm(e.name) === key) out.push({ month: mid, entry: e });
    }
    return out;
  }
  const fromEntries = (g) => round2(contributions(g).reduce((s, x) => s + x.entry.value, 0));
  // Mês que recebe a parcela: o mês atual do calendário; se ele não existir, é criado.
  function targetMonth() {
    const id = api.currentMonthId();
    if (!api.state.months[id]) { api.state.months[id] = { entries: [] }; }
    return id;
  }

  function addParcela(g) {
    const d = derive(g);
    const c = ensureGoalsCtx();
    const mid = targetMonth();
    const entry = { id: api.uid(), kind: "expense", ctx: c.id, name: g.name, value: round2(d.monthly), at: Date.now() };
    api.state.months[mid].entries.push(entry);
    api.store.saveMonth(mid);
    render();
    api.setUndo(() => {
      const list = api.state.months[mid] && api.state.months[mid].entries;
      const i = list ? list.findIndex(x => x.id === entry.id) : -1;   // por id: a sincronização troca os objetos
      if (i >= 0) { list.splice(i, 1); api.store.saveMonth(mid); render(); }
    }, `Parcela de ${api.fmt(entry.value)} lançada em ${c.name} · ${api.monthLabel(mid)}`);
  }

  // Os dois campos são recalculados a partir do que FALTA juntar, a cada parcela ou registro novo:
  //   base "months":  o prazo total é fixo (g.months). Cada mês que já recebeu algum registro conta como
  //                   um mês usado; o gasto mensal = falta ÷ meses restantes. Duas parcelas no mesmo mês
  //                   não gastam dois meses, então o mensal dos próximos meses diminui.
  //   base "monthly": o gasto mensal é fixo (g.monthly); meses restantes = falta ÷ mensal, arredondado para cima.
  function derive(g) {
    const contrib = contributions(g);
    const linked = round2(contrib.reduce((s, x) => s + x.entry.value, 0));
    const manual = g.saved || 0;
    const saved = round2(manual + linked);
    const remaining = round2(Math.max(g.value - saved, 0));
    const paidMonths = new Set(contrib.map(x => x.month)).size;
    let monthly, months, totalMonths;
    if (g.basis === "months") {
      totalMonths = g.months;
      months = remaining <= 0 ? 0 : Math.max(g.months - paidMonths, 1);
      monthly = remaining <= 0 ? 0 : remaining / months;
    } else {
      monthly = g.monthly;
      totalMonths = Math.ceil(g.value / g.monthly - 1e-9);
      months = remaining <= 0 ? 0 : Math.ceil(remaining / g.monthly - 1e-9);
    }
    const left = months;
    // Previsão = mês da última parcela. Se a parcela deste mês ainda não foi lançada, este mês já conta.
    // (Date com dia 1: somar meses a 31/out não pula para dezembro.)
    const paidNow = contrib.some(x => x.month === api.currentMonthId());
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + Math.max(left - (paidNow ? 0 : 1), 0), 1);
    // Excedente: com gasto mensal fixo, a última parcela passa do que falta (ex.: 800 com 250/mês = 4 × 250 = 1000, sobram 200)
    const surplus = g.basis === "monthly" && remaining > 0 ? round2(months * g.monthly - remaining) : 0;
    const n = (k) => `${k} ${k === 1 ? "mês" : "meses"}`;
    return {
      monthly, months, totalMonths, paidMonths, saved, linked, manual, remaining, left, surplus,
      over: round2(Math.max(saved - g.value, 0)),
      pct: Math.min(saved / g.value * 100, 100),
      done: saved >= g.value - 0.005,
      eta: left === 0 ? "Atingida" : `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      formula: remaining <= 0 ? "Meta atingida"
        : g.basis === "months"
        ? `Faltam ${api.fmt(remaining)} ÷ ${n(months)} restantes = ${api.fmt(monthly)} por mês` +
          `\nPrazo de ${n(g.months)}${paidMonths ? `, ${paidMonths} já com registro` : ""}`
        : `Faltam ${api.fmt(remaining)} ÷ ${api.fmt(g.monthly)} = ${(remaining / g.monthly).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} → ${n(months)}` +
          (surplus > 0 ? `\n${months} × ${api.fmt(g.monthly)} = ${api.fmt(months * g.monthly)}: sobram ${api.fmt(surplus)}` : ""),
    };
  }

  function save() { api.store.saveGoals(); render(); }

  // ---------- Formulário de nova meta ----------
  function previewDraft() {
    const value = api.parseMoney(draft.value);
    const monthly = api.parseMoney(draft.monthly), months = parseInt0(draft.months);
    if (!(value > 0)) return "";
    const useMonths = lastTyped === "months" ? months > 0 : !(monthly > 0) && months > 0;
    if (useMonths) return `→ ${api.fmt(value / months)} por mês durante ${months} ${months === 1 ? "mês" : "meses"}`;
    if (monthly > 0) {
      const m = Math.ceil(value / monthly - 1e-9), extra = round2(m * monthly - value);
      return `→ ${m} ${m === 1 ? "mês" : "meses"} guardando ${api.fmt(monthly)} por mês${extra > 0 ? `, e sobrarão ${api.fmt(extra)}` : ""}`;
    }
    return "Preencha o gasto mensal ou os meses; o outro é calculado.";
  }

  function addGoal() {
    const name = draft.name.trim();
    const value = api.parseMoney(draft.value);
    const monthly = api.parseMoney(draft.monthly), months = parseInt0(draft.months);
    const hasMonthly = draft.monthly.trim() !== "", hasMonths = draft.months.trim() !== "";
    formErr = "";
    if (!name) formErr = "Dê um nome para a meta, por exemplo PS5.";
    else if (goals().some(g => norm(g.name) === norm(name))) formErr = `Já existe uma meta "${name}". Use outro nome: os registros da tabela Metas são ligados pelo nome.`;
    else if (!(value > 0)) formErr = "Informe o valor da meta, por exemplo 5.000,00.";
    else if (!hasMonthly && !hasMonths) formErr = "Preencha o gasto mensal ou os meses para atingir.";
    else if (hasMonths && !(months > 0 && months <= MAX_MONTHS) && (!hasMonthly || lastTyped === "months")) formErr = `Meses para atingir deve ser um número inteiro de 1 a ${MAX_MONTHS}, como 12.`;
    else if (hasMonthly && !(monthly > 0) && (!hasMonths || lastTyped !== "months")) formErr = "Gasto mensal inválido. Use por exemplo 200,00.";
    if (formErr) { render(); return; }
    const useMonths = hasMonths && months > 0 && months <= MAX_MONTHS && (!hasMonthly || lastTyped === "months" || !(monthly > 0));
    const used = new Set(goals().map(g => g.color));
    const color = [...Array(KCOUNT).keys()].find(i => !used.has(i)) ?? goals().length % KCOUNT;
    goals().push({
      id: api.uid(), name, value: round2(value),
      basis: useMonths ? "months" : "monthly",
      ...(useMonths ? { months } : { monthly: round2(monthly) }),
      saved: 0, color, at: Date.now(),
    });
    draft = { name: "", value: "", monthly: "", months: "" }; lastTyped = null; focusAdd = true;
    save();
  }

  // ---------- Edição na célula ----------
  function commitEdit(g, field, raw) {
    g = goals().find(x => x.id === g.id);   // versão atual (a sincronização pode ter trocado o objeto)
    if (!g) { edit = null; return render(); }
    if (field === "name") {
      const v = raw.trim().replace(/\s+/g, " ");
      if (v && norm(v) !== norm(g.name) && !goals().some(x => x !== g && norm(x.name) === norm(v))) {
        // renomeia junto os registros ligados, para a meta não perder o que já foi guardado
        const touched = new Set();
        contributions(g).forEach(({ month, entry }) => { entry.name = v; touched.add(month); });
        touched.forEach(m => api.store.saveMonth(m));
        g.name = v;
      } else if (v && norm(v) === norm(g.name)) g.name = v;
    }
    else if (field === "value") { const v = api.parseMoney(raw); if (v > 0) g.value = round2(v); }
    else if (field === "monthly") { const v = api.parseMoney(raw); if (v > 0) { g.basis = "monthly"; g.monthly = round2(v); delete g.months; } }
    // o usuário digita os meses que AINDA faltam; o prazo total soma os meses que já tiveram registro
    else if (field === "months") { const v = parseInt0(raw), used = derive(g).paidMonths; if (v > 0 && v + used <= MAX_MONTHS) { g.basis = "months"; g.months = v + used; delete g.monthly; } }
    // "Guardado" = valor informado à mão + registros da tabela Metas; editar ajusta só a parte manual
    else if (field === "saved") {
      const v = raw.trim() === "" ? 0 : api.parseMoney(raw), linked = fromEntries(g);
      if (v >= 0 && v < linked - 0.005) notice = { id: g.id, text: `Mínimo ${api.fmt(linked)}: é o que já está na tabela Metas.` };
      else if (v >= 0) g.saved = round2(v - linked);
    }
    edit = null;
    save();
  }

  function cell(g, field, display, opts = {}) {
    if (edit && edit.id === g.id && edit.field === field) {
      const start = field === "name" ? g.name
        : field === "months" ? String(derive(g).months)
        : api.fmtPlain(field === "monthly" ? round2(derive(g).monthly) : g[field] || 0);
      const inp = el("input", { class: `gin ${field === "name" ? "" : "num r"}`, value: start, inputmode: field === "name" ? null : field === "months" ? "numeric" : "decimal", "aria-label": opts.label });
      let done = false;
      const finish = (ok) => { if (done) return; done = true; if (ok) commitEdit(g, field, inp.value); else { edit = null; render(); } };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } if (e.key === "Escape") finish(false); });
      inp.addEventListener("blur", () => finish(true));
      requestAnimationFrame(() => { inp.focus(); inp.select(); });
      return el("td", { class: opts.cls }, inp);
    }
    return el("td", { class: opts.cls },
      el("button", { class: `gcell ${opts.calc ? "calc" : ""}`, title: opts.title || "Clique para editar", onclick: () => { edit = { id: g.id, field }; colorOpen = null; notice = null; render(); } },
        display, opts.calc ? el("span", { class: "calctag" }, "calculado") : null));
  }

  function row(g) {
    const d = derive(g);
    const k = `var(--k${g.color % KCOUNT})`;
    const swatchCell = colorOpen === g.id
      ? el("div", { class: "gswatches", role: "group", "aria-label": `Cor de ${g.name}` }, ...Array.from({ length: KCOUNT }, (_, i) =>
          el("button", { class: "swatch", style: `--s: var(--k${i})`, "aria-label": `Cor ${i + 1}`, "aria-pressed": String(i === g.color), onclick: () => { g.color = i; colorOpen = null; save(); } })))
      : el("button", { class: "gdot", style: `background:${k}`, title: "Trocar cor", "aria-label": `Trocar cor de ${g.name}`, onclick: () => { colorOpen = g.id; edit = null; render(); } });
    const on = isActive(g);
    return el("tr", { class: `grow ${d.done ? "done" : ""} ${on ? "" : "inactive"}`, style: `--k:${k}` },
      el("td", { class: "gcheck" }, el("label", { class: "gtoggle", title: on ? "Ativa: entra no resumo do topo. Clique para desativar." : "Inativa: fora do resumo do topo. Clique para ativar." },
        el("input", { type: "checkbox", checked: on ? "" : null, "aria-label": `Meta ${g.name} ativa`, onchange: (e) => { g.active = e.target.checked; save(); } }))),
      el("td", { class: "gcolor" }, swatchCell),
      cell(g, "name", el("span", { class: "gname" }, g.name, d.done ? el("span", { class: "gdone" }, "✓ atingida") : null), { label: "Nome" }),
      cell(g, "value", api.fmtPlain(g.value), { cls: "num r", label: "Valor" }),
      cell(g, "monthly", d.done ? "–" : api.fmtPlain(round2(d.monthly)), { cls: "num r", calc: g.basis === "months", title: g.basis === "months" ? `${d.formula}\nClique para definir o gasto mensal você mesmo` : "Clique para editar", label: "Gasto mensal" }),
      cell(g, "months", el("span", { class: "gstack" }, d.done ? "–" : `${d.months} ${d.months === 1 ? "mês" : "meses"}`,
        !d.done && d.months !== d.totalMonths ? el("small", { class: "glinked" }, `restantes de ${d.totalMonths}`) : null,
        d.surplus > 0 ? el("small", { class: "gsurplus" }, `sobram ${api.fmt(d.surplus)}`) : null), { cls: "num r", calc: g.basis === "monthly", title: g.basis === "monthly" ? `${d.formula}\nClique para definir os meses você mesmo` : "Clique para editar", label: "Meses para atingir" }),
      cell(g, "saved", el("span", { class: "gstack" }, api.fmtPlain(d.saved),
        d.over > 0 ? el("small", { class: "gsurplus" }, `${api.fmt(d.over)} de excedente`) : null,
        d.linked > 0 ? el("small", { class: "glinked" }, `${contributions(g).length} na tabela Metas`) : null,
        notice && notice.id === g.id ? el("small", { class: "gsurplus", role: "alert" }, notice.text) : null), {
        cls: "num r", label: "Guardado",
        title: `${api.fmt(d.linked)} em registros da tabela Metas (nome "${g.name}")` + (d.manual > 0 ? `\n+ ${api.fmt(d.manual)} informado à mão` : "") + "\nClique para ajustar o valor informado à mão",
      }),
      el("td", { class: "gprog" }, el("div", { class: "gp" },
        el("div", { class: "pbar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(d.pct)), "aria-label": `Progresso de ${g.name}`, title: `Faltam ${api.fmt(d.remaining)}` },
          el("i", { style: `width:${d.pct}%` })),
        el("span", { class: "pnum num" }, `${d.pct.toLocaleString("pt-BR", { maximumFractionDigits: d.pct < 10 && d.pct > 0 ? 1 : 0 })}%`))),
      el("td", { class: "geta num", title: d.left ? `Faltam ${d.left} ${d.left === 1 ? "mês" : "meses"} no ritmo atual` : "" }, d.eta),
      el("td", { class: "gact" },
        el("button", { class: "gbtn", title: `Lança ${api.fmt(round2(d.monthly))} como "${g.name}" na tabela Metas do mês atual`, disabled: d.done, onclick: () => addParcela(g) }, "+ parcela"),
        el("button", { class: "iconbtn gdel", title: "Excluir meta", "aria-label": `Excluir meta ${g.name}`, onclick: () => removeGoal(g) }, "×")));
  }

  async function removeGoal(g) {
    const d = derive(g);
    const ok = await api.confirmDialog({
      title: `Excluir a meta "${g.name}"?`,
      text: d.linked > 0
        ? `A meta sai desta lista. ${contributions(g).length === 1 ? "O registro dela na tabela Metas" : `Os ${contributions(g).length} registros dela na tabela Metas`} (${api.fmt(d.linked)}) ${contributions(g).length === 1 ? "continua" : "continuam"} nos lançamentos.`
        : "A meta sai desta lista.",
      details: [["Valor", api.fmt(g.value)], ["Guardado", api.fmt(d.saved)], ["Progresso", `${Math.round(d.pct)}%`]],
      ok: "Excluir meta",
    });
    if (!ok) return;
    const list = goals(), idx = list.findIndex(x => x.id === g.id);
    if (idx < 0) return;
    g = list[idx];
    list.splice(idx, 1);
    save();
    api.setUndo(() => {
      if (goals().some(x => x.id === g.id)) return;
      goals().splice(Math.min(idx, goals().length), 0, g); save();
    }, `Meta "${g.name}" excluída`);
  }

  // ---------- Render ----------
  function render() {
    const root = $("goals");
    if (!api || !root) return;
    const list = goals();
    // o resumo do topo considera só as metas marcadas como ativas
    const counted = list.filter(isActive);
    const inactiveCount = list.length - counted.length;
    const ds = counted.map(derive);
    const totalValue = counted.reduce((s, g) => s + g.value, 0);
    const totalSaved = ds.reduce((s, d) => s + d.saved, 0);
    const totalOver = ds.reduce((s, d) => s + d.over, 0);
    const active = counted.filter((g, i) => !ds[i].done);
    const monthlyCommit = active.reduce((s, g) => s + derive(g).monthly, 0);
    const doneCount = ds.filter(d => d.done).length;
    const inactiveTxt = inactiveCount ? ` · ${inactiveCount} inativa${inactiveCount > 1 ? "s" : ""} fora da conta` : "";

    const summary = el("div", { class: "kpis" },
      el("div", { class: "kpi" }, el("span", { class: "klab" }, "Total das metas"), el("span", { class: "kval num" }, api.fmt(totalValue)), el("span", { class: "ksub" }, `${counted.length} ${counted.length === 1 ? "meta ativa" : "metas ativas"}${doneCount ? `, ${doneCount} atingida${doneCount > 1 ? "s" : ""}` : ""}${inactiveTxt}`)),
      el("div", { class: "kpi in" }, el("span", { class: "klab" }, "Já guardado"), el("span", { class: "kval num" }, api.fmt(totalSaved)), el("span", { class: "ksub" }, totalValue ? `${Math.round((totalSaved - totalOver) / totalValue * 100)}% do total${totalOver > 0 ? ` + ${api.fmt(totalOver)} de excedente` : ""}` : "–")),
      el("div", { class: "kpi out" }, el("span", { class: "klab" }, "Guardar por mês"), el("span", { class: "kval num" }, api.fmt(monthlyCommit)), el("span", { class: "ksub" }, `soma das metas em andamento`)),
      el("div", { class: "kpi" }, el("span", { class: "klab" }, "Falta juntar"), el("span", { class: "kval num" }, api.fmt(api.sumMoney(ds.map(d => d.remaining)))), el("span", { class: "ksub" }, active.length ? `${active.length} em andamento` : "nada pendente")));

    // linha de inclusão
    const inName = el("input", { id: "gNewName", class: "gin", placeholder: "Ex.: PS5", maxlength: "120", value: draft.name, "aria-label": "Nome da nova meta" });
    const inValue = el("input", { id: "gNewValue", class: "gin num r", placeholder: "5.000,00", inputmode: "decimal", value: draft.value, "aria-label": "Valor da nova meta" });
    const inMonthly = el("input", { id: "gNewMonthly", class: "gin num r", placeholder: "ex.: 200,00", inputmode: "decimal", value: draft.monthly, "aria-label": "Gasto mensal da nova meta" });
    const inMonths = el("input", { id: "gNewMonths", class: "gin num r", placeholder: "ex.: 12", inputmode: "numeric", value: draft.months, "aria-label": "Meses para atingir da nova meta" });
    const prev = el("p", { class: "gpreview" }, previewDraft());
    const sync = (field, inp) => inp.addEventListener("input", () => {
      draft[field] = inp.value;
      if (field === "monthly" || field === "months") lastTyped = inp.value.trim() ? field : (field === "monthly" ? (draft.months.trim() ? "months" : null) : (draft.monthly.trim() ? "monthly" : null));
      // o campo que não está sendo usado fica esmaecido, mostrando qual será calculado
      inMonthly.classList.toggle("auto", lastTyped === "months");
      inMonths.classList.toggle("auto", lastTyped === "monthly");
      prev.textContent = previewDraft();
    });
    sync("name", inName); sync("value", inValue); sync("monthly", inMonthly); sync("months", inMonths);
    inMonthly.classList.toggle("auto", lastTyped === "months");
    inMonths.classList.toggle("auto", lastTyped === "monthly");
    [inName, inValue, inMonthly, inMonths].forEach(i => i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addGoal(); } }));
    const addRow = el("tr", { class: "gadd" },
      el("td", {}), el("td", {}, el("span", { class: "gdot ghost" })),
      el("td", {}, inName), el("td", {}, inValue), el("td", {}, inMonthly), el("td", {}, inMonths),
      el("td", { colspan: "3" }, prev),
      el("td", { class: "gact" }, el("button", { class: "btn solid", onclick: addGoal }, "Adicionar")));

    const table = el("table", { class: "gtable" },
      el("thead", {}, el("tr", {},
        el("th", { class: "gcheck", title: "Metas inativas não entram no resumo do topo" }, "Ativa"), el("th", { class: "gcolor" }, el("span", { class: "sr" }, "Cor")), el("th", {}, "Nome"), el("th", { class: "r" }, "Valor (R$)"),
        el("th", { class: "r" }, "Gasto mensal (R$)"), el("th", { class: "r" }, "Meses p/ atingir"), el("th", { class: "r" }, "Guardado (R$)"),
        el("th", {}, "Progresso"), el("th", {}, "Previsão"), el("th", {}, el("span", { class: "sr" }, "Ações")))),
      el("tbody", {}, ...list.map(row)),
      el("tfoot", {}, addRow));

    root.replaceChildren(
      el("div", { class: "chartshead" }, el("h2", {}, "Metas"), el("p", {}, "Defina o gasto mensal ou os meses para atingir: o outro é calculado. O guardado soma os registros com o nome da meta na tabela Metas dos lançamentos.")),
      summary,
      el("section", { class: "ccard gcard" },
        el("div", { class: "scrollx" }, table),
        formErr ? el("p", { class: "gerr", role: "alert" }, formErr) : null,
        // mensagem padrão: só enquanto não existe nenhuma meta
        list.length ? null : el("p", { class: "ghint" }, "Nenhuma meta ainda. Preencha a linha acima: por exemplo PS5, 5.000,00 e 12 meses, ou PS5, 5.000,00 e 200,00 por mês.")));

    if (focusAdd) { focusAdd = false; $("gNewName").focus(); }
  }

  window.renderGoals = (a) => { api = a; render(); };
  window.goalsBusy = () => !!(edit || colorOpen);
})();
