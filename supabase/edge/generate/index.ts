// supabase edge function: generate (Milestone A)
// Větvení pro LinkedIn / Facebook / Instagram / Blog
// === CORS (common) ===
const ALLOWED_ORIGINS = new Set([
  "https://springwalkmkt.github.io",
  "http://localhost:5500"
]);
function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://springwalkmkt.github.io";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}
function jsonResponse(data, origin, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}
// === Detekce advokáta/právníka Springwalk ze zdroje ===
function detectSpringwalkLead(src) {
  if (!src) return "";
  const text = String(src).replace(/\s+/g, " ");
  const re = /(advokátka|advokát|právnička|právník|partner)\s+([\p{Lu}][\p{L}\-]+(?:\s+[\p{Lu}][\p{L}\-]+)+).*?(Spring\s*Walk|Springwalk)/iu;
  const m = text.match(re);
  if (!m) return "";
  const roleRaw = m[1].toLowerCase();
  const name = m[2].trim();
  const role = roleRaw === "advokátka" ? "advokátka" : roleRaw === "právnička" ? "právnička" : roleRaw === "právník" ? "právník" : roleRaw === "partner" ? "partner" : "advokát";
  const prefix = role === "advokátka" || role === "právnička" ? "Naše" : "Náš";
  return `${prefix} ${role} ${name} (Springwalk) komentuje:`;
}
// === OpenAI call ===
async function callOpenAIChat(apiKey, messages) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages
    })
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI nevrátil obsah.");
  return content;
}
Deno.serve(async (req)=>{
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: corsHeaders(origin)
  });
  try {
    if (req.method !== "POST") return jsonResponse({
      error: "Method Not Allowed"
    }, origin, 405);
    const body = await req.json();
    const { channel = "LinkedIn", project_name = "Springwalk – MVP", tone = "profesionální", length = "krátká", length_hint = undefined, keywords = "", source_text = "" } = body ?? {};
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const minChars = Math.max(200, Number(length_hint?.min ?? (channel === "Facebook" ? 600 : 800)));
    const maxChars = Math.max(minChars + 100, Number(length_hint?.max ?? (channel === "Facebook" ? 1200 : 1400)));
    const systemBase = [
      "Jsi copywriter pro advokátní kancelář Springwalk. Píšeš česky, věcně a edukativně.",
      "Dodržuj etický kodex ČAK: žádné garance výsledku, žádné agresivní CTA, pravdivost a střídmost.",
      `Tone of voice: ${tone}.`
    ].join(" ");
    const lead = detectSpringwalkLead(source_text);
    if (!OPENAI_API_KEY) {
      // Fallback bez OpenAI – ať UI nepadá
      if (channel === "Instagram") {
        const caption = (lead ? lead + "\n\n" : "") + `Krátké shrnutí (${tone}, ${length}).\n\n(link v bio)`;
        return jsonResponse({
          caption,
          alt_text: "Popis obrázku: (doplní se)"
        }, origin, 200);
      }
      if (channel === "Blog") {
        return jsonResponse({
          h1: "Název (fallback)",
          h2: [
            "Kontext novely"
          ],
          h3: [],
          paragraphs: [
            (lead ? lead + "\n\n" : "") + "Stručné shrnutí (fallback)."
          ],
          meta_title: "Meta title (fallback)",
          meta_description: "Meta description (fallback, do 160 znaků).",
          recommended_internal_links: [
            "https://springwalk.cz/"
          ]
        }, origin, 200);
      }
      // LI/FB fallback
      const base = (lead ? lead + "\n\n" : "") + `Shrnutí (${tone}, ${length}).\n\nPro více informací navštivte náš článek na.`;
      return jsonResponse({
        content: base
      }, origin, 200);
    }
    // === Branching by channel ===
    if (channel === "LinkedIn" || channel === "Facebook") {
      const system = [
        systemBase,
        "Výstup je příspěvek na sociální síť. Nevkládej URL ani hashtagy.",
        `Délka cílově ${minChars}–${maxChars} znaků (přibližně).`,
        "Formátuj do krátkých odstavců, můžeš použít stručné odrážky.",
        channel === "Facebook" ? "Drž 1–3 odstavce a uměřené CTA, přívětivě a věcně." : ""
      ].filter(Boolean).join(" ");
      const leadInstruction = lead ? `Začni přesně tímto řádkem a navazuj textem: "${lead}"` : `Pokud není citace ve zdroji, nezačínej nic jako „náš advokát…“ – rovnou k věci.`;
      const anchInstruction = `Po první části přidej samostatnou větu: "Pro více informací navštivte náš článek na." (bez URL).`;
      const user = [
        `Projekt: ${project_name}`,
        `Tone of voice (kombinace): ${tone}`,
        `Klíčová slova: ${keywords || "-"}`,
        leadInstruction,
        anchInstruction,
        "",
        "Zdrojový text (parafrázuj, cituj střídmě a jako převzaté informace):",
        '"""',
        (source_text || "").slice(0, 8000),
        '"""'
      ].join("\n");
      const content = await callOpenAIChat(OPENAI_API_KEY, [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: user
        }
      ]);
      return jsonResponse({
        content
      }, origin, 200);
    }
    if (channel === "Instagram") {
      const system = [
        systemBase,
        "Výstup je Instagram caption: žádné URL v textu, přidej nenuceně '(link v bio)'.",
        "Drž krátké odstavce a srozumitelnou pointu."
      ].join(" ");
      const user = [
        `Projekt: ${project_name}`,
        `Tone of voice (kombinace): ${tone}`,
        `Klíčová slova: ${keywords || "-"}`,
        lead ? `První řádek může (pokud to sedí) zrcadlit: "${lead}"` : "Bez leadu, pokud není ve zdroji.",
        "",
        "Zdroj (stručně parafrázuj):",
        '"""',
        (source_text || "").slice(0, 4000),
        '"""',
        "",
        "Vrať jen text caption (bez hashtagů) – '(link v bio)' vlož do závěru věcně.",
        "Separátně vygeneruj ALT text k obrázku (stručný, popisný, bez marketingu)."
      ].join("\n");
      const raw = await callOpenAIChat(OPENAI_API_KEY, [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: user
        }
      ]);
      // jednoduchý split: alt oddělíme od caption, když to model sám zformátuje
      let caption = raw;
      let alt = "";
      const m = raw.match(/alt[\s\-_:]*text.*?:\s*(.+)$/i);
      if (m) {
        alt = m[1].trim();
        caption = raw.replace(m[0], "").trim();
      }
      if (!/\(link v bio\)/i.test(caption)) caption = `${caption}\n\n(link v bio)`;
      return jsonResponse({
        caption,
        alt_text: alt || "Popis obrázku (automaticky): stručně, věcně."
      }, origin, 200);
    }
    if (channel === "Blog") {
      const system = [
        systemBase,
        "Výstup je návrh blogového článku. Striktně rozlišuj převzaté informace a vlastní komentář (ČAK).",
        "Nepiš hashtagy ani URL.",
        "Meta description do 160 znaků."
      ].join(" ");
      const user = [
        `Projekt: ${project_name}`,
        `Tone of voice (kombinace): ${tone}`,
        `Délka cílově ${minChars}–${maxChars} znaků (orientačně).`,
        `Klíčová slova: ${keywords || "-"}`,
        lead ? `Je-li relevantní, můžeš v úvodu zmínit: "${lead}"` : "",
        "",
        "Zdroj (parafrázuj, cituj střídmě a označ jako 'Převzaté'; doplň 'Vlastní komentář')",
        '"""',
        (source_text || "").slice(0, 10000),
        '"""',
        "",
        "Vrať JSON s klíči: h1, h2[], h3[], paragraphs[], meta_title, meta_description, recommended_internal_links[]",
        "Bez extra textu, jen JSON."
      ].join("\n");
      const jsonStr = await callOpenAIChat(OPENAI_API_KEY, [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: user
        }
      ]);
      // pokus o JSON parse; když to model nevrátí přesně, zkus opravný parse
      let obj = {};
      try {
        obj = JSON.parse(jsonStr);
      } catch  {
        // fallback – zabalit jako paragraf
        obj = {
          h1: "Návrh článku",
          h2: [],
          h3: [],
          paragraphs: [
            jsonStr
          ],
          meta_title: "Návrh článku – Springwalk",
          meta_description: "Návrh článku (náhled).",
          recommended_internal_links: []
        };
      }
      // jistota polí
      obj.h2 = Array.isArray(obj.h2) ? obj.h2 : obj.h2 ? [
        obj.h2
      ] : [];
      obj.h3 = Array.isArray(obj.h3) ? obj.h3 : obj.h3 ? [
        obj.h3
      ] : [];
      obj.paragraphs = Array.isArray(obj.paragraphs) ? obj.paragraphs : obj.paragraphs ? [
        obj.paragraphs
      ] : [];
      obj.recommended_internal_links = Array.isArray(obj.recommended_internal_links) ? obj.recommended_internal_links : [];
      return jsonResponse(obj, origin, 200);
    }
    // Fallback (neznámý channel)
    return jsonResponse({
      content: "Neznámý kanál."
    }, origin, 400);
  } catch (err) {
    console.error("generate error:", err);
    return jsonResponse({
      error: err?.message || "Internal Error"
    }, origin, 500);
  }
});
