// supabase edge function: generate
// LI výstup, bez markdownu/emoji, CORS, detekce kreditů Springwalk + ÚVODNÍ ŘÁDEK: "Náš/Naše ... komentuje:"
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
function extractCredits(src) {
  if (!src) return [];
  const text = String(src);
  const roleTokens = "(advokátka?|advokát|právník|právnička)";
  const namePart = "[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-Za-zÁ-ž'’.-]+";
  const fullName = `${namePart}(?:\\s+${namePart})+`;
  const roleNameRe = new RegExp(`${roleTokens}\\s+(${fullName})`, "gi");
  const companyRe = /Spring\s*Walk|Springwalk/i;
  const found = [];
  let m;
  while((m = roleNameRe.exec(text)) !== null){
    const role = (m[1] || m[0]).toLowerCase();
    const name = (m[2] || "").trim();
    const start = m.index;
    const windowAfter = text.slice(start, Math.min(text.length, start + 250));
    const windowBefore = text.slice(Math.max(0, start - 250), start);
    if (companyRe.test(windowAfter) || companyRe.test(windowBefore)) {
      found.push({
        role,
        name
      });
    }
  }
  // Fallback: „Jméno Příjmení … Spring Walk“
  if (found.length === 0) {
    const aroundCompanyRe = new RegExp(`(${fullName})\\s+(?:z\\s+advok[aá]tn[ií]\\s+kancel[aá][řr]e\\s+)?Spring\\s*Walk`, "i");
    const m2 = aroundCompanyRe.exec(text);
    if (m2) found.push({
      role: "advokát",
      name: m2[1].trim()
    });
  }
  const uniq = new Map();
  for (const c of found)if (!uniq.has(c.name.toLowerCase())) uniq.set(c.name.toLowerCase(), c);
  const credits = Array.from(uniq.values());
  console.log("Detected credits:", credits);
  return credits;
}
const cap = (s)=>s ? s[0].toUpperCase() + s.slice(1) : s;
function roleToPossessive(role) {
  const r = (role || "").toLowerCase();
  if (r.startsWith("advokátka") || r.startsWith("právnička")) return "Naše";
  return "Náš";
}
function roleToTitle(role) {
  const r = (role || "").toLowerCase();
  if (r.startsWith("advokátka")) return "advokátka";
  if (r.startsWith("právnička")) return "právnička";
  if (r.startsWith("právník")) return "právník";
  return "advokát";
}
function buildLead(credits) {
  if (!credits.length) return null;
  const c = credits[0];
  const poss = roleToPossessive(c.role);
  const title = roleToTitle(c.role);
  // méně suché, ale střídmé a faktické (ČAK-safe)
  return `${poss} ${title} ${c.name} (Springwalk) komentuje:`;
}
function forceLeadAtTop(text, lead) {
  if (!lead) return text;
  let out = String(text || "").replace(/\r/g, "");
  // Odstraň #springwalk z úplného začátku (hashtagy řeší klient)
  out = out.replace(/^#springwalk\s*\n+/i, "");
  const firstLine = out.split("\n")[0] || "";
  if (firstLine.toLowerCase().includes(lead.toLowerCase())) return out;
  return `${lead}\n\n${out}`.trim();
}
// ------- DB helpers -------
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
// ------- normalizer -------
function normalizeLi(text, link, min, max) {
  let out = String(text ?? "");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$2"); // markdown odkazy pryč
  out = out.replace(/[^\S\r\n]+/g, " ").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (link && !out.includes(link)) out += `\n\n${link}`;
  if (out.length > max + 100) {
    let cut = out.slice(0, max);
    const lastStop = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
    if (lastStop > min * 0.5) cut = cut.slice(0, lastStop + 1);
    out = cut.trim();
    if (link && !out.includes(link)) out += `\n\n${link}`;
  }
  return out;
}
// ------- server -------
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: CORS_HEADERS
  });
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS
    });
    const body = await req.json();
    const target = LENGTH_TARGETS[body.length?.toLowerCase?.()] ?? LENGTH_TARGETS["krátká"];
    const projectId = await getOrCreateProjectId(body.project_name, body.project_id);
    const credits = extractCredits(body.source_text);
    const lead = buildLead(credits); // "Náš/Naše {role} {jméno} (Springwalk) komentuje:"
    const sys = `You are a Czech copywriter for a law firm (advokátní kancelář Springwalk).
- Channel: LinkedIn (short).
- Write in Czech.
- COMPLIANCE (ČAK): edukativní, střídmé, pravdivé, žádné garance výsledků, žádná agresivní CTA.
- NO markdown, NO emoji. Plain text only.`;
    const user = `Napiš LinkedIn příspěvek BEZ MARKDOWNU A BEZ EMOJI, čistý text.

Formát:
- Úplně PRVNÍ řádek MUSÍ být přesně tento (pokud je definován): "${lead ?? ""}"
- Dále 1–2 krátké odstavce NEBO max. 3 odrážky s pomlčkou (- ).
- Nepoužívej [text](odkaz) formát. Vlož POUZE holou URL.
- Drž se cílové délky ${target.min}–${target.max} znaků (ne víc).
- Paragrafy odděluj prázdným řádkem.

Tone of voice (může obsahovat kombinace, použij je vyváženě): ${body.tone}
Klíčová slova: ${body.keywords}

Zdrojový text (použij jen jako podklad, nic neslibuj):
${body.source_text}

Povinný odkaz vlož v holé podobě: ${body.link_url}`;
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
        max_tokens: 600
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
    let output = aiJson?.choices?.[0]?.message?.content ?? "";
    output = normalizeLi(output, body.link_url, target.min, target.max);
    output = forceLeadAtTop(output, lead); // vynucení 1. řádku
    const { error: dbErr } = await supabase.from("drafts").insert({
      project_id: projectId,
      channel: "LinkedIn",
      content: output,
      status: "draft"
    });
    if (dbErr) return new Response(`DB error: ${dbErr.message}`, {
      status: 500,
      headers: CORS_HEADERS
    });
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
