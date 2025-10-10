// supabase edge function: validate
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
// === helpers ===
function hasHashtagSpringwalk(txt) {
  return /(^|\s)#springwalk(\b|$)/i.test(txt || "");
}
function containsUrl(txt) {
  return /(https?:\/\/[^\s)]+)$/im.test(txt || "");
}
Deno.serve(async (req)=>{
  const origin = req.headers.get("origin") ?? "";
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(origin)
    });
  }
  try {
    if (req.method !== "POST") {
      return jsonResponse({
        error: "Method Not Allowed"
      }, origin, 405);
    }
    const { channel = "LinkedIn", content = "", link_url = "" } = await req.json();
    const text = String(content ?? "");
    const length = text.length;
    const issues = [];
    const warnings = [];
    // společné
    if (!hasHashtagSpringwalk(text)) {
      issues.push("Chybí #springwalk.");
    }
    // pravidla dle kanálu
    const ch = String(channel).toLowerCase();
    if (ch === "linkedin") {
      if (length > 3000) issues.push("Překročen limit LinkedIn (~3000 znaků).");
      if (length < 300) warnings.push("Text je velmi krátký (doporučení 800–1200 znaků).");
      if (length > 1200 && length <= 3000) warnings.push("Doporučená délka pro engagement je 800–1200 znaků.");
      if (!link_url) issues.push("Chybí link_url v požadavku.");
      if (link_url && !text.includes(link_url)) issues.push("V textu chybí odkaz na web (musí být vložen).");
    }
    if (ch === "facebook") {
      if (length > 2000) issues.push("Text je na Facebook příliš dlouhý (>2000).");
      if (!link_url) issues.push("Chybí link_url v požadavku.");
      if (link_url && !text.includes(link_url)) warnings.push("Zvaž vložení odkazu do textu (FB).");
    }
    if (ch === "instagram") {
      if (containsUrl(text)) issues.push("Instagram caption by neměla obsahovat klikatelné URL. Použij 'link v bio'.");
      if (!/link\s+v\s+bio/i.test(text)) warnings.push("Doporučení: přidej callout „(link v bio)“.");
    }
    if (ch === "blog") {
      if (length < 400) warnings.push("Blog post je velmi krátký.");
    // Link není povinný (článek bývá cílová stránka)
    }
    const result = {
      length,
      issues,
      warnings
    };
    return jsonResponse(result, origin, 200);
  } catch (err) {
    console.error("validate error:", err);
    return jsonResponse({
      error: err?.message || "Internal Error"
    }, origin, 500);
  }
});
