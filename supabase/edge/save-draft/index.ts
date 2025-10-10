// supabase edge function: save-draft (adaptivní; bez source_type, s link_url pokud existuje)
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
    if (req.method !== "POST") {
      return jsonResponse({
        error: "Method Not Allowed"
      }, origin, 405);
    }
    const { project_name = "", channel = "LinkedIn", content = "", status = "draft", link_url = null } = await req.json();
    if (!project_name) return jsonResponse({
      error: "project_name is required"
    }, origin, 400);
    if (!content) return jsonResponse({
      error: "content is required"
    }, origin, 400);
    const sb = getSb();
    // 1) project (find or create)
    let { data: proj, error: e1 } = await sb.from("projects").select("id").eq("name", project_name).maybeSingle();
    if (e1) throw e1;
    if (!proj) {
      const { data: newp, error: e2 } = await sb.from("projects").insert({
        name: project_name
      }).select("id").single();
      if (e2) throw e2;
      proj = newp;
    }
    const project_id = proj.id;
    // 2) next version
    const { data: maxRows, error: e3 } = await sb.from("drafts").select("version").eq("project_id", project_id).eq("channel", channel).order("version", {
      ascending: false
    }).limit(1);
    if (e3) throw e3;
    const nextVersion = (maxRows?.[0]?.version || 0) + 1;
    // 3) insert (adaptivně: nejdřív zkus s link_url; pokud chyba 42703 => retry bez link_url)
    const basePayload = {
      project_id,
      channel,
      content,
      status,
      version: nextVersion
    };
    // pokus 1: s link_url (jen pokud hodnota přišla v payloadu)
    const tryPayload1 = {
      ...basePayload
    };
    if (link_url !== null && link_url !== undefined) tryPayload1.link_url = link_url;
    let ins;
    let errInsert = null;
    try {
      const r1 = await sb.from("drafts").insert(tryPayload1).select("id, version, status").single();
      ins = r1.data;
      errInsert = r1.error;
    } catch (err) {
      errInsert = err;
    }
    if (!ins && errInsert) {
      const errCode = (errInsert?.code || "").toString();
      const errMsg = (errInsert?.message || "").toString().toLowerCase();
      // 42703 = undefined_column
      if (errCode === "42703" || errMsg.includes("column") || errMsg.includes("does not exist")) {
        const r2 = await sb.from("drafts").insert(basePayload).select("id, version, status").single();
        if (r2.error) throw r2.error;
        ins = r2.data;
        console.warn("save-draft: fallback insert bez link_url (sloupec link_url pravděpodobně neexistuje).");
      } else {
        throw errInsert;
      }
    }
    // 4) audit
    await sb.from("audit").insert({
      draft_id: ins.id,
      action: "saved",
      actor: "edge:save-draft",
      meta: {
        channel,
        status,
        version: nextVersion,
        link_url: link_url ? "provided" : "missing"
      }
    });
    return jsonResponse({
      id: ins.id,
      version: ins.version,
      status: ins.status
    }, origin, 200);
  } catch (err) {
    console.error("save-draft error:", err);
    return jsonResponse({
      error: err?.message || "Internal Error"
    }, origin, 500);
  }
});
