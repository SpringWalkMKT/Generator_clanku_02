// supabase edge function: presets (GET list, POST create/set-default)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
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
    if (req.method === "GET") {
      const u = new URL(req.url);
      const projectName = u.searchParams.get("project_name") ?? undefined;
      const projectIdParam = u.searchParams.get("project_id");
      const channel = u.searchParams.get("channel") ?? undefined;
      const project_id = await getOrCreateProjectId(projectName, projectIdParam ? Number(projectIdParam) : undefined);
      let q = supabase.from("presets").select("id,name,channel,tone_of_voice,length_profile,is_default,created_at").eq("project_id", project_id).order("is_default", {
        ascending: false
      }).order("created_at", {
        ascending: false
      });
      if (channel) q = q.eq("channel", channel);
      const { data, error } = await q;
      if (error) return new Response("DB error: " + error.message, {
        status: 500,
        headers: CORS
      });
      return new Response(JSON.stringify(data ?? []), {
        headers: {
          "Content-Type": "application/json",
          ...CORS
        }
      });
    }
    if (req.method === "POST") {
      const body = await req.json();
      const project_id = await getOrCreateProjectId(body.project_name, body.project_id);
      const makeDefault = !!body.is_default;
      if (makeDefault) {
        await supabase.from("presets").update({
          is_default: false
        }).eq("project_id", project_id).eq("channel", body.channel);
      }
      const { data: ins, error: insErr } = await supabase.from("presets").insert({
        project_id,
        channel: body.channel,
        name: body.name,
        tone_of_voice: body.tone_of_voice,
        length_profile: body.length_profile,
        is_default: makeDefault
      }).select("id").single();
      if (insErr) return new Response("DB error: " + insErr.message, {
        status: 500,
        headers: CORS
      });
      return new Response(JSON.stringify({
        ok: true,
        id: ins.id
      }), {
        headers: {
          "Content-Type": "application/json",
          ...CORS
        }
      });
    }
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS
    });
  } catch (e) {
    return new Response("Error: " + (e?.message ?? "unknown"), {
      status: 500,
      headers: CORS
    });
  }
});
