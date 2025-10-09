// scripts/main.js
(function () {
  const BUILD = "main.js v2025-10-09c";
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
    if (!res) { box.textContent = ""; return; }
    const { valid, issues = [], warnings = [], length } = res;
    let txt = `Délka: ${length} znaků\n`;
    if (issues.length) txt += `❌ Nutné opravit:\n- ${issues.join("\n- ")}\n`;
    if (warnings.length) txt += `ℹ️ Doporučení:\n- ${warnings.join("\n- ")}\n`;
    if (!issues.length && !warnings.length) txt += "✅ V pořádku.";
    box.textContent = txt;
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); alert("Zkopírováno do schránky."); }
    catch { alert("Nepodařilo se kopírovat. Zkopíruj prosím ručně."); }
  }

  // ---------- Config ----------
  function getConfig() {
    if (!window.APP_CONFIG) { showOutput("❌ Chybí scripts/config.js."); throw new Error("APP_CONFIG not found"); }
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { showOutput("❌ APP_CONFIG je neúplný."); throw new Error("APP_CONFIG incomplete"); }
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

  async function callSuggestHashtags(url, key, channel, content, want = 3) {
    const r = await fetch(`${url}/functions/v1/suggest-hashtags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, content, count: want })
    });
    if (!r.ok) throw new Error(await r.text().catch(() => "") || `HTTP ${r.status}`);
    const json = await r.json();
    return Array.isArray(json?.hashtags) ? json.hashtags : [];
  }

  // ---------- Utils ----------
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /**
   * Zkrátí text s tím, že:
   *  - zachová odstavce (prázdný řádek = \n\n)
   *  - NA KONCI přidá: řádek s hashtagy (springwalk + extraTags) a pak link na samostatném řádku
   *  - hashtagy/link z těla nejdřív *odstraní* (aby nebyly duplicity)
   */
  function shortenTo(content, target = 900, link = "", enforceTag = "#springwalk", extraTags = []) {
    // 1) Normalizace – zachovej odstavce
    let body = String(content || "")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // 2) odstraň enforceTag kdekoliv (bez kolapsu odstavců)
    if (enforceTag) {
      const tagRe = new RegExp(`(^|\\n)\\s*${escapeRegex(enforceTag)}\\s*(?=\\n|$)`, "gi");
      body = body.replace(tagRe, "$1").trim();
    }

    // 3) odstraň konkrétní URL i její markdown variantu
    if (link) {
      const linkEsc = escapeRegex(link);
      const mdRe = new RegExp(`\\[([^\\]]+)\\]\\(${linkEsc}\\)`, "gi");
      body = body.replace(mdRe, "").replace(new RegExp(linkEsc, "gi"), "").trim();
      // prázdné řádky po odstranění zarovnej na max dvě \n
      body = body.replace(/\n{3,}/g, "\n\n").trim();
    }

    // 4) připrav tail: hashtags line + (prázdný řádek) + link
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    const tags = uniq([enforceTag, ...extraTags]).join(" ");
    const tail = tags + (link ? `\n\n${link}` : "");
    const reserve = tail.length ? tail.length + (body ? 2 : 0) : 0; // + prázdný řádek mezi tělem a tail

    const maxBody = Math.max(0, target - reserve);

    // 5) Zkracuj pouze tělo – hledej hranici na odstavci nebo větě
    let trimmed = body;
    if (trimmed.length > maxBody) {
      let cut = trimmed.slice(0, maxBody);
      // preferuj hranici odstavce, pak větu, pak slovo
      const lastPara = cut.lastIndexOf("\n\n");
      const lastSent = cut.lastIndexOf(". ");
      const lastSpace = cut.lastIndexOf(" ");
      let at = lastPara;
      if (at < maxBody * 0.45) at = Math.max(lastSent, lastPara);
      if (at < maxBody * 0.25) at = Math.max(lastSpace, at);
      if (at > 0) cut = cut.slice(0, at + 1);
      trimmed = cut.trim();
    }

    // 6) slož výsledek: tělo + prázdný řádek + tail (hashtagy na jedné řádce, link pod tím)
    let out = trimmed;
    if (tail) out = (out ? out + "\n\n" : "") + tail;
    return out.trim();
  }

  // ---------- Bind safely ----------
  function bind(id, event, handler) {
    const el = $(id);
    if (!el) { console.warn("[Springwalk] Nenalezen element:", id); return; }
    el.addEventListener(event, handler);
  }

  // ---------- Init ----------
  let lastSuggestedTags = []; // bude naplněno po generování

  document.addEventListener("DOMContentLoaded", () => {
    console.log("[Springwalk] DOM ready");

    bind("generate-form", "submit", (e) => e.preventDefault());

    // GENERATE
    bind("btnGenerate", "click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const payload = {
        project_name: $("projectName").value || "Springwalk – MVP",
        tone: $("tone").value,
        length: $("length").value,
        keywords: $("keywords").value,
        source_text: $("sourceText").value,
        link_url: $("linkUrl").value
      };

      showChecks(null);
      showOutput("⏳ Generuji…");
      $("btnGenerate").disabled = true;

      try {
        // 1) vygeneruj text
        const data = await callGenerate(SUPABASE_URL, SUPABASE_ANON_KEY, payload);
        let text = data.content || "";

        // 2) doporuč hashtagy z LLM (3 ks) na základě výstupu
        try {
          lastSuggestedTags = await callSuggestHashtags(
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            "LinkedIn",
            text,
            3
          );
        } catch (e) {
          console.warn("Hashtag suggestions failed:", e);
          lastSuggestedTags = [];
        }

        // 3) Ujisti se, že na KONCI jsou hashtagy (#springwalk + doporučené) a link
        text = shortenTo(text, 2000, payload.link_url, "#springwalk", lastSuggestedTags);
        showOutput(text);

        // 4) validace
        const check = await callValidate(SUPABASE_URL, SUPABASE_ANON_KEY, "LinkedIn", text, payload.link_url);
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

    // SHORTEN – zachová odstavce a NA KONCI nechá #springwalk + 3 doporučené + link
    bind("btnShorten", "click", () => {
      const link = $("linkUrl").value;
      const shortened = shortenTo(getOutputText(), 900, link, "#springwalk", lastSuggestedTags);
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

    // SAVE DRAFT
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
