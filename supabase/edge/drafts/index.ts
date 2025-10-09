import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: CORS
  });
  if (req.method !== "GET") return new Response("Method Not Allowed", {
    status: 405,
    headers: CORS
  });
  const url = new URL(req.url);
  const projectName = url.searchParams.get("project_name") ?? "Springwalk – MVP";
  // najdi project_id
  const { data: pj } = await supabase.from("projects").select("id").eq("name", projectName).limit(1);
  const pid = pj?.[0]?.id;
  if (!pid) return new Response(JSON.stringify([]), {
    headers: {
      "Content-Type": "application/json",
      ...CORS
    }
  });
  const { data, error } = await supabase.from("drafts").select("id, channel, version, status, created_at, content").eq("project_id", pid).order("created_at", {
    ascending: false
  }).limit(20);
  if (error) return new Response(`DB error: ${error.message}`, {
    status: 500,
    headers: CORS
  });
  return new Response(JSON.stringify(data ?? []), {
    headers: {
      "Content-Type": "application/json",
      ...CORS
    }
  });
});
