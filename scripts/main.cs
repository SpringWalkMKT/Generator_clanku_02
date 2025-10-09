// scripts/main.js
const SUPABASE_URL = "https://tufuymtiiwlsariamnul.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZnV5bXRpaXdsc2FyaWFtbnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MjgwMzcsImV4cCI6MjA3NTUwNDAzN30.sShLazLU7TSJTScrYmZJHQ6kv90pOMVcRb5CiGgM9P0"; // Project Settings → API

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
    project_name: "Springwalk – MVP",
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
