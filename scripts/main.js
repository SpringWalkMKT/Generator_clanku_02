// scripts/main.js
// Milestone A – kanály, validace, presety per kanál

(() => {
  const $ = (id) => document.getElementById(id);
  const channelTabs = $('channelTabs');
  const sourceText = $('sourceText');
  const linkUrl = $('linkUrl');
  const lengthCode = $('lengthCode');
  const tov = $('tov');

  const igGenerateAlt = $('igGenerateAlt');
  const igAlt = $('igAlt');

  const blogMetaTitle = $('blogMetaTitle');
  const blogMetaDesc = $('blogMetaDesc');
  const blogInternalLinks = $('blogInternalLinks');
  const blogSeparateQuotes = $('blogSeparateQuotes');

  const presetSelect = $('presetSelect');
  const presetName = $('presetName');
  const presetSave = $('presetSave');
  const presetDelete = $('presetDelete');
  const presetExport = $('presetExport');
  const presetImport = $('presetImport');
  const presetImportBtn = $('presetImportBtn');

  const btnGenerate = $('btnGenerate');
  const btnValidate = $('btnValidate');
  const btnSaveDraft = $('btnSaveDraft');
  const btnSuggestHashtags = $('btnSuggestHashtags');

  const output = $('output');
  const hashtags = $('hashtags');
  const validationState = $('validationState');

  const SUPABASE_URL = window.APP_CONFIG?.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.APP_CONFIG?.SUPABASE_ANON_KEY;

  let currentChannel = 'linkedin';

  const lengthMap = {
    vk: { min: 220, max: 420 },
    k:  { min: 420, max: 900 },
    s:  { min: 900, max: 1500 },
    d:  { min: 1500, max: 2400 },
    vd: { min: 2400, max: 3000 }
  };

  function setChannel(ch) {
    currentChannel = ch;

    // UI tabs
    [...channelTabs.querySelectorAll('.tab')].forEach(el => {
      el.classList.toggle('active', el.dataset.channel === ch);
    });

    // Scope blocks
    document.querySelectorAll('#channelOptions .scoped').forEach(el => {
      const scope = (el.getAttribute('data-channel-scope') || '').split(/\s+/);
      el.style.display = scope.includes(ch) ? '' : 'none';
    });

    // Re-list presets for this channel
    refreshPresets();
  }

  // Tabs init
  channelTabs.addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    setChannel(t.dataset.channel);
  });

  setChannel('linkedin');

  // --- Presety per kanál (Supabase REST přes edge nebo DB) ---
  async function fetchPresets() {
    // jednoduchý listing přes /rest v Supabase by vyžadoval RLS + policies; zde zavoláme existující edge (doporučeno)
    // Pro jednoduchost použijeme SELECT RPC vyřešené v backendu (nepovinné).
    // Jako fallback ukážeme základní fetch přes supa REST (pokud máš policies hotové):
    const url = `${SUPABASE_URL}/rest/v1/presets?select=*&channel=eq.${currentChannel}&order=name.asc`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    if (!res.ok) return [];
    return await res.json();
  }

  async function refreshPresets() {
    presetSelect.innerHTML = '';
    const list = await fetchPresets();
    list.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      opt.dataset.tov = p.tov || '';
      opt.dataset.lengthCode = p.length_code || 'k';
      presetSelect.appendChild(opt);
    });
  }
  refreshPresets();

  function readPresetFromUI() {
    return {
      name: presetName.value?.trim(),
      channel: currentChannel,
      tov: [...tov.selectedOptions].map(o => o.value).join(' + '),
      lengthCode: lengthCode.value
    };
  }

  async function upsertPreset() {
    const p = readPresetFromUI();
    if (!p.name) { alert('Zadej název presetu.'); return; }
    const body = [{ name: p.name, channel: p.channel, tov: p.tov, length_code: p.lengthCode }];
    const url = `${SUPABASE_URL}/rest/v1/presets`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) { alert('Nepodařilo se uložit preset.'); return; }
    await refreshPresets();
  }

  async function deletePreset() {
    const id = presetSelect.value;
    if (!id) { alert('Vyber preset.'); return; }
    const url = `${SUPABASE_URL}/rest/v1/presets?id=eq.${id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) { alert('Smazání se nepodařilo.'); return; }
    await refreshPresets();
  }

  function applyPresetToUI() {
    const opt = presetSelect.selectedOptions[0];
    if (!opt) return;
    // TOV
    const vals = (opt.dataset.tov || '').split(' + ').filter(Boolean);
    [...tov.options].forEach(o => o.selected = vals.includes(o.value));
    // Length
    lengthCode.value = opt.dataset.lengthCode || 'k';
  }

  presetSelect.addEventListener('change', applyPresetToUI);
  presetSave.addEventListener('click', upsertPreset);
  presetDelete.addEventListener('click', deletePreset);

  // Export/Import JSON presetů
  presetExport.addEventListener('click', async () => {
    const allChannels = ['linkedin','facebook','instagram','blog'];
    const result = [];
    for (const ch of allChannels) {
      const url = `${SUPABASE_URL}/rest/v1/presets?select=*&channel=eq.${ch}`;
      const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
      if (res.ok) {
        const arr = await res.json();
        for (const p of arr) result.push({ name: p.name, channel: p.channel, tov: p.tov, lengthCode: p.length_code });
      }
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'presets.json'; a.click();
    URL.revokeObjectURL(url);
  });

  presetImportBtn.addEventListener('click', async () => {
    try {
      const items = JSON.parse(presetImport.value);
      if (!Array.isArray(items)) throw new Error('Není to pole.');
      const url = `${SUPABASE_URL}/rest/v1/presets`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify(items.map(p => ({
          name: p.name,
          channel: p.channel || 'linkedin',
          tov: p.tov || '',
          length_code: p.lengthCode || 'k'
        })))
      });
      if (!res.ok) throw new Error('Import selhal.');
      await refreshPresets();
      alert('Import hotov.');
    } catch (e) {
      alert('Chyba importu: ' + e.message);
    }
  });

  // --- Payload helpery ---
  function buildLengthHint(code) {
    return lengthMap[code] || lengthMap.k;
  }

  function buildPayload() {
    const payload = {
      channel: currentChannel,
      source_text: sourceText.value || '',
      link: linkUrl.value || '',
      tov: [...tov.selectedOptions].map(o => o.value).join(' + '),
      length_code: lengthCode.value,
      length_hint: buildLengthHint(lengthCode.value),
      options: {}
    };
    if (currentChannel === 'instagram') {
      payload.options.generate_alt = !!igGenerateAlt?.checked;
    }
    if (currentChannel === 'blog') {
      payload.options.meta_title = blogMetaTitle.value || '';
      payload.options.meta_description = blogMetaDesc.value || '';
      payload.options.internal_links = (blogInternalLinks.value || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      payload.options.separate_quotes = !!blogSeparateQuotes?.checked;
    }
    return payload;
  }

  // --- Akce: Generate / Validate / Save Draft / Hashtags ---
  btnGenerate.addEventListener('click', async () => {
    const payload = buildPayload();
    const url = `${SUPABASE_URL}/functions/v1/generate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { output.value = 'Chyba generate()'; return; }
    const data = await res.json();
    output.value = data.text || '';
    hashtags.value = (data.hashtags || []).join(' ');
    if (currentChannel === 'instagram' && data.alt_text) {
      igAlt.value = data.alt_text;
      igAlt.removeAttribute('readonly');
    }
    if (currentChannel === 'blog' && data.meta) {
      blogMetaTitle.value = data.meta.title || '';
      blogMetaDesc.value = data.meta.description || '';
    }
  });

  btnValidate.addEventListener('click', async () => {
    const payload = {
      channel: currentChannel,
      text: output.value || '',
      link: linkUrl.value || '',
      hashtags: hashtags.value || '',
      meta: (currentChannel==='blog') ? {
        title: blogMetaTitle.value || '',
        description: blogMetaDesc.value || ''
      } : null
    };
    const url = `${SUPABASE_URL}/functions/v1/validate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { validationState.value = 'Chyba validace'; return; }
    const data = await res.json();
    validationState.value = data.ok ? 'OK' : `CHYBY: ${data.issues.join('; ')}`;
  });

  btnSaveDraft.addEventListener('click', async () => {
    const url = `${SUPABASE_URL}/functions/v1/save-draft`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: currentChannel,
        text: output.value || '',
        hashtags: hashtags.value || '',
        meta: (currentChannel==='blog') ? { title: blogMetaTitle.value || '', description: blogMetaDesc.value || '' } : null
      })
    });
    alert(res.ok ? 'Draft uložen.' : 'Chyba při ukládání draftu.');
  });

  btnSuggestHashtags.addEventListener('click', async () => {
    const url = `${SUPABASE_URL}/functions/v1/suggest-hashtags`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: currentChannel, text: output.value || sourceText.value || '' })
    });
    if (!res.ok) { alert('Chyba suggest-hashtags'); return; }
    const data = await res.json();
    const uniq = Array.from(new Set(['#springwalk', ...(data.hashtags || [])]));
    hashtags.value = uniq.join(' ');
  });

})();
