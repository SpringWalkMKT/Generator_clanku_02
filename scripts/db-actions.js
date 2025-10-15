// v1.3.0 – akce: Uložit do DB + odkaz na přehled (funkční, bez stylů; nezasahuje do stávající logiky)

(function () {
  function resolveSupabaseConfig() {
    const fromWin = (k) => (typeof window !== "undefined" && window[k]) ? window[k] : null;
    return {
      url: fromWin("SUPABASE_URL") || fromWin("supabaseUrl") || fromWin("__SUPABASE_URL__") || "https://tufuymtiiwlsariamnul.supabase.co",
      key: fromWin("SUPABASE_ANON_KEY") || fromWin("supabaseAnonKey") || fromWin("__SUPABASE_ANON_KEY__") || ""
    };
  }

  async function callEdge(name, payload) {
    const { url, key } = resolveSupabaseConfig();
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "apikey": key, "Authorization": `Bearer ${key}` } : {})
      },
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) throw new Error(`${name} ${res.status}: ${await res.text().catch(()=> "")}`);
    return res.json().catch(()=> ({}));
  }

  function getProjectName() {
    const byId = document.getElementById("project_name") || document.getElementById("projectName");
    if (byId?.value) return byId.value.trim();
    const byName = document.querySelector('[name="project_name"]');
    if (byName?.value) return byName.value.trim();
    const ds = document.documentElement?.dataset?.projectName;
    return (ds || "").trim();
  }

  function getChannel() {
    const sel = document.getElementById("channel") || document.querySelector('select[name="channel"]');
    if (sel?.value) return sel.value;
    const active = document.querySelector('[data-channel].active, [data-channel][aria-pressed="true"]');
    return active?.getAttribute("data-channel") || "LinkedIn";
  }

  function getVisibleOutputForChannel(channel) {
    if (typeof window.getOutputText === "function") {
      try { const t = window.getOutputText(channel); if (t) return String(t).trim(); } catch {}
    }
    const ta = document.querySelector('#output, #result, textarea[name="output"], textarea#finalOutput');
    if (ta?.value?.trim()) return ta.value.trim();
    const pre = document.querySelector('#outputPre, #finalOutputPre, pre#finalOutput');
    if (pre?.textContent?.trim()) return pre.textContent.trim();
    const pv = document.querySelector('.preview, .result, .generated');
    if (pv?.textContent?.trim()) return pv.textContent.trim();
    const byId = document.getElementById(`output_${channel}`);
    if (byId?.textContent?.trim()) return byId.textContent.trim();
    return "";
  }

  async function saveToDb() {
    const project_name = getProjectName();
    if (!project_name) { alert('Zadej prosím "Název projektu" (project_name) před uložením.'); return; }

    const channel = getChannel();
    const content = getVisibleOutputForChannel(channel);
    if (!content) { alert("Nenalezl jsem žádný vygenerovaný obsah k uložení."); return; }

    const version_label = prompt("Volitelně uveď verzi/poznámku (např. 'LinkedIn – účet A'):", "") || "";

    // Pokud app už má interní API na uložení, použij ho přednostně
    if (window.api && typeof window.api.saveDraft === "function") {
      try {
        await window.api.saveDraft({ project_name, channel, content, version_label });
        alert("Uloženo do databáze.");
        return;
      } catch (e) {
        console.warn("api.saveDraft selhalo, zkouším edge function:", e);
      }
    }

    // Fallback: přímé volání edge function save-draft (adaptivní)
    try {
      await callEdge("save-draft", { project_name, channel, content, version_label });
      alert("Uloženo do databáze.");
    } catch (e) {
      console.error(e);
      alert("Uložení selhalo: " + (e?.message || e));
    }
  }

  function init() {
    const btn = document.getElementById("btnSaveToDb");
    if (btn && !btn.__bound) { btn.addEventListener("click", saveToDb); btn.__bound = true; }
    // odkaz na projects.html je statický <a>, není třeba JS logiky
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
