// supabase edge function: suggest-hashtags
// (bez nutnosti OpenAI – heuristika; pokud budeš chtít OpenAI, můžu doplnit)
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
// === simple heuristic ===
function suggest(text, channel, want = 3) {
  const t = (text || "").toLowerCase();
  const pool = new Set();
  // základní právní/pracovní
  if (/(odstupn[eé]|výpověd|pracovn(í|i)\správo|zaměstnanc|zaměstnavatel)/.test(t)) {
    pool.add("#pracovnipravo");
    pool.add("#odstupne");
    pool.add("#zamestnani");
  }
  if (/(compliance|regulac|směrnic|ochran(a|y)\sosobních\súdajů|gdpr)/.test(t)) {
    pool.add("#compliance");
    pool.add("#pravo");
  }
  if (/(novel(a|y)|zákon(ík)?\spráce|změn(y|a))/.test(t)) {
    pool.add("#novelazakonikuprace");
    pool.add("#legislativa");
  }
  // kanálové nuance
  if (channel.toLowerCase() === "linkedin") {
    pool.add("#business");
    pool.add("#management");
  }
  if (channel.toLowerCase() === "facebook") {
    pool.add("#aktualne");
  }
  if (channel.toLowerCase() === "instagram") {
    pool.add("#tipy");
  }
  // odstran #springwalk (frontend ho přidává sám)
  const arr = Array.from(pool).filter((h)=>h.toLowerCase() !== "#springwalk");
  return arr.slice(0, Math.max(0, want || 0));
}
Deno.serve(async (req)=>{
  const origin = req.headers.get("origin") ?? "";
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
    const { channel = "LinkedIn", content = "", count = 3 } = await req.json();
    const hashtags = suggest(String(content || ""), String(channel || ""), Number(count || 3));
    return jsonResponse({
      hashtags
    }, origin, 200);
  } catch (err) {
    console.error("suggest-hashtags error:", err);
    return jsonResponse({
      error: err?.message || "Internal Error"
    }, origin, 500);
  }
});
