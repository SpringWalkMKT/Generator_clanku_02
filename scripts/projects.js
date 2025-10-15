// v1.3.0 – přehled uložených projektů/draftů (funkční, bez stylů)

(function () {
  function resolveSupabaseConfig() {
    const fromWin = (key) => (typeof window !== "undefined" && window[key]) ? window[key] : null;
    return {
      url: fromWin("SUPABASE_URL") || fromWin("supabaseUrl") || fromWin("__SUPABASE_URL__") || "https://tufuymtiiwlsariamnul.supabase.co",
      key: fromWin("SUPABASE_ANON_KEY") || fromWin("supabaseAnonKey") || fromWin("__SUPABASE_ANON_KEY__") || ""
    };
  }

  async function callEdge(name, payload) {
    const { url, key } = resolveSupabaseConfig();
    const endpoint = `${url}/functions/v1/${name}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "apikey": key, "Authorization": `Bearer ${key}` } : {})
      },
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) {
      throw new Error(`${name} ${res.status}: ${await res.text().catch(()=> "")}`);
    }
    return res.json().catch(()=> ({}));
  }

  function el(tag, attrs = {}, text = "") {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "dataset" && v && typeof v === "object") {
        Object.entries(v).forEach(([dk, dv]) => n.dataset[dk] = dv);
      } else if (k in n) {
        n[k] = v;
      } else {
        n.setAttribute(k, v);
      }
    }
    if (text) n.textContent = text;
    return n;
  }

  function groupBy(arr, key) {
    const map = new Map();
    for (const it of arr) {
      const k = (typeof key === "function") ? key(it) : it[key];
      const kk = String(k ?? "—");
      if (!map.has(kk)) map.set(kk, []);
      map.get(kk).push(it);
    }
    return map;
  }

  function renderList(container, items) {
    container.innerHTML = "";
    if (!items || !items.length) {
      container.appendChild(el("p", {}, "Nic nenalezeno."));
      return;
    }

    const byProject = groupBy(items, "project_name");
    for (const [project, rows] of byProject.entries()) {
      const wrap = el("section");
      wrap.appendChild(el("h2", {}, project));

      const byChannel = groupBy(rows, "channel");
      for (const [ch, rlist] of byChannel.entries()) {
        wrap.appendChild(el("h3", {}, ch));
        const ul = el("ul");
        for (const r of rlist) {
          const li = el("li");
          const meta = [
            r.version_label ? `verze: ${r.version_label}` : null,
            r.created_at ? new Date(r.created_at).toLocaleString() : null,
            r.link_url ? `link: ${r.link_url}` : null
          ].filter(Boolean).join(" • ");

          const summary = el("details");
          const sum = el("summary", {}, meta || "(bez metadat)");
          const pre = el("pre");
          pre.textContent = (r.content || r.caption || JSON.stringify(r.blog_json || r, null, 2) || "").toString();
          summary.appendChild(sum);
          summary.appendChild(pre);

          li.appendChild(summary);
          ul.appendChild(li);
        }
        wrap.appendChild(ul);
      }

      container.appendChild(wrap);
    }
  }

  async function load() {
    const status = document.getElementById("status");
    const list = document.getElementById("list");
    const filter = document.getElementById("projectFilter");
    status.textContent = "Načítám…";

    const filterName = (filter && filter.value || "").trim();
    const payload = filterName ? { project_name: filterName } : {}; // adaptivně – pokud edge function 'drafts' podporuje filtr

    try {
      const resp = await callEdge("drafts", payload);
      // očekáváme pole draftů; pokud přijde objekt, zkus pole z klíče data
      const items = Array.isArray(resp) ? resp : (Array.isArray(resp?.data) ? resp.data : []);
      renderList(list, items);
      status.textContent = `Nalezeno: ${items.length}`;
    } catch (e) {
      console.error(e);
      status.textContent = "Chyba načítání: " + (e?.message || e);
    }
  }

  function init() {
    const btn = document.getElementById("refreshBtn");
    if (btn && !btn.__bound) {
      btn.addEventListener("click", load);
      btn.__bound = true;
    }
    const input = document.getElementById("projectFilter");
    if (input && !input.__bound) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") load();
      });
      input.__bound = true;
    }
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
