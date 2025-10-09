// supabase edge function: save-draft
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
async function getOrCreateProjectId(name, explicitId) {
  if (explicitId) return explicitId;
  const fallbackName = (name ?? "Default").trim();
  const { data: found, error: selErr } = await supabase.from("projects").select("id").eq("name", fallbackName).limit(1);
  if (selErr) throw new Error(selErr.message);
  if (found && found.length) return found[0].id;
  const { data: ins, error: insErr } = await supabase.from("projects").insert({
    name: fallbackName
  }).select("id").single();
  if (insErr) throw new Error(insErr.message);
  return ins.id;
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: CORS
  });
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS
    });
    const body = await req.json();
    const projectId = await getOrCreateProjectId(body.project_name, body.project_id);
    const channel = body.channel || "LinkedIn";
    const status = body.status || "draft";
    // Zjisti další verzi pro daný project+channel
    const { data: rows, error: maxErr } = await supabase.from("drafts").select("version").eq("project_id", projectId).eq("channel", channel).order("version", {
      ascending: false
    }).limit(1);
    if (maxErr) return new Response("DB error: " + maxErr.message, {
      status: 500,
      headers: CORS
    });
    const nextVersion = (rows?.[0]?.version ?? 0) + 1;
    const { data: ins, error: insErr } = await supabase.from("drafts").insert({
      project_id: projectId,
      channel,
      content: body.content,
      status,
      version: nextVersion
    }).select("id, version").single();
    if (insErr) return new Response("DB error: " + insErr.message, {
      status: 500,
      headers: CORS
    });
    // volitelný audit
    await supabase.from("audit").insert({
      draft_id: ins.id,
      action: "save_draft_web",
      meta: {
        channel,
        status
      }
    });
    return new Response(JSON.stringify({
      ok: true,
      id: ins.id,
      version: ins.version
    }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS
      }
    });
  } catch (e) {
    return new Response("Error: " + (e?.message ?? "unknown"), {
      status: 500,
      headers: CORS
    });
  }
});
