// scripts/main.js

// config je injektován GitHub Action do scripts/config.js
if (!window.APP_CONFIG) {
  document.addEventListener("DOMContentLoaded", () => {
    const out = document.getElementById("output");
    out.textContent = "❌ Chybí scripts/config.js. Zkontroluj GitHub Action.";
  });
  throw new Error("APP_CONFIG not found.");
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

async function callGenerate(inputs) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(inputs)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

document.getElementById("generate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = document.getElementById("output");
  out.textContent = "⏳ Generuji…";

  const payload = {
    project_name: document.getElementById("projectName").value || "Springwalk – MVP",
    tone: document.getElementById("tone").value,
    length: document.getElementById("length").value,
    keywords: document.getElementById("keywords").value,
    source_text: document.getElementById("sourceText").value,
    link_url: document.getElementById("linkUrl").value
  };

  try {
    const data = await callGenerate(payload);
    out.textContent = data.content;
  } catch (err) {
    out.textContent = "❌ " + err.message;
  }
});
