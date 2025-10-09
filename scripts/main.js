// scripts/main.js
(function () {
  const BUILD = "main.js v2025-10-09-milestoneA-minimal";
  console.log("[Springwalk]", BUILD);

  // ===== DOM helpers =====
  const $ = (id) => document.getElementById(id);

  function showOutput(text) {
    const pre = $("output");
    const ed  = $("outputEdit");
    pre.textContent = text || "";
    if (ed.style.display !== "none") ed.value = pre.textContent;
  }
  function getOutputText() {
    return $("outputEdit").style.display === "none"
      ? $("output").textContent
      : $("outputEdit").value;
  }
  function showChecks(res) {
    const box = $("checks");
    if (!res) { box.textContent = ""; return; }
    const { issues = [], warnings = [], length } = res;
    let txt = `Délka: ${length} znaků\n`;
    if (issues.length)   txt += `❌ Nutné opravit:\n- ${issues.join("\n- ")}\n`;
    if (warnings.length) txt += `ℹ️ Doporučení:\n- ${warnings.join("\n- ")}\n`;
    if (!issues.length && !warnings.length) txt += "✅ V pořádku.";
    box.textContent = txt;
  }
  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); alert("Zkopírováno do schránky."); }
    catch { alert("Nepodařilo se kopírovat. Zkopíruj ručně."); }
  }

  // ===== Config =====
  function getConfig() {
    if (!window.APP_CONFIG) throw new Error("APP_CONFIG not found");
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("APP_CONFIG incomplete");
    return { SUPABASE_URL, SUPABASE_ANON_KEY };
  }

  // ===== Kanál (jen z URL, UI beze změny) =====
  function getChannel() {
    const q = new URLSearchParams(location.search).get("channel") || "linkedin";
    const v = q.toLowerCase();
    if (["linkedin","facebook","instagram","blog"].includes(v)) return v;
    return "linkedin";
  }
  function channelLabel(ch) {
    // pro kompatibilitu se stávající DB (drafts/presets používají "LinkedIn" apod.)
    return ({linkedin:"LinkedIn",facebook:"Facebook",instagram:"Instagram",blog:"Blog"})[ch] || "LinkedIn";
  }
  let CURRENT_CHANNEL = getChannel();

  // ===== API =====
  async function callGenerate(url, key, payload) {
    const r = await fetch(`${url}/functions/v1/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text().catch(()=> "") || `HTTP ${r.status}`);
    return r.json();
  }

  // Nový formát validace: {channel, text, link}
  // Fallback na starý: {channel, content, link_url}
  async function callValidate(url, key, channel, content, link) {
    // pokus o nový formát
    let r = await fetch(`${url}/functions/v1/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, text: content, link })
    });
    if (r.status === 404 || r.status === 400) {
      // fallback na starý kontrakt
      r = await fetch(`${url}/functions/v1/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ channel: channelLabel(channel), content, link_url: link })
      });
    }
    if (!r.ok) throw new Error(await r.text().catch(()=> "") || `HTTP ${r.status}`);
    const json = await r.json();

    // normalizace odpovědi, aby showChecks fungovalo bez změn UI
    if (typeof json?.ok === "boolean" && (json.issues || json.warnings)) {
      const len = content?.length || 0;
      return { issues: json.issues || [], warnings: json.warnings || [], length: len };
    }
    // starý validátor mohl vracet {issues, warnings, length}
    return {
      issues: json.issues || [],
      warnings: json.warnings || [],
      length: typeof json.length === "number" ? json.length : (content?.length || 0)
    };
  }

  async function callSaveDraft(url, key, payload) {
    const r = await fetch(`${url}/functions/v1/save-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text().catch(()=> "") || `HTTP ${r.status}`);
    return r.json();
  }
  async function loadDrafts(url, key, projectName) {
    const r = await fetch(`${url}/functions/v1/drafts?project_name=${encodeURIComponent(projectName)}`, {
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (!r.ok) throw new Error(await r.text().catch(()=> "") || `HTTP ${r.status}`);
    return r.json();
  }
  async function callSuggestHashtags(url, key, channel, content, want = 3) {
    const r = await fetch(`${url}/functions/v1/suggest-hashtags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ channel, text: content, count: want })
    });
    if (!r.ok) throw new Error(await r.text().catch(()=> "") || `HTTP ${r.status}`);
    const json = await r.json();
    return Array.isArray(json?.hashtags) ? json.hashtags : [];
  }

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

  // ===== Shorten (zachovat odstavce + tail na konci) =====
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function shortenTo(content, target = 900, link = "", enforceTag = "#springwalk", extraTags = []) {
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

  // ===== Link inline injector =====
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

  // ===== Tone helpers =====
  function getSelectedTones() {
    return Array.from($("toneMulti").selectedOptions).map(o => o.value);
  }
  function setSelectedTones(values) {
    const opts = Array.from($("toneMulti").options);
    const set = new Set((values || []).map(v => v.toLowerCase()));
    opts.forEach(o => { o.selected = set.has(o.value.toLowerCase()); });
    if (!Array.from($("toneMulti").selectedOptions).length) {
      opts.find(o => o.value === "profesionální").selected = true;
    }
  }

  // ===== Length helpers =====
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

  // ===== Presets helpers =====
  function applyPresetObject(p) {
    if (!p) return;
    const tones = String(p.tone_of_voice || "").split("+").map(s => s.trim()).filter(Boolean);
    setSelectedTones(tones);

    const lenId = (() => {
      const raw = (p.length_profile || "").toLowerCase();
      if (["vk","k","s","d","vd"].includes(raw)) return raw;
      if (raw.includes("krátká")) return "k";
      if (raw.includes("střední")) return "s";
      if (raw.includes("dlouhá")) return "d";
      return "k";
    })();
    $("length").value = lenId;

    $("presetName").value = p.name || "";
  }

  // ===== State =====
  let lastSuggestedTags = [];

  // ===== Read form =====
  function readForm() {
    const tones = getSelectedTones();
    const toneCombined = (tones.length ? tones : ["profesionální"]).join(" + ");
    const lengthSel = getLengthSelection();

    const project = $("projectName").value || "Springwalk – MVP";
    const rawLink = $("linkUrl").value;

    // UTM source podle kanálu
    const defaultSource = CURRENT_CHANNEL; // linkedin/facebook/instagram/blog
    if ($("utmAutoSync").checked && !$("utmSource").value) {
      $("utmSource").value = defaultSource;
    }

    const finalLink = $("addUtm").checked
      ? withUTM(rawLink, {
          source: $("utmSource").value || defaultSource,
          medium: $("utmMedium").value || "organic",
          campaign: $("utmCampaign").value || slugify(project),
          content: $("utmContent").value || "",
          term: $("utmTerm").value || ""
        })
      : rawLink;

    return {
      project_name: project,
      channel: CURRENT_CHANNEL, // API očekává lowercase
      tone: toneCombined,
      length: lengthSel.bucket,
      length_hint: { id: lengthSel.id, min: lengthSel.min, max: lengthSel.max },
      keywords: $("keywords").value,
      source_text: $("sourceText").value,
      link_url: finalLink
    };
  }

  // ===== Init & bindings =====
  document.addEventListener("DOMContentLoaded", () => {
    console.log("[Springwalk] DOM ready, channel =", CURRENT_CHANNEL);

    $("utmCampaign").value = slugify($("projectName").value || "springwalk-mvp");
    $("projectName").addEventListener("input", () => {
      if ($("utmAutoSync").checked) {
        $("utmCampaign").value = slugify($("projectName").value || "springwalk-mvp");
      }
    });

    $("generate-form").addEventListener("submit", (e) => e.preventDefault());

    // GENERATE
    $("btnGenerate").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const payload = readForm();

      showChecks(null);
      showOutput("⏳ Generuji…");
      $("btnGenerate").disabled = true;

      try {
        // 1) Generace (pošleme i channel)
        let data = await callGenerate(SUPABASE_URL, SUPABASE_ANON_KEY, payload);
        let text = data.content || data.text || "";

        // 2) Podle kanálu: IG caption nesmí obsahovat URL
        if (CURRENT_CHANNEL !== "instagram") {
          text = injectLinkInline(text, payload.link_url);
        }

        // 3) Doporučené hashtagy (3 ks) – pošleme channel
        try {
          lastSuggestedTags = await callSuggestHashtags(SUPABASE_URL, SUPABASE_ANON_KEY, CURRENT_CHANNEL, text, 3);
        } catch (e) {
          console.warn("Hashtag suggestions failed:", e);
          lastSuggestedTags = [];
        }

        // 4) Zkrácení (tail = jen hashtagy, link už je uvnitř – u IG se link nepřidával)
        const targetLen = CURRENT_CHANNEL === "instagram" ? 2200 : 2000; // IG limit je vyšší
        text = shortenTo(text, targetLen, "", "#springwalk", lastSuggestedTags);
        showOutput(text);

        // 5) Validace – nový payload + fallback na starý
        const check = await callValidate(
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
          CURRENT_CHANNEL,
          text,
          payload.link_url
        );
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

    // SHORTEN (znovu vloží link do těla, kdyby ho uživatel omylem smazal; u IG se link nepřidává)
    $("btnShorten").addEventListener("click", () => {
      const pf = readForm();
      let cur = getOutputText();
      if (CURRENT_CHANNEL !== "instagram") {
        cur = injectLinkInline(cur, pf.link_url);
      }
      const maxLen = CURRENT_CHANNEL === "instagram" ? 2200 : 900;
      const shortened = shortenTo(cur, maxLen, "", "#springwalk", lastSuggestedTags);
      showOutput(shortened);
    });

    // TOGGLE EDIT
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

    // SAVE DRAFT (label v DB stále „LinkedIn/Facebook…“ pro kontinuitu)
    $("btnSaveDraft").addEventListener("click", async () => {
      const text = getOutputText();
      if (!text.trim()) return alert("Není co uložit.");
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const projectName = $("projectName").value || "Springwalk – MVP";
      $("btnSaveDraft").disabled = true;
      try {
        const res = await callSaveDraft(SUPABASE_URL, SUPABASE_ANON_KEY, {
          project_name: projectName,
          channel: channelLabel(CURRENT_CHANNEL),
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

    // PRESETS – načíst
    $("btnLoadPresets").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const project = $("projectName").value || "Springwalk – MVP";
      try {
        const list = await callPresets(SUPABASE_URL, SUPABASE_ANON_KEY, "GET", {
          project_name: project, channel: channelLabel(CURRENT_CHANNEL) // kompatibilita s backendem
        });
        const sel = $("presetSelect");
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
        applyPresetObject(def);
      } catch (e) {
        console.warn("Nelze načíst presety:", e);
      }
    });

    // PRESETS – použít
    $("btnApplyPreset").addEventListener("click", () => {
      const sel = $("presetSelect");
      if (!sel.value) return;
      try {
        const p = JSON.parse(sel.value);
        applyPresetObject(p);
      } catch (e) {
        console.warn("Chybná volba presetu:", e);
      }
    });

    // PRESETS – uložit
    $("btnSavePreset").addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const project = $("projectName").value || "Springwalk – MVP";
      const name = $("presetName").value.trim();
      if (!name) return alert("Zadej název presetu.");

      const tones = Array.from($("toneMulti").selectedOptions).map(o => o.value);
      const toneCombined = (tones.length ? tones : ["profesionální"]).join(" + ");
      const lenId = $("length").value || "k";

      try {
        await callPresets(SUPABASE_URL, SUPABASE_ANON_KEY, "POST", {
          project_name: project,
          channel: channelLabel(CURRENT_CHANNEL),
          name,
          tone_of_voice: toneCombined,
          length_profile: lenId,
          is_default: false
        });
        alert("Preset uložen.");
      } catch (e) {
        alert("❌ Uložení presetu selhalo: " + (e?.message || e));
      }
    });
  });
})();
