// scripts/main.js
(function () {
  const BUILD = "main.js MilestoneA v2025-10-10-utm+draftlink";
  console.log("[Springwalk] Boot", BUILD);

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const byName = (name) => Array.from(document.getElementsByName(name));
  const must = (el, id) => { if (!el) throw new Error(`#${id} not found`); return el; };

  // ===== State =====
  let lastSuggestedTags = [];
  let lastChannel = "LinkedIn";

  // ===== UI helpers =====
  function currentChannel() {
    const r = byName("channel").find(i => i.checked);
    return r ? r.value : "LinkedIn";
  }
  function setChannelUI(ch) {
    $("igAltWrap").style.display = (ch === "Instagram") ? "block" : "none";
    $("blogWrap").style.display = (ch === "Blog") ? "block" : "none";
    $("btnShorten").style.display = (ch === "Blog") ? "none" : "inline-block";
  }

  // --- UTM preset podle kanálu ---
  const UTM_PRESETS = {
    LinkedIn:  { source: "linkedin",  medium: "organic" },
    Facebook:  { source: "facebook",  medium: "organic" },
    Instagram: { source: "instagram", medium: "organic" },
    Blog:      { source: "blog",      medium: "article" },
  };
  function applyUtmPresetForChannel(ch) {
    const p = UTM_PRESETS[ch] || UTM_PRESETS.LinkedIn;
    const src = $("utmSource"); if (src) src.value = p.source;
    const med = $("utmMedium"); if (med) med.value = p.medium;
  }

  function showOutput(text) {
    const pre = must($("output"), "output");
    const ed  = must($("outputEdit"), "outputEdit");
    pre.textContent = text || "";
    if (ed.style.display !== "none") ed.value = pre.textContent;
  }
  function showIGAlt(text) { $("igAlt").textContent = text || ""; }
  function showBlogPreview(obj) {
    const pre = $("outputBlog");
    if (!pre) return;
    const md = [
      obj.h1 ? `# ${obj.h1}` : "",
      ...(obj.h2 || []).map(h => `\n## ${h}`),
      ...(obj.h3 || []).map(h => `\n### ${h}`),
      ...(obj.paragraphs || []),
      "",
      obj.meta_title ? `**Meta title:** ${obj.meta_title}` : "",
      obj.meta_description ? `**Meta description:** ${obj.meta_description}` : "",
      (obj.recommended_internal_links || []).length
        ? `**Doporučené interní odkazy:**\n- ${obj.recommended_internal_links.join("\n- ")}`
        : ""
    ].filter(Boolean).join("\n\n");
    pre.textContent = md || "(prázdné)";
  }
  function clearSecondaryOutputs() {
    showIGAlt("");
    showBlogPreview({});
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
    let txt = typeof length === "number" ? `Délka: ${length} znaků\n` : "";
    if (issues.length)   txt += `❌ Nutné opravit:\n- ${issues.join("\n- ")}\n`;
    if (warnings.length) txt += `ℹ️ Doporučení:\n- ${warnings.join("\n- ")}\n`;
    if (!issues.length && !warnings.length) txt += "✅ V pořádku.";
    box.textContent = txt.trim();
  }
  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); alert("Zkopírováno."); }
    catch { alert("Nepodařilo se kopírovat."); }
  }

  // ===== Config =====
  function getConfig() {
    if (!window.APP_CONFIG) throw new Error("Chybí scripts/config.js (APP_CONFIG).");
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("APP_CONFIG neúplné.");
    return { SUPABASE_URL, SUPABASE_ANON_KEY };
  }

  // ===== HTTP =====
  async function httpJson(url, opts = {}) {
    const r = await fetch(url, opts);
    const t = await r.text();
    let json = null; try { json = t ? JSON.parse(t) : null; } catch {}
    if (!r.ok) throw new Error(json?.error || json?.message || t || `HTTP ${r.status}`);
    return json;
  }
  const api = {
    generate: (base, key, payload) => httpJson(`${base}/functions/v1/generate`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    }),
    validate: (base, key, channel, content, link) => httpJson(`${base}/functions/v1/validate`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, content, link_url: link })
    }),
    saveDraft: (base, key, payload) => httpJson(`${base}/functions/v1/save-draft`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    }),
    drafts: (base, key, project) => httpJson(`${base}/functions/v1/drafts?project_name=${encodeURIComponent(project)}`, {
      headers: { "Authorization": `Bearer ${key}` }
    }),
    suggestTags: async (base, key, channel, content, n = 3) => {
      const j = await httpJson(`${base}/functions/v1/suggest-hashtags`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ channel, content, count: n })
      });
      return Array.isArray(j?.hashtags) ? j.hashtags : [];
    },
    presetsGet: (base, key, q) => httpJson(`${base}/functions/v1/presets?${new URLSearchParams(q)}`, {
      headers: { "Authorization": `Bearer ${key}` }
    }),
    presetsPost: (base, key, body) => httpJson(`${base}/functions/v1/presets`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(body)
    })
  };

  // ===== UTM =====
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

  // ===== Text utils =====
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function shortenTo(content, target = 900, enforceTag = "#springwalk", extraTags = []) {
    let tagsInput = [];
    if (Array.isArray(extraTags)) tagsInput = extraTags;
    else if (typeof extraTags === "string" && extraTags.trim()) tagsInput = [extraTags.trim()];

    const norm = (t) => {
      if (!t) return "";
      let x = String(t).trim();
      if (!x) return "";
      if (!x.startsWith("#")) x = "#" + x.replace(/\s+/g, "");
      return x;
    };

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
    const tailTags = uniq([norm(enforceTag), ...tagsInput.map(norm)]).filter(Boolean);
    const tail = tailTags.join(" ");
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

  // vlož link do textu (po 1. odstavci / do věty „…náš článek na“)
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

  function getSelectedTones() {
    const el = $("toneMulti");
    if (!el) return ["profesionální"];
    const vals = Array.from(el.selectedOptions).map(o => o.value);
    return vals.length ? vals : ["profesionální"];
  }
  const LENGTH_MAP = {
    vk: { bucket: "krátká",  min: 300,  max: 500  },
    k:  { bucket: "krátká",  min: 400,  max: 800  },
    s:  { bucket: "střední", min: 800,  max: 1200 },
    d:  { bucket: "dlouhá",  min: 1200, max: 1800 },
    vd: { bucket: "dlouhá",  min: 1800, max: 2400 },
  };
  function getLengthSelection() {
    const id = $("length").value || "k";
    return { id, ...(LENGTH_MAP[id] || LENGTH_MAP["k"]) };
  }

  // ===== Read form =====
  function readForm() {
    const tones = getSelectedTones();
    const toneCombined = (tones.length ? tones : ["profesionální"]).join(" + ");
    const lengthSel = getLengthSelection();
    const project = $("projectName").value || "Springwalk – MVP";

    const rawLink = $("linkUrl").value.trim();
    const addUtm = $("addUtm").checked;
    const finalLink = addUtm
      ? withUTM(rawLink, {
          source: $("utmSource").value || "linkedin",
          medium: $("utmMedium").value || "organic",
          campaign: $("utmCampaign").value || slugify(project),
          content: $("utmContent").value || "",
          term: $("utmTerm").value || ""
        })
      : rawLink;

    return {
      channel: currentChannel(),
      project_name: project,
      tone: toneCombined,
      length: lengthSel.bucket,
      length_hint: { id: lengthSel.id, min: lengthSel.min, max: lengthSel.max },
      keywords: $("keywords").value,
      source_text: $("sourceText").value,
      link_url: finalLink
    };
  }

  // ===== Init =====
  document.addEventListener("DOMContentLoaded", () => {
    $("utmCampaign").value = slugify($("projectName").value || "springwalk-mvp");
    $("projectName").addEventListener("input", () => {
      if ($("utmAutoSync").checked) $("utmCampaign").value = slugify($("projectName").value || "springwalk-mvp");
    });

    byName("channel").forEach(r => {
      r.addEventListener("change", () => {
        lastChannel = currentChannel();
        setChannelUI(lastChannel);
        applyUtmPresetForChannel(lastChannel);
        clearSecondaryOutputs();
        $("output").textContent = "(zatím prázdné)";
        $("outputEdit").style.display = "none";
        $("output").style.display = "block";
      });
    });
    setChannelUI(currentChannel());
    applyUtmPresetForChannel(currentChannel());

    $("generate-form").addEventListener("submit", (e) => e.preventDefault());

    // === Generate ===
    $("btnGenerate").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const p = readForm();
      lastChannel = p.channel;

      showChecks(null);
      clearSecondaryOutputs();
      $("output").textContent = "⏳ Generuji…";
      $("btnGenerate").disabled = true;

      try {
        // 1) Generate
        const data = await api.generate(SUPABASE_URL, SUPABASE_ANON_KEY, p);

        if (p.channel === "Instagram") {
          const captionRaw = data?.caption || "";
          const caption = captionRaw.includes("(link v bio)") ? captionRaw : `${captionRaw}\n\n(link v bio)`;
          showOutput(caption);
          showIGAlt(data?.alt_text || "");

          // Hashtagy – IG (až 5)
          try {
            lastSuggestedTags = await api.suggestTags(SUPABASE_URL, SUPABASE_ANON_KEY, p.channel, caption, 5);
          } catch { lastSuggestedTags = []; }

          const withTags = shortenTo(caption, 2200, "#springwalk", lastSuggestedTags);
          showOutput(withTags);

          // Validace (bez linku v textu)
          try {
            const check = await api.validate(SUPABASE_URL, SUPABASE_ANON_KEY, p.channel, withTags, "");
            showChecks(check);
          } catch {}
        }
        else if (p.channel === "Blog") {
          const obj = data || {};
          showBlogPreview(obj);

          const preview = $("outputBlog").textContent || "";
          showOutput(preview);

          try {
            const check = await api.validate(SUPABASE_URL, SUPABASE_ANON_KEY, p.channel, preview, "");
            showChecks(check);
          } catch {}
        }
        else {
          // LinkedIn / Facebook
          let text = data?.content || "";

          // Link inline
          text = injectLinkInline(text, p.link_url);

          // Hashtagy – 3
          try {
            lastSuggestedTags = await api.suggestTags(SUPABASE_URL, SUPABASE_ANON_KEY, p.channel, text, 3);
          } catch { lastSuggestedTags = []; }

          text = shortenTo(text, p.channel === "Facebook" ? 1500 : 2000, "#springwalk", lastSuggestedTags);
          showOutput(text);

          // Validace
          try {
            const check = await api.validate(SUPABASE_URL, SUPABASE_ANON_KEY, p.channel, text, p.link_url);
            showChecks(check);
          } catch {}
        }
      } catch (err) {
        console.error(err);
        showOutput("❌ Chyba: " + (err?.message || err));
      } finally {
        $("btnGenerate").disabled = false;
      }
    });

    // === Copy ===
    $("btnCopy").addEventListener("click", () => {
      const text = getOutputText();
      if (!text.trim()) return alert("Není co kopírovat.");
      copyToClipboard(text);
    });

    // === Shorten (ne pro Blog) ===
    $("btnShorten").addEventListener("click", () => {
      const ch = currentChannel();
      if (ch === "Blog") return;
      const cur = getOutputText();
      const target = (ch === "LinkedIn") ? 900 : (ch === "Facebook" ? 900 : 2000);
      const shortened = shortenTo(cur, target, "#springwalk", lastSuggestedTags);
      showOutput(shortened);
    });

    // === Toggle edit ===
    $("btnToggleEdit").addEventListener("click", () => {
      const ed = $("outputEdit"), pre = $("output");
      const btn = $("btnToggleEdit");
      if (ed.style.display === "none") {
        ed.value = pre.textContent; ed.style.display = "block"; pre.style.display = "none";
        btn.textContent = "Zavřít editor";
      } else {
        pre.style.display = "block"; ed.style.display = "none"; showOutput(ed.value);
        btn.textContent = "Upravit text";
      }
    });

    // === Save draft (s link_url; bez source_text) ===
    $("btnSaveDraft").addEventListener("click", async () => {
      const text = getOutputText();
      if (!text.trim()) return alert("Není co uložit.");
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const form = readForm(); // kvůli link_url a kanálu
      $("btnSaveDraft").disabled = true;
      try {
        const res = await api.saveDraft(SUPABASE_URL, SUPABASE_ANON_KEY, {
          project_name: form.project_name,
          channel: form.channel,
          content: text,
          status: "draft",
          link_url: form.link_url // ukládáme link do DB
          // source_text NEposíláme
        });
        alert(`Uloženo jako draft (v${res.version}).`);
      } catch (e) {
        alert("❌ Uložení presetu selhalo: " + (e?.message || e));
      } finally { $("btnSaveDraft").disabled = false; }
    });

    // === Load drafts ===
    $("btnLoadDrafts").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const projectName = $("projectName").value || "Springwalk – MVP";
      const box = $("drafts"); box.textContent = "⏳ Načítám…"; $("btnLoadDrafts").disabled = true;
      try {
        const rows = await api.drafts(SUPABASE_URL, SUPABASE_ANON_KEY, projectName);
        if (!rows.length) { box.textContent = "— žádné drafty —"; return; }
        box.textContent = rows.map(r =>
          `[${r.created_at}] v${r.version} ${r.channel} (${r.status})\n${r.content}\n---`
        ).join("\n");
      } catch (e) {
        box.textContent = "❌ " + (e?.message || e);
      } finally { $("btnLoadDrafts").disabled = false; }
    });

    // === Presets ===
    $("btnLoadPresets").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const project = $("projectName").value || "Springwalk – MVP";
      const ch = currentChannel();
      const sel = $("presetSelect");
      sel.innerHTML = `<option value="">(načítám…)</option>`;
      try {
        const list = await api.presetsGet(SUPABASE_URL, SUPABASE_ANON_KEY, { project_name: project, channel: ch });
        sel.innerHTML = "";
        if (!list.length) { sel.innerHTML = `<option value="">(žádné presety)</option>`; return; }
        list.forEach(p => {
          const o = document.createElement("option");
          o.value = JSON.stringify(p);
          o.textContent = `${p.name}${p.is_default ? " ★" : ""}`;
          sel.appendChild(o);
        });
        const def = list.find(p => p.is_default) || list[0];
        sel.value = JSON.stringify(def);
        try {
          const tones = String(def.tone_of_voice || "").split("+").map(s=>s.trim()).filter(Boolean);
          Array.from($("toneMulti").options).forEach(o => o.selected = tones.map(t=>t.toLowerCase()).includes(o.value.toLowerCase()));
          const raw = (def.length_profile || "").toLowerCase();
          const lenId = ["vk","k","s","d","vd"].includes(raw) ? raw : raw.includes("střední") ? "s" : raw.includes("dlouhá") ? "d" : "k";
          $("length").value = lenId;
          $("presetName").value = def.name || "";
        } catch {}
      } catch (e) {
        sel.innerHTML = `<option value="">(presets API nedostupné)</option>`;
      }
    });

    $("btnApplyPreset").addEventListener("click", () => {
      const sel = $("presetSelect");
      if (!sel.value) return;
      try {
        const p = JSON.parse(sel.value);
        const tones = String(p.tone_of_voice || "").split("+").map(s=>s.trim()).filter(Boolean);
        Array.from($("toneMulti").options).forEach(o => o.selected = tones.map(t=>t.toLowerCase()).includes(o.value.toLowerCase()));
        const raw = (p.length_profile || "").toLowerCase();
        const lenId = ["vk","k","s","d","vd"].includes(raw) ? raw : raw.includes("střední") ? "s" : raw.includes("dlouhá") ? "d" : "k";
        $("length").value = lenId;
        $("presetName").value = p.name || "";
      } catch { alert("❌ Chybný preset."); }
    });

    $("btnSavePreset").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const project = $("projectName").value || "Springwalk – MVP";
      const ch = currentChannel();
      const name = $("presetName").value.trim();
      if (!name) return alert("Zadej název presetu.");
      const tones = getSelectedTones();
      const toneCombined = (tones.length ? tones : ["profesionální"]).join(" + ");
      const lenId = $("length").value || "k";
      try {
        await api.presetsPost(SUPABASE_URL, SUPABASE_ANON_KEY, {
          project_name: project,
          channel: ch,
          name,
          tone_of_voice: toneCombined,
          length_profile: lenId,
          is_default: false
        });
        alert("Preset uložen.");
      } catch (e) { alert("❌ Uložení presetu selhalo: " + (e?.message || e)); }
    });
  });
})();
