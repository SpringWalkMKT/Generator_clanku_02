// scripts/main.js
(function () {
  const BUILD = "main.js v2025-10-09a";
  console.log("[Springwalk]", BUILD);

  const $ = (id) => document.getElementById(id);

  // ---------- helpers ----------
  function showOutput(text) {
    const pre = $("output");
    const ed = $("outputEdit");
    pre.textContent = text;
    if (ed.style.display !== "none") ed.value = text;
  }
  function getOutputText() {
    return $("outputEdit").style.display === "none"
      ? $("output").textContent
      : $("outputEdit").value;
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
    catch { alert("Nepodařilo se kopírovat. Zkopíruj ručně."); }
  }
  function shortenTo(content, target = 900, preserveLink = "", enforceTag = "#springwalk") {
    let out = String(content || "");
    if (!out.includes(enforceTag)) out = enforceTag + "\n" + out;
    if (preserveLink && !out.includes(preserveLink)) out += `\n\n${preserveLink}`;
    if (out.length <= target) return out;
    let cut = out.slice(0, target);
    const lastStop = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
    if (lastStop > 200) cut = cut.slice(0, lastStop + 1);
    out = cut.trim();
    if (preserveLink && !out.includes(preserveLink)) out += `\n\n${preserveLink}`;
    if (!out.includes(enforceTag)) out = enforceTag + "\n" + out;
    return out;
  }

  // ---------- config ----------
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
    if (!r.ok) throw new Error(await r.text().catch(()=>"") || `HTTP ${r.status}`);
    return r.json();
  }
  async function callValidate(url, key, channel, content, link) {
    const r = await fetch(`${url}/functions/v1/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, content, link_url: link })
    });
    if (!r.ok) throw new Error(await r.text().catch(()=>"") || `HTTP ${r.status}`);
    return r.json();
  }
  async function callSaveDraft(url, key, payload) {
    const r = await fetch(`${url}/functions/v1/save-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text().catch(()=>"") || `HTTP ${r.status}`);
    return r.json();
  }
  async function loadDrafts(url, key, projectName) {
    const r = await fetch(`${url}/functions/v1/drafts?project_name=${encodeURIComponent(projectName)}`, {
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (!r.ok) throw new Error(await r.text().catch(()=>"") || `HTTP ${r.status}`);
    return r.json();
  }

  // ---------- DOM ----------
  function bind(id, event, handler) {
    const el = $(id);
    if (!el) { console.warn("[Springwalk] Nenalezen element", id); return; }
    el.addEventListener(event, handler);
  }

  document.addEventListener("DOMContentLoaded", () => {
    console.log("[Springwalk] DOM ready");

    // bezpečně zruš klasický submit
    bind("generate-form", "submit", (e) => e.preventDefault());

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

    bind("btnCopy", "click", () => {
      const text = getOutputText();
      if (!text.trim()) return alert("Není co kopírovat.");
      copyToClipboard(text);
    });

    bind("btnShorten", "click", () => {
      const link = $("linkUrl").value;
      const shortened = shortenTo(getOutputText(), 900, link, "#springwalk");
      showOutput(shortened);
    });

    bind("btnToggleEdit", "click", () => {
      const ed = $("outputEdit");
      const pre = $("output");
      if (ed.style.display === "none") {
        ed.value = pre.textContent;
        ed.style.display = "block";
        pre.style.display = "none";
        $("btnToggleEdit").textContent = "Zavřít editor";
      } else {
        pre.style.display = "block";
        ed.style.display = "none";
        showOutput(ed.value);
        $("btnToggleEdit").textContent = "Upravit text";
      }
    });

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
