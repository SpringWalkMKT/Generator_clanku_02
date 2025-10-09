// scripts/main.js
(function () {
  const BUILD = "main.js v2025-10-09b";
  console.log("[Springwalk]", BUILD);

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);

  function showOutput(text) {
    const pre = $("output");
    const ed = $("outputEdit");
    pre.textContent = text || "";
    if (ed.style.display !== "none") ed.value = pre.textContent;
  }

  function getOutputText() {
    const pre = $("output");
    const ed = $("outputEdit");
    return ed.style.display === "none" ? pre.textContent : ed.value;
  }

  function showChecks(res) {
    const box = $("checks");
    if (!res) {
      box.textContent = "";
      return;
    }
    const { valid, issues = [], warnings = [], length } = res;
    let txt = `Délka: ${length} znaků\n`;
    if (issues.length) txt += `❌ Nutné opravit:\n- ${issues.join("\n- ")}\n`;
    if (warnings.length) txt += `ℹ️ Doporučení:\n- ${warnings.join("\n- ")}\n`;
    if (!issues.length && !warnings.length) txt += "✅ V pořádku.";
    box.textContent = txt;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Zkopírováno do schránky.");
    } catch {
      alert("Nepodařilo se kopírovat. Zkopíruj prosím ručně.");
    }
  }

  // ---------- Config ----------
  function getConfig() {
    if (!window.APP_CONFIG) {
      showOutput("❌ Chybí scripts/config.js (APP_CONFIG). Zkontroluj GitHub Actions a Secrets.");
      throw new Error("APP_CONFIG not found");
    }
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      showOutput("❌ APP_CONFIG je neúplný. Zkontroluj Secrets SUPABASE_URL / SUPABASE_ANON_KEY.");
      throw new Error("APP_CONFIG incomplete");
    }
    return { SUPABASE_URL, SUPABASE_ANON_KEY };
  }

  // ---------- API ----------
  async function callGenerate(url, key, payload) {
    const r = await fetch(`${url}/functions/v1/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text().catch(() => "") || `HTTP ${r.status}`);
    return r.json();
  }

  async function callValidate(url, key, channel, content, link) {
    const r = await fetch(`${url}/functions/v1/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, content, link_url: link })
    });
    if (!r.ok) throw new Error(await r.text().catch(() => "") || `HTTP ${r.status}`);
    return r.json();
  }

  async function callSaveDraft(url, key, payload) {
    const r = await fetch(`${url}/functions/v1/save-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text().catch(() => "") || `HTTP ${r.status}`);
    return r.json();
  }

  async function loadDrafts(url, key, projectName) {
    const r = await fetch(`${url}/functions/v1/drafts?project_name=${encodeURIComponent(projectName)}`, {
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (!r.ok) throw new Error(await r.text().catch(() => "") || `HTTP ${r.status}`);
    return r.json();
  }

  // ---------- Utils ----------
  function readForm() {
    return {
      project_name: $("projectName").value || "Springwalk – MVP",
      tone: $("tone").value,
      length: $("length").value,
      keywords: $("keywords").value,
      source_text: $("sourceText").value,
      link_url: $("linkUrl").value
    };
  }

  /**
   * Zkrátí text tak, aby se vešel do "target" znaků.
   * VÝSLEDNÝ TVAR: (tělo) + prázdný řádek + #springwalk + prázdný řádek + URL
   * - Původní #springwalk a přesně zadaná URL se nejdřív odstraní (aby nebyly duplicity).
   * - Zkracuje se pouze tělo, ocásek (tag+link) je vždy zachovaný na konci.
   */
  function shortenTo(content, target = 900, preserveLink = "", enforceTag = "#springwalk") {
    // 1) Normalizace
    let body = String(content || "")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // 2) Odstraň existující hashtag (pouze přesnou podobu)
    if (enforceTag) {
      const tagRe = new RegExp(`(^|\\s)${enforceTag}(\\s|$)`, "gi");
      body = body.replace(tagRe, " ").replace(/\s{2,}/g, " ").trim();
    }

    // 3) Odstraň z těla i konkrétní URL (a její markdown variantu)
    if (preserveLink) {
      const linkEsc = preserveLink.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mdLinkRe = new RegExp(`\\[([^\\]]+)\\]\\(${linkEsc}\\)`, "gi");
      body = body.replace(mdLinkRe, "")
                 .replace(new RegExp(linkEsc, "gi"), "")
                 .replace(/\s{2,}/g, " ")
                 .trim();
    }

    // 4) Připrav ocásek (bude NA KONCI)
    const tailParts = [];
    if (enforceTag) tailParts.push(enforceTag);
    if (preserveLink) tailParts.push(preserveLink);
    const tail = tailParts.join("\n\n"); // mezi tagem a linkem taky prázdný řádek
    const reserve = tail ? tail.length + 2 /* prázdný řádek mezi tělem a ocáskem */ : 0;

    const maxBody = Math.max(0, target - reserve);

    // 5) Zkrať pouze tělo
    let trimmed = body;
    if (trimmed.length > maxBody) {
      let cut = trimmed.slice(0, maxBody);
      const lastStop = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
      if (lastStop > maxBody * 0.5) cut = cut.slice(0, lastStop + 1);
      trimmed = cut.trim();
    }

    // 6) Poskládej: tělo + ocásek na konec
    let out = trimmed;
    if (tail) {
      out = out ? `${out}\n\n${tail}` : tail;
    }
    return out.trim();
  }

  // ---------- Bind safely ----------
  function bind(id, event, handler) {
    const el = $(id);
    if (!el) { console.warn("[Springwalk] Nenalezen element:", id); return; }
    el.addEventListener(event, handler);
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    console.log("[Springwalk] DOM ready");

    bind("generate-form", "submit", (e) => e.preventDefault());

    // GENERATE
    bind("btnGenerate", "click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const payload = readForm();
      showChecks(null);
      showOutput("⏳ Generuji…");
      $("btnGenerate").disabled = true;

      try {
        const data = await callGenerate(SUPABASE_URL, SUPABASE_ANON_KEY, payload);
        showOutput(data.content || "(prázdný výstup)");

        const check = await callValidate(SUPABASE_URL, SUPABASE_ANON_KEY, "LinkedIn", data.content, payload.link_url);
        showChecks(check);
      } catch (err) {
        console.error(err);
        showOutput("❌ Chyba: " + (err?.message || err));
      } finally {
        $("btnGenerate").disabled = false;
      }
    });

    // COPY
    bind("btnCopy", "click", () => {
      const text = getOutputText();
      if (!text.trim()) return alert("Není co kopírovat.");
      copyToClipboard(text);
    });

    // SHORTEN (900 znaků) – zachová #springwalk + URL na KONCI
    bind("btnShorten", "click", () => {
      const link = $("linkUrl").value;
      const shortened = shortenTo(getOutputText(), 900, link, "#springwalk");
      showOutput(shortened);
    });

    // TOGGLE EDIT
    bind("btnToggleEdit", "click", () => {
      const ed = $("outputEdit");
      const pre = $("output");
      const btn = $("btnToggleEdit");
      if (ed.style.display === "none") {
        ed.value = pre.textContent;
        ed.style.display = "block";
        pre.style.display = "none";
        btn.textContent = "Zavřít editor";
      } else {
        pre.style.display = "block";
        ed.style.display = "none";
        showOutput(ed.value);
        btn.textContent = "Upravit text";
      }
    });

    // SAVE DRAFT (nová verze)
    bind("btnSaveDraft", "click", async () => {
      const text = getOutputText();
      if (!text.trim()) return alert("Není co uložit.");
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const projectName = $("projectName").value || "Springwalk – MVP";
      $("btnSaveDraft").disabled = true;
      try {
        const res = await callSaveDraft(SUPABASE_URL, SUPABASE_ANON_KEY, {
          project_name: projectName,
          channel: "LinkedIn",
          content: text,
          status: "draft"
        });
        alert(`Uloženo jako draft (verze v${res.version}).`);
      } catch (e) {
        console.error(e);
        alert("❌ Uložení selhalo: " + (e?.message || e));
      } finally {
        $("btnSaveDraft").disabled = false;
      }
    });

    // LOAD DRAFTS
    bind("btnLoadDrafts", "click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const projectName = $("projectName").value || "Springwalk – MVP";
      const box = $("drafts");
      box.textContent = "⏳ Načítám…";
      $("btnLoadDrafts").disabled = true;
      try {
        const rows = await loadDrafts(SUPABASE_URL, SUPABASE_ANON_KEY, projectName);
        if (!rows.length) { box.textContent = "— žádné drafty —"; return; }
        box.textContent = rows.map(r =>
          `[${r.created_at}] v${r.version} ${r.channel} (${r.status})\n${r.content}\n---`
        ).join("\n");
      } catch (e) {
        console.error(e);
        box.textContent = "❌ " + (e?.message || e);
      } finally {
        $("btnLoadDrafts").disabled = false;
      }
    });
  });
})();
