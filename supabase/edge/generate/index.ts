// supabase edge function: generate (krátké LI, bez markdownu, s CORS)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const LENGTH_TARGETS = {
  "krátká": {
    min: 400,
    max: 800
  },
  "střední": {
    min: 800,
    max: 1200
  },
  "dlouhá": {
    min: 1200,
    max: 1800
  }
};
async function getOrCreateProjectId(name, explicitId) {
  if (explicitId) return explicitId;
  const fallbackName = (name ?? "Default").trim();
  const { data: found, error: selErr } = await supabase.from("projects").select("id").eq("name", fallbackName).limit(1);
  if (selErr) throw new Error(`DB select projects error: ${selErr.message}`);
  if (found && found.length) return found[0].id;
  const { data: inserted, error: insErr } = await supabase.from("projects").insert({
    name: fallbackName
  }).select("id").single();
  if (insErr) throw new Error(`DB insert project error: ${insErr.message}`);
  return inserted.id;
}
function normalizeLi(text, link, min, max) {
  let out = String(text ?? "");
  // Zruš markdown odkazy → nech jen holou URL
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$2");
  // Zkompaktní whitespace, ponech prázdný řádek mezi odstavci
  out = out.replace(/[^\S\r\n]+/g, " "); // více mezer → 1 mezera
  out = out.replace(/\r/g, "");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  // Vynucení #springwalk a linku
  if (!out.includes("#springwalk")) out = "#springwalk\n" + out;
  if (link && !out.includes(link)) out += `\n\n${link}`;
  // Příliš dlouhé → zkrať rozumně na větné hranici / odstavec
  if (out.length > max + 100) {
    let cut = out.slice(0, max);
    const lastStop = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
    if (lastStop > min * 0.5) cut = cut.slice(0, lastStop + 1);
    out = cut.trim();
    if (link && !out.includes(link)) out += `\n\n${link}`;
    if (!out.includes("#springwalk")) out = "#springwalk\n" + out;
  }
  return out;
}
serve(async (req)=>{
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: CORS_HEADERS
    });
  }
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS_HEADERS
      });
    }
    const body = await req.json();
    const target = LENGTH_TARGETS[body.length?.toLowerCase?.()] ?? LENGTH_TARGETS["krátká"];
    const projectId = await getOrCreateProjectId(body.project_name, body.project_id);
    const sys = `You are a Czech copywriter for a law firm (advokátní kancelář Springwalk).
- Channel: LinkedIn (short).
- Write in Czech.
- COMPLIANCE (ČAK): edukativní, střídmé, pravdivé, žádné garance výsledků, žádná agresivní CTA.`;
    const user = `Napiš LinkedIn příspěvek BEZ MARKDOWNU A BEZ EMOJI, čistý text.

Formát:
- 1–3 velmi krátké odstavce NEBO max. 3 odrážky s pomlčkou (- ).
- Nepoužívej [text](odkaz) formát. Vlož POUZE holou URL.
- Na začátku nebo konci musí být hashtag #springwalk (ponech přesně takto).
- Drž se cílové délky ${target.min}–${target.max} znaků (ne víc).
- Paragrafy odděluj prázdným řádkem.

Tone of voice: ${body.tone}
Klíčová slova: ${body.keywords}
Zdrojový text (použij jen jako podklad, nic neslibuj): ${body.source_text}
Povinný odkaz vlož v holé podobě: ${body.link_url}`;
    // Chat Completions
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: sys
          },
          {
            role: "user",
            content: user
          }
        ],
        temperature: 0.6,
        max_tokens: 500
      })
    });
    const aiJson = await aiResp.json();
    if (!aiResp.ok) {
      const msg = aiJson?.error?.message ?? JSON.stringify(aiJson);
      return new Response(`OpenAI error: ${msg}`, {
        status: 502,
        headers: CORS_HEADERS
      });
    }
    const raw = aiJson?.choices?.[0]?.message?.content ?? "";
    const output = normalizeLi(raw, body.link_url, target.min, target.max);
    const { error: dbErr } = await supabase.from("drafts").insert({
      project_id: projectId,
      channel: "LinkedIn",
      content: output,
      status: "draft"
    });
    if (dbErr) {
      return new Response(`DB error: ${dbErr.message}`, {
        status: 500,
        headers: CORS_HEADERS
      });
    }
    return new Response(JSON.stringify({
      content: output
    }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  } catch (e) {
    return new Response("Error: " + (e?.message ?? "unknown"), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
});
