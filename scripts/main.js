// scripts/main.js
(function () {
  const BUILD = "main.js v2025-10-09-recover2";
  console.log("%c[Springwalk] Boot", "color:#0a0; font-weight:bold;", BUILD);

  // ===== DOM helpers =====
  const $ = (id) => document.getElementById(id);

  function must(el, id) {
    if (!el) throw new Error(`DOM element #${id} not found`);
    return el;
  }

  function showOutput(text) {
    const pre = must($("output"), "output");
    const ed  = must($("outputEdit"), "outputEdit");
    pre.textContent = text || "";
    if (ed.style.display !== "none") ed.value = pre.textContent;
  }

  function getOutputText() {
    const pre = must($("output"), "output");
    const ed  = must($("outputEdit"), "outputEdit");
    return ed.style.display === "none" ? pre.textContent : ed.value;
  }

  function showChecks(res) {
    const box = must($("checks"), "checks");
    if (!res) { box.textContent = ""; return; }
    const { issues = [], warnings = [], length } = res;
    let txt = `Délka: ${length} znaků\n`;
    if (issues.length)   txt += `❌ Nutné opravit:\n- ${issues.join("\n- ")}\n`;
    if (warnings.length) txt += `ℹ️ Doporučení:\n- ${warnings.join("\n- ")}\n`;
    if (!issues.length && !warnings.length) txt += "✅ V pořádku.";
    box.textContent = txt;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Zkopírováno do schránky.");
    } catch (e) {
      console.error(e);
      alert("Nepodařilo se kopírovat. Zkopíruj ručně.");
    }
  }

  // ===== Config =====
  function getConfig() {
    if (!window.APP_CONFIG) throw new Error("APP_CONFIG not found (scripts/config.js se nenačetl
