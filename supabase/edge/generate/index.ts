// supabase edge function: drafts (list) – adaptivní select s link_url/source_text pokud existují
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
function getSb() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: {
      persistSession: false
    }
  });
}
Deno.serve(async (req)=>{
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders(origin)
    });
  }
  try {
    if (req.method !== "GET") {
      return jsonResponse({
        error: "Method Not Allowed"
      }, origin, 405);
    }
    const url = new URL(req.url);
    const project_name = url.searchParams.get("project_name") ?? "";
    const channel = url.searchParams.get("channel") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? "10");
    const sb = getSb();
    if (!project_name) return jsonResponse([], origin, 200);
    // najdi projekt
    const { data: proj, error: e1 } = await sb.from("projects").select("id").eq("name", project_name).maybeSingle();
    if (e1) throw e1;
    if (!proj) return jsonResponse([], origin, 200);
    // 1) pokus – se sloupci link_url a source_text
    let rows = null;
    let errMain = null;
    try {
      let q = sb.from("drafts").select("id, project_id, channel, status, version, content, link_url, source_text, created_at").eq("project_id", proj.id).order("created_at", {
        ascending: false
      }).limit(limit);
      if (channel) q = q.eq("channel", channel);
      const r = await q;
      if (r.error) throw r.error;
      rows = r.data || [];
    } catch (err) {
      errMain = err;
    }
    // 2) fallback – bez volitelných sloupců
    if (!rows) {
      let q = sb.from("drafts").select("id, project_id, channel, status, version, content, created_at").eq("project_id", proj.id).order("created_at", {
        ascending: false
      }).limit(limit);
      if (channel) q = q.eq("channel", channel);
      const r2 = await q;
      if (r2.error) throw r2.error;
      rows = r2.data || [];
      // nechceme padat – jen upozornění do logu
      console.warn("drafts: fallback select bez link_url/source_text (pravděpodobně chybí sloupce v DB).", errMain?.message || "");
    }
    return jsonResponse(rows, origin, 200);
  } catch (err) {
    console.error("drafts error:", err);
    return jsonResponse({
      error: err?.message || "Internal Error"
    }, origin, 500);
  }
});
