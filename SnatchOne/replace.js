const fs = require('fs');

const v2 = fs.readFileSync('c:/Users/trekken/Desktop/SnatchAll_v2/content.js', 'utf8');
const v2Start = v2.lastIndexOf('// ════', v2.indexOf('// 4. CONTENT EARNINGS PANEL'));
const v2End = v2.indexOf('function initNativeComponents()');
let v2Code = v2.substring(v2Start, v2End);

v2Code = v2Code.replace(
  /return document\.querySelector\('\[class\^="Paid_clmn_4_block_list"\]'\);/g,
  "const portal = document.querySelector('.ah-earnings-portal'); if (portal) portal.style.display = 'none'; return portal ? portal.parentElement : null;"
);

v2Code = v2Code.replace(
  /target\.insertBefore\(this\.root, target\.firstChild\);/g,
  "const portal = document.querySelector('.ah-earnings-portal'); if (portal) target.insertBefore(this.root, portal); else target.insertBefore(this.root, target.firstChild);"
);

const v1 = fs.readFileSync('c:/Users/trekken/Desktop/SnatchOne/content.js', 'utf8');
const v1Start = v1.lastIndexOf('// ════', v1.indexOf('(function initEarningsPanelHooks() {'));
const v1End = v1.lastIndexOf('// ════', v1.indexOf('(function initChatLimitsRefresh() {'));

const diagStart = v1.indexOf('  // Счётчик диалогов от сервера');
const diagEnd = v1.indexOf('// Обновляем счётчик при изменении storage');
let diagCode = v1.substring(diagStart, diagEnd);

diagCode = diagCode.replace(
  /const portal = document\.querySelector\('\\.ah-earnings-portal'\);/g,
  "const portal = document.querySelector('.sne-earn');"
);
diagCode = diagCode.replace(
  /for \(const el of portal\.querySelectorAll\('\\*'\)\) \{[\s\S]*?if \(\!dateEl\) return;/g,
  "const dateEl = portal.querySelector('#sne-date'); if (!dateEl) return;"
);

const newBlock = v2Code + '\n' +
'// ═══════════════════════════════════════════════════════════\n' +
'// DIALOGS COUNTER (SnatchOne custom)\n' +
'// ═══════════════════════════════════════════════════════════\n' +
'(function initDialogsCounter() {\n' +
diagCode + '\n' +
'  chrome.storage.onChanged.addListener((changes, area) => {\n' +
'    if (area === "local" && ("snDialogsFound" in changes || "ahRunning" in changes || "snLastStatsTime" in changes)) {\n' +
'      updateDialogsCounter();\n' +
'    }\n' +
'  });\n\n' +
'  const obs = new MutationObserver(() => {\n' +
'    injectDialogsCounter();\n' +
'  });\n' +
'  obs.observe(document.body, { childList: true, subtree: true });\n\n' +
'  setInterval(updateDialogsCounter, 10000);\n' +
'})();\n\n' +
'if (document.readyState === "loading") {\n' +
'  document.addEventListener("DOMContentLoaded", () => { setTimeout(() => new ContentEarningsPanelWidget(), 500); });\n' +
'} else {\n' +
'  setTimeout(() => new ContentEarningsPanelWidget(), 500);\n' +
'}\n\n';

const finalCode = v1.substring(0, v1Start) + newBlock + v1.substring(v1End);
fs.writeFileSync('c:/Users/trekken/Desktop/SnatchOne/content.js', finalCode);
console.log('REPLACEMENT SUCCESSFUL');