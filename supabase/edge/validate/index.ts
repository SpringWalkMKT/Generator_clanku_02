import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: CORS
  });
  if (req.method !== "POST") return new Response("Method Not Allowed", {
    status: 405,
    headers: CORS
  });
  const body = await req.json();
  const issues = [], warnings = [];
  const len = body.content.length;
  if ([
    "LinkedIn",
    "Facebook",
    "Instagram"
  ].includes(body.channel) && !body.content.includes("#springwalk")) issues.push("Chybí #springwalk.");
  if ([
    "LinkedIn",
    "Facebook",
    "Blog"
  ].includes(body.channel)) {
    if (!body.link_url || !body.content.includes(body.link_url)) issues.push("Chybí povinný odkaz na web.");
  } else if (body.channel === "Instagram" && !/link\s*v\s*bio/i.test(body.content)) {
    warnings.push("Instagram: připomeň „link v bio“.");
  }
  if (body.channel === "LinkedIn") {
    if (len > 3000) issues.push(`LinkedIn: text má ${len} znaků (limit ~3000).`);
    if (len < 800 || len > 1200) warnings.push("LinkedIn: doporučená délka 800–1200 znaků.");
  }
  const banned = /(garantujeme|zaručujeme|stoprocentní|100%\s*(výsledek|úspěch))/i;
  if (banned.test(body.content)) issues.push("Compliance: nepoužívej garance výsledků (ČAK).");
  return new Response(JSON.stringify({
    valid: issues.length === 0,
    issues,
    warnings,
    length: len
  }), {
    headers: {
      "Content-Type": "application/json",
      ...CORS
    }
  });
});
