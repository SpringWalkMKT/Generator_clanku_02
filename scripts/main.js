// scripts/main.js
(function () {
  const BUILD = "main.js v2025-10-09d";
  console.log("[Springwalk]", BUILD);

  const $ = (id) => document.getElementById(id);

  // ---------- helpers ----------
  function showOutput(text) {
    const pre = $("output");
    const ed = $("outputEdit");
    pre.textContent = text || "";
    if (ed.style.display !== "none") ed.value = pre.textContent;
  }
  function getOutputText() {
    return $("outputEdit").style.display === "none" ? $("output").textContent : $("outputEdit").value;
  }
  function showChecks(res) {
    const box = $("checks");
    if (!res) { box.textContent = ""; return; }
    const { issues = [], warnings = [], length } = res;
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
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // zachovat odstavce, ocásek (tagy+link) na konci
  function shortenTo(content, target = 900, link = "", enforceTag = "#springwalk", extraTags = []) {
    let body = String(content || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    if (enforceTag) {
      const tagRe = new RegExp(`(^|\\n)\\s*${escapeRegex(enforceTag)}\\s*(?=\\n|$)`, "gi");
      body = body.replace(tagRe, "$1").trim();
    }
    if (link) {
      const linkEsc = escapeRegex(link);
      const mdRe = new RegExp(`\\[([^\\]]+)\\]\\(${linkEsc}\\)`, "gi");
      body = body.replace(mdRe, "").replace(new RegExp(linkEsc, "gi"), "").trim();
      body = body.replace(/\n{3,}/g, "\n\n").trim();
    }
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    const tags = uniq([enforceTag, ...extraTags]).join(" ");
    const tail = tags + (link ? `\n\n${link}` : "");
    const reserve = tail.length ? tail.length + (body ? 2 : 0) : 0;
    const maxBody = Math.max(0, target - reserve);

    let trimmed = body;
    if (trimmed.length > maxBody) {
      let cut = trimmed.slice(0, maxBody);
      const lastPara = cut.lastIndexOf("\n\n");
      const lastSent = cut.lastIndexOf(". ");
      const lastSpace = cut.lastIndexOf(" ");
      let at = lastPara;
      if (at < maxBody * 0.45) at = Math.max(lastSent, at);
      if (at < maxBody * 0.25) at = Math.max(lastSpace, at);
      if (at > 0) cut = cut.slice(0, at + 1);
      trimmed = cut.trim();
    }
    let out = trimmed;
    if (tail) out = (out ? out + "\n\n" : "") + tail;
    return out.trim();
  }

  // ---------- config ----------
  function getConfig() {
    if (!window.APP_CONFIG) throw new Error("APP_CONFIG not found");
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("APP_CONFIG incomplete");
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
  async function callSuggestHashtags(url, key, channel, content, want = 3) {
    const r = await fetch(`${url}/functions/v1/suggest-hashtags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, content, count: want })
    });
    if (!r.ok) throw new Error(await r.text().catch(()=>"") || `HTTP ${r.status}`);
    const json = await r.json();
    return Array.isArray(json?.hashtags) ? json.hashtags : [];
  }
  async function callPresets(url, key, method, payloadOrParams) {
    if (method === "GET") {
      const p = payloadOrParams;
      const qs = new URLSearchParams(p).toString();
      const r = await fetch(`${url}/functions/v1/presets?${qs}`, { headers: { "Authorization": `Bearer ${key}` } });
      if (!r.ok) throw new Error(await r.text().catch(()=>"") || `HTTP ${r.status}`);
      return r.json();
    } else {
      const r = await fetch(`${url}/functions/v1/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify(payloadOrParams)
      });
      if (!r.ok) throw new Error(await r.text().catch(()=>"") || `HTTP ${r.status}`);
      return r.json();
    }
  }

  // ---------- UTM ----------
  const slugify = (s) => (s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  function withUTM(url, p) {
    try {
      const u = new URL(url);
      const add = (k,v)=>{ if(v) u.searchParams.set(k, v); };
      add("utm_source", p.source); add("utm_medium", p.medium);
      add("utm_campaign", p.campaign); add("utm_content", p.content);
      add("utm_term", p.term);
      return u.toString();
    } catch { return url; }
  }

  // ---------- state ----------
  let lastSuggestedTags = [];

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", () => {
    console.log("[Springwalk] DOM ready");

    // Preset default campaign
    $("utmCampaign").value = slugify($("projectName").value || "springwalk-mvp");

    $("generate-form").addEventListener("submit", (e) => e.preventDefault());

    // GENERATE
    $("btnGenerate").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const project = $("projectName").value || "Springwalk – MVP";

      // UTM link
      const rawLink = $("linkUrl").value;
      let finalLink = rawLink;
      if ($("addUtm").checked) {
        finalLink = withUTM(rawLink, {
          source: $("utmSource").value || "linkedin",
          medium: $("utmMedium").value || "organic",
          campaign: $("utmCampaign").value || slugify(project),
          content: $("utmContent").value || "",
          term: $("utmTerm").value || ""
        });
      }

      const payload = {
        project_name: project,
        tone: $("tone").value,
        length: $("length").value,
        keywords: $("keywords").value,
        source_text: $("sourceText").value,
        link_url: finalLink
      };

      showChecks(null);
      showOutput("⏳ Generuji…");
      $("btnGenerate").disabled = true;

      try {
        const data = await callGenerate(SUPABASE_URL, SUPABASE_ANON_KEY, payload);
        let text = data.content || "";

        try {
          lastSuggestedTags = await callSuggestHashtags(SUPABASE_URL, SUPABASE_ANON_KEY, "LinkedIn", text, 3);
        } catch { lastSuggestedTags = []; }

        text = shortenTo(text, 2000, finalLink, "#springwalk", lastSuggestedTags);
        showOutput(text);

        const check = await callValidate(SUPABASE_URL, SUPABASE_ANON_KEY, "LinkedIn", text, finalLink);
        showChecks(check);
      } catch (err) {
        console.error(err);
        showOutput("❌ Chyba: " + (err?.message || err));
      } finally {
        $("btnGenerate").disabled = false;
      }
    });

    // COPY
    $("btnCopy").addEventListener("click", () => {
      const text = getOutputText();
      if (!text.trim()) return alert("Není co kopírovat.");
      copyToClipboard(text);
    });

    // SHORTEN
    $("btnShorten").addEventListener("click", () => {
      const linkWithUtm = $("addUtm").checked
        ? withUTM($("linkUrl").value, {
            source: $("utmSource").value, medium: $("utmMedium").value,
            campaign: $("utmCampaign").value, content: $("utmContent").value, term: $("utmTerm").value
          })
        : $("linkUrl").value;
      const shortened = shortenTo(getOutputText(), 900, linkWithUtm, "#springwalk", lastSuggestedTags);
      showOutput(shortened);
    });

    // TOGGLE EDIT
    $("btnToggleEdit").addEventListener("click", () => {
      const ed = $("outputEdit"); const pre = $("output");
      const btn = $("btnToggleEdit");
      if (ed.style.display === "none") {
        ed.value = pre.textContent; ed.style.display = "block"; pre.style.display = "none";
        btn.textContent = "Zavřít editor";
      } else {
        pre.style.display = "block"; ed.style.display = "none"; showOutput(ed.value);
        btn.textContent = "Upravit text";
      }
    });

    // SAVE DRAFT
    $("btnSaveDraft").addEventListener("click", async () => {
      const text = getOutputText();
      if (!text.trim()) return alert("Není co uložit.");
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const projectName = $("projectName").value || "Springwalk – MVP";
      $("btnSaveDraft").disabled = true;
      try {
        const res = await callSaveDraft(SUPABASE_URL, SUPABASE_ANON_KEY, {
          project_name: projectName, channel: "LinkedIn", content: text, status: "draft"
        });
        alert(`Uloženo jako draft (verze v${res.version}).`);
      } catch (e) {
        console.error(e); alert("❌ Uložení selhalo: " + (e?.message || e));
      } finally { $("btnSaveDraft").disabled = false; }
    });

    // LOAD DRAFTS
    $("btnLoadDrafts").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const projectName = $("projectName").value || "Springwalk – MVP";
      const box = $("drafts"); box.textContent = "⏳ Načítám…"; $("btnLoadDrafts").disabled = true;
      try {
        const rows = await loadDrafts(SUPABASE_URL, SUPABASE_ANON_KEY, projectName);
        if (!rows.length) { box.textContent = "— žádné drafty —"; return; }
        box.textContent = rows.map(r =>
          `[${r.created_at}] v${r.version} ${r.channel} (${r.status})\n${r.content}\n---`
        ).join("\n");
      } catch (e) {
        console.error(e); box.textContent = "❌ " + (e?.message || e);
      } finally { $("btnLoadDrafts").disabled = false; }
    });

    // PRESETS – načíst, uložit, použít
    $("btnLoadPresets").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const project = $("projectName").value || "Springwalk – MVP";
      try {
        const list = await callPresets(SUPABASE_URL, SUPABASE_ANON_KEY, "GET", {
          project_name: project, channel: "LinkedIn"
        });
        const sel = $("presetSelect");
        sel.innerHTML = "";
        if (!list.length) { sel.innerHTML = `<option value="">(žádné presety)</option>`; return; }
        list.forEach(p => {
          const o = document.createElement("option");
          o.value = JSON.stringify(p);
          o.textContent = `${p.name} ${p.is_default ? "★" : ""}`;
          sel.appendChild(o);
        });
      } catch (e) { alert("❌ Nelze načíst presety: " + (e?.message || e)); }
    });

    $("btnApplyPreset").addEventListener("click", () => {
      const sel = $("presetSelect");
      if (!sel.value) return;
      try {
        const p = JSON.parse(sel.value);
        $("tone").value = p.tone_of_voice;
        $("length").value = p.length_profile;    
        // volitelně doplnit název do pole:
        $("presetName").value = p.name || "";
      } catch {
        alert("❌ Chybná volba presetu.");
      }
    });

    $("btnSavePreset").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const project = $("projectName").value || "Springwalk – MVP";
      const name = $("presetName").value.trim();
      if (!name) return alert("Zadej název presetu.");
      try {
        await callPresets(SUPABASE_URL, SUPABASE_ANON_KEY, "POST", {
          project_name: project,
          channel: "LinkedIn",
          name,
          tone_of_voice: $("tone").value,
          length_profile: $("length").value,
          is_default: false
        });
        alert("Preset uložen.");
      } catch (e) { alert("❌ Uložení presetu selhalo: " + (e?.message || e)); }
    });
  });
})();
