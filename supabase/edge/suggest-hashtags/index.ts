// supabase edge function: suggest-hashtags
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
function sanitizeHash(tag) {
  // bez diakritiky a mezer → jednoduchá ASCII varianta
  const map = {
    á: "a",
    č: "c",
    ď: "d",
    é: "e",
    ě: "e",
    í: "i",
    ň: "n",
    ó: "o",
    ř: "r",
    š: "s",
    ť: "t",
    ú: "u",
    ů: "u",
    ý: "y",
    ž: "z",
    Á: "A",
    Č: "C",
    Ď: "D",
    É: "E",
    Ě: "E",
    Í: "I",
    Ň: "N",
    Ó: "O",
    Ř: "R",
    Š: "S",
    Ť: "T",
    Ú: "U",
    Ů: "U",
    Ý: "Y",
    Ž: "Z"
  };
  let s = tag.trim().replace(/^#+/, "");
  s = s.replace(/[^\w ]/g, (c)=>map[c] ?? ""); // odstran speciální znaky
  s = s.replace(/\s+/g, ""); // žádné mezery
  if (!s) return "";
  s = s.toLowerCase();
  if (s.length > 28) s = s.slice(0, 28);
  return "#" + s;
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
    const count = Math.min(Math.max(body.count ?? 3, 1), 5);
    const sys = `You suggest concise, neutral, compliant hashtags for a Czech law firm.
Rules:
- Return ONLY a JSON object: {"hashtags":["#tag1","#tag2","#tag3"]}.
- Do NOT include "#springwalk".
- LinkedIn style: ASCII only, no spaces, lower case, short (<= 28 chars), neutral (no promises, no sensationalism).`;
    const user = `Text to base hashtags on ( Czech ): 
${body.content}

Channel: ${body.channel}
Need exactly ${count} relevant hashtags.`;
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
        temperature: 0.3,
        max_tokens: 120,
        response_format: {
          type: "json_object"
        }
      })
    });
    const json = await aiResp.json();
    if (!aiResp.ok) {
      const msg = json?.error?.message ?? JSON.stringify(json);
      return new Response(`OpenAI error: ${msg}`, {
        status: 502,
        headers: CORS
      });
    }
    let tags = [];
    try {
      tags = JSON.parse(json.choices?.[0]?.message?.content ?? "{}").hashtags ?? [];
    } catch  {}
    tags = Array.isArray(tags) ? tags : [];
    // sanitize + dedupe + ořízni na požadovaný počet
    const clean = Array.from(new Set(tags.map(sanitizeHash).filter(Boolean))).slice(0, count);
    return new Response(JSON.stringify({
      hashtags: clean
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
