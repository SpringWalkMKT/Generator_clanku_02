// scripts/main.js
(function () {
  function show(msg) {
    const out = document.getElementById("output");
    out.textContent = msg;
  }

  function getConfig() {
    if (!window.APP_CONFIG) {
      show("❌ Chybí scripts/config.js (APP_CONFIG). Zkontroluj GitHub Actions a Secrets.");
      throw new Error("APP_CONFIG not found");
    }
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      show("❌ APP_CONFIG je neúplný. Zkontroluj Secrets SUPABASE_URL / SUPABASE_ANON_KEY.");
      throw new Error("APP_CONFIG incomplete");
    }
    return { SUPABASE_URL, SUPABASE_ANON_KEY };
  }

  async function callGenerate(SUPABASE_URL, SUPABASE_ANON_KEY, payload) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function readForm() {
    return {
      project_name: document.getElementById("projectName").value || "Springwalk – MVP",
      tone: document.getElementById("tone").value,
      length: document.getElementById("length").value,
      keywords: document.getElementById("keywords").value,
      source_text: document.getElementById("sourceText").value,
      link_url: document.getElementById("linkUrl").value
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btnGenerate");
    const form = document.getElementById("generate-form");

    // Bezpečnostní brzda: kdyby někdo stiskl Enter, nezpůsobí reload
    form.addEventListener("submit", (e) => e.preventDefault());

    btn.addEventListener("click", async () => {
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = getConfig();

      const payload = readForm();
      show("⏳ Generuji…");
      btn.disabled = true;

      try {
        const data = await callGenerate(SUPABASE_URL, SUPABASE_ANON_KEY, payload);
        show(data.content || "(prázdný výstup)");
      } catch (err) {
        console.error(err);
        show("❌ Chyba: " + (err && err.message ? err.message : err));
      } finally {
        btn.disabled = false;
      }
    });
  });
})();
