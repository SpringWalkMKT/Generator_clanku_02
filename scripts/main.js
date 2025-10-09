// scripts/main.js
(function () {
  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);

  function showOutput(text) {
    $("output").textContent = text;
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

  async function callGenerate(url, key, payload) {
    const res = await fetch(`${url}/functions/v1/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function callValidate(url, key, channel, content, link) {
    const res = await fetch(`${url}/functions/v1/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({ channel, content, link_url: link })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function loadDrafts(url, key, projectName) {
    const res = await fetch(`${url}/functions/v1/drafts?project_name=${encodeURIComponent(projectName)}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

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

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", () => {
    const btnGenerate = $("btnGenerate");
    const btnLoadDrafts = $("btnLoadDrafts");
    const form = $("generate-form");

    // Zabraň klasickému submitu (reload stránky)
    form.addEventListener("submit", (e) => e.preventDefault());

    btnGenerate.addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const payload = readForm();
      showChecks(null);
      showOutput("⏳ Generuji…");
      btnGenerate.disabled = true;

      try {
        const data = await callGenerate(SUPABASE_URL, SUPABASE_ANON_KEY, payload);
        showOutput(data.content || "(prázdný výstup)");

        // po generování rovnou zvalidujeme LI výstup
        const check = await callValidate(
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
          "LinkedIn",
          data.content,
          payload.link_url
        );
        showChecks(check);
      } catch (err) {
        console.error(err);
        showOutput("❌ Chyba: " + (err && err.message ? err.message : err));
      } finally {
        btnGenerate.disabled = false;
      }
    });

    btnLoadDrafts.addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();
      const projectName = $("projectName").value || "Springwalk – MVP";
      const box = $("drafts");
      box.textContent = "⏳ Načítám…";
      btnLoadDrafts.disabled = true;

      try {
        const rows = await loadDrafts(SUPABASE_URL, SUPABASE_ANON_KEY, projectName);
        if (!rows.length) {
          box.textContent = "— žádné drafty —";
          return;
        }
        box.textContent = rows
          .map(r => `[${r.created_at}] v${r.version} ${r.channel} (${r.status})\n${r.content}\n---`)
          .join("\n");
      } catch (e) {
        console.error(e);
        box.textContent = "❌ " + (e && e.message ? e.message : e);
      } finally {
        btnLoadDrafts.disabled = false;
      }
    });
  });
})();
