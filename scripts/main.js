// scripts/main.js
(function () {
  const BUILD = "main.js v2025-10-09-recover3";
  console.log("%c[Springwalk] Boot", "color:#0a0; font-weight:bold;", BUILD);

  // ===== DOM helpers =====
  const $ = (id) => document.getElementById(id);

  function must(el, id) {
    if (!el) throw new Error(`DOM element #${id} not found`);
    return el;
  }

  function showOutput(text) {
    const pre = must($("output"), "output");
    const ed  = must($("outputEdit"), "outputEdit");
    pre.textContent = text || "";
    if (ed.style.display !== "none") ed.value = pre.textContent;
  }

  function getOutputText() {
    const pre = must($("output"), "output");
    const ed  = must($("outputEdit"), "outputEdit");
    return ed.style.display === "none" ? pre.textContent : ed.value;
  }

  function showChecks(res) {
    const box = must($("checks"), "checks");
    if (!res) { box.textContent = ""; return; }
    const { issues = [], warnings = [], length } = res;
    let txt = `Délka: ${length} znaků\n`;
    if (issues.length)   txt += `❌ Nutné opravit:\n- ${issues.join("\n- ")}\n`;
    if (warnings.length) txt += `ℹ️ Doporučení:\n- ${warnings.join("\n- ")}\n`;
    if (!issues.length && !warnings.length) txt += "✅ V pořádku.";
    box.textContent = txt;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Zkopírováno do schránky.");
    } catch (e) {
      console.error(e);
      alert("Nepodařilo se kopírovat. Zkopíruj ručně.");
    }
  }

  // ===== Config =====
  function getConfig() {
    if (!window.APP_CONFIG) throw new Error("APP_CONFIG not found (scripts/config.js se nenačetl?)");
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("APP_CONFIG lacks SUPABASE_URL/ANON_KEY");
    return { SUPABASE_URL, SUPABASE_ANON_KEY };
  }

  // ===== Generic HTTP JSON =====
  async function httpJson(url, opts = {}) {
    const r = await fetch(url, opts);
    const t = await r.text();
    let json = null;
    try { json = t ? JSON.parse(t) : null; } catch { /* nech text */ }
    if (!r.ok) throw new Error(json?.error || json?.message || t || `HTTP ${r.status}`);
    return json;
  }

  // ===== API wrappers =====
  async function callGenerate(url, key, payload) {
    console.log("[Generate] call", payload);
    return httpJson(`${url}/functions/v1/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
  }

  async function callValidate(url, key, channel, content, link) {
    console.log("[Validate] call", { channel, hasContent: !!content, link });
    return httpJson(`${url}/functions/v1/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, content, link_url: link })
    });
  }

  async function callSaveDraft(url, key, payload) {
    console.log("[SaveDraft] call", payload);
    return httpJson(`${url}/functions/v1/save-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
  }

  async function loadDrafts(url, key, projectName) {
    console.log("[Drafts] load", projectName);
    return httpJson(`${url}/functions/v1/drafts?project_name=${encodeURIComponent(projectName)}`, {
      headers: { "Authorization": `Bearer ${key}` }
    });
  }

  async function callSuggestHashtags(url, key, channel, content, want = 3) {
    console.log("[Hashtags] call", { channel, want });
    const json = await httpJson(`${url}/functions/v1/suggest-hashtags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, content, count: want })
    });
    return Array.isArray(json?.hashtags) ? json.hashtags : [];
  }

  async function callPresets(url, key, method, payloadOrParams) {
    if (method === "GET") {
      const qs = new URLSearchParams(payloadOrParams).toString();
      return httpJson(`${url}/functions/v1/presets?${qs}`, {
        headers: { "Authorization": `Bearer ${key}` }
      });
    } else {
      return httpJson(`${url}/functions/v1/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify(payloadOrParams)
      });
    }
  }

  // ===== UTM =====
  const slugify = (s) => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  function withUTM(url, p) {
    try {
      const u = new URL(url);
      const add = (k, v) => { if (v) u.searchParams.set(k, v); };
      add("utm_source", p.source);
      add("utm_medium", p.medium);
      add("utm_campaign", p.campaign);
      add("utm_content", p.content);
      add("utm_term", p.term);
      return u.toString();
    } catch {
      return url;
    }
  }

  // ===== Shorten & helpers =====
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // tail = jen hashtagy (link je v těle)
  function shortenTo(content, target = 900, _link = "", enforceTag = "#springwalk", extraTags = []) {
    let body = String(content || "")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (enforceTag) {
      const tagRe = new RegExp(`(^|\\n)\\s*${escapeRegex(enforceTag)}\\s*(?=\\n|$)`, "gi");
      body = body.replace(tagRe, "$1").trim();
    }

    body = body.replace(/\n{3,}/g, "\n\n").trim();

    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    const tagsLine = uniq([enforceTag, ...extraTags]).join(" ");
    const tail = tagsLine ? tagsLine : "";
    const reserve = tail.length ? tail.length + (body ? 2 : 0) : 0;
    const maxBody = Math.max(0, target - reserve);

    let trimmed = body;
    if (trimmed.length > maxBody) {
      let cut = trimmed.slice(0, maxBody);
      const lastPara  = cut.lastIndexOf("\n\n");
      const lastSent  = cut.lastIndexOf(". ");
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

  // vlož link do textu (po 1. odstavci, nebo do věty „…náš článek na“)
  function injectLinkInline(text, link) {
    if (!link) return text || "";
    let out = String(text || "").replace(/\r/g, "");
    if (out.includes(link)) return out;

    const lines = out.split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/navštivte\s+náš\s+článek\s+na\s*[:.]?\s*$/i.test(l.trim())) {
        lines[i] = l.replace(/\s*[:.]?\s*$/i, ` ${link}`);
        out = lines.join("\n");
        return out;
      }
    }

    const parts = out.split(/\n{2,}/);
    if (parts.length >= 2) {
      const first = parts[0].trimEnd();
      const rest  = parts.slice(1).join("\n\n").trimStart();
      out = `${first}\n\n${link}\n\n${rest}`.trim();
    } else {
      out = `${out.trim()}\n\n${link}`.trim();
    }
    return out;
  }

  // ===== Tone & Length =====
  function getSelectedTones() {
    const el = $("toneMulti");
    if (!el) return ["profesionální"];
    const vals = Array.from(el.selectedOptions).map((o) => o.value);
    return vals.length ? vals : ["profesionální"];
  }

  function setSelectedTones(values) {
    const el = $("toneMulti");
    if (!el) return;
    const opts = Array.from(el.options);
    const set = new Set((values || []).map((v) => v.toLowerCase()));
    opts.forEach((o) => { o.selected = set.has(o.value.toLowerCase()); });
    if (!Array.from(el.selectedOptions).length) {
      const def = opts.find((o) => o.value === "profesionální");
      if (def) def.selected = true;
    }
  }

  const LENGTH_MAP = {
    vk: { bucket: "krátká",  min: 300,  max: 500  },
    k:  { bucket: "krátká",  min: 400,  max: 800  },
    s:  { bucket: "střední", min: 800,  max: 1200 },
    d:  { bucket: "dlouhá",  min: 1200, max: 1800 },
    vd: { bucket: "dlouhá",  min: 1800, max: 2400 }
  };

  function getLengthSelection() {
    const el = $("length");
    const id = el ? el.value : "k";
    return { id, ...(LENGTH_MAP[id] || LENGTH_MAP["k"]) };
  }

  // ===== Presets helpers =====
  function applyPresetObject(p) {
    try {
      if (!p) return;
      const tones = String(p.tone_of_voice || "")
        .split("+")
        .map((s) => s.trim())
        .filter(Boolean);
      setSelectedTones(tones);

      const raw = (p.length_profile || "").toLowerCase();
      const lenId = ["vk", "k", "s", "d", "vd"].includes(raw)
        ? raw
        : raw.includes("střední")
        ? "s"
        : raw.includes("dlouhá")
        ? "d"
        : "k";
      const lenSel = $("length");
      if (lenSel) lenSel.value = lenId;

      const pn = $("presetName");
      if (pn) pn.value = p.name || "";
    } catch (e) {
      console.warn("[Preset] apply failed:", e);
    }
  }

  // ===== Read form =====
  function readForm() {
    const tones = getSelectedTones();
    const toneCombined = (tones.length ? tones : ["profesionální"]).join(" + ");

    const lengthSel = getLengthSelection();

    const projEl = $("projectName");
    const project = projEl && projEl.value ? projEl.value : "Springwalk – MVP";
    const rawLink = (must($("linkUrl"), "linkUrl").value || "").trim();
    const addUtm = $("addUtm")?.checked;

    const finalLink = addUtm
      ? withUTM(rawLink, {
          source: $("utmSource")?.value || "linkedin",
          medium: $("utmMedium")?.value || "organic",
          campaign: $("utmCampaign")?.value || slugify(project),
          content: $("utmContent")?.value || "",
          term: $("utmTerm")?.value || ""
        })
      : rawLink;

    return {
      project_name: project,
      tone: toneCombined,
      length: lengthSel.bucket,
      length_hint: { id: lengthSel.id, min: lengthSel.min, max: lengthSel.max },
      keywords: $("keywords")?.value || "",
      source_text: $("sourceText")?.value || "",
      link_url: finalLink
    };
  }

  // ===== Init =====
  document.addEventListener("DOMContentLoaded", () => {
    try {
      console.log("%c[Springwalk] DOM ready", "color:#06c;");

      const pn = $("projectName");
      if ($("utmCampaign") && pn) {
        $("utmCampaign").value = slugify(pn.value || "springwalk-mvp");
        pn.addEventListener("input", () => {
          if ($("utmAutoSync")?.checked) {
            $("utmCampaign").value = slugify(pn.value || "springwalk-mvp");
          }
        });
      }

      must($("generate-form"), "generate-form").addEventListener("submit", (e) => e.preventDefault());

      // GENERATE
      must($("btnGenerate"), "btnGenerate").addEventListener("click", async () => {
        console.log("[UI] Generate clicked");
        let cfg;
        try {
          cfg = getConfig();
        } catch (e) {
          console.error(e);
          showOutput("❌ Konfigurace chybí (scripts/config.js?).");
          return;
        }

        const payload = readForm();
        showChecks(null);
        showOutput("⏳ Generuji…");
        $("btnGenerate").disabled = true;

        try {
          // 1) Generate
          const data = await callGenerate(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, payload);
          let text = data?.content || "";

          // 2) Link inline
          text = injectLinkInline(text, payload.link_url);

          // 3) Hashtagy (bez pádu UI, když endpoint nejede)
          let lastSuggestedTags = [];
          try {
            lastSuggestedTags = await callSuggestHashtags(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, "LinkedIn", text, 3);
          } catch (e) {
            console.warn("[Hashtags] skipped:", e.message || e);
          }

          // 4) Tail = jen hashtagy
          text = shortenTo(text, 2000, "", "#springwalk", lastSuggestedTags);
          showOutput(text);

          // 5) Validate (bez pádu UI)
          try {
            const check = await callValidate(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, "LinkedIn", text, payload.link_url);
            showChecks(check);
          } catch (e) {
            console.warn("[Validate] skipped:", e.message || e);
          }
        } catch (err) {
          console.error(err);
          showOutput("❌ Chyba: " + (err?.message || err));
        } finally {
          $("btnGenerate").disabled = false;
        }
      });

      // COPY
      $("btnCopy")?.addEventListener("click", () => {
        const text = getOutputText();
        if (!text.trim()) {
          alert("Není co kopírovat.");
          return;
        }
        copyToClipboard(text);
      });

      // SHORTEN
      $("btnShorten")?.addEventListener("click", () => {
        const payload = readForm();
        let cur = getOutputText();
        cur = injectLinkInline(cur, payload.link_url);
        const shortened = shortenTo(cur, 900, "", "#springwalk", []);
        showOutput(shortened);
      });

      // TOGGLE EDIT
      $("btnToggleEdit")?.addEventListener("click", () => {
        const ed = must($("outputEdit"), "outputEdit");
        const pre = must($("output"), "output");
        const btn = must($("btnToggleEdit"), "btnToggleEdit");
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

      // SAVE DRAFT  (fix: odstraněna nadbytečná závorka)
      $("btnSaveDraft")?.addEventListener("click", async () => {
        const text = getOutputText();
        if (!text.trim()) {
          alert("Není co uložit.");
          return;
        }
        let cfg;
        try {
          cfg = getConfig();
        } catch (e) {
          alert("Chybí konfigurace.");
          return;
        }
        const projectName = $("projectName")?.value || "Springwalk – MVP";
        $("btnSaveDraft").disabled = true;
        try {
          const res = await callSaveDraft(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
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
      $("btnLoadDrafts")?.addEventListener("click", async () => {
        let cfg;
        try {
          cfg = getConfig();
        } catch (e) {
          alert("Chybí konfigurace.");
          return;
        }
        const projectName = $("projectName")?.value || "Springwalk – MVP";
        const box = must($("drafts"), "drafts");
        box.textContent = "⏳ Načítám…";
        $("btnLoadDrafts").disabled = true;
        try {
          const rows = await loadDrafts(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, projectName);
          if (!rows.length) {
            box.textContent = "— žádné drafty —";
            return;
          }
          box.textContent = rows
            .map((r)
