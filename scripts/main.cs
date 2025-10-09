// Nahraď vlastními údaji ze Supabase (Dashboard > Project Settings > API)
const SUPABASE_URL = "https://TVŮJPROJEKT.supabase.co";
const SUPABASE_ANON_KEY = "TVŮJ_ANON_KEY";

async function generatePost(inputs) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(inputs)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err);
  }
  return await response.json();
}

document.getElementById("generate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  document.getElementById("output").textContent = "⏳ Generuji návrh...";

  const data = {
    project_name: document.getElementById("projectName").value,
    keywords: document.getElementById("keywords").value,
    source_text: document.getElementById("sourceText").value,
    link_url: document.getElementById("linkUrl").value,
    tone: document.getElementById("tone").value,
    length: document.getElementById("length").value
  };

  try {
    const result = await generatePost(data);
    document.getElementById("output").textContent = result.content;
  } catch (err) {
    document.getElementById("output").textContent = "❌ Chyba: " + err.message;
  }
});
