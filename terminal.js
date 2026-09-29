// ══════════════════════════════════════════
//  Terminal In-Tab · terminal.js
//  Multi-tab, multi-pane terminal manager
// ══════════════════════════════════════════

const THEME_FIRE = {
  background:         '#120707',
  foreground:         '#fdf2f2',
  cursor:             '#ef4444',
  cursorAccent:       '#120707',
  selectionBackground:'#5c1f1f',
  black:   '#1e293b', brightBlack:   '#64748b',
  red:     '#ef4444', brightRed:     '#f87171',
  green:   '#22c55e', brightGreen:   '#4ade80',
  yellow:  '#eab308', brightYellow:  '#facc15',
  blue:    '#3b82f6', brightBlue:    '#60a5fa',
  magenta: '#a855f7', brightMagenta: '#c084fc',
  cyan:    '#06b6d4', brightCyan:    '#22d3ee',
  white:   '#cbd5e1', brightWhite:   '#f1f5f9'
};

const THEME_ICE = {
  background:         '#050b14',
  foreground:         '#eaf6ff',
  cursor:             '#38bdf8',
  cursorAccent:       '#050b14',
  selectionBackground:'#1e3a5f',
  black:   '#0f172a', brightBlack:   '#475569',
  red:     '#f87171', brightRed:     '#fca5a5',
  green:   '#34d399', brightGreen:   '#6ee7b7',
  yellow:  '#fbbf24', brightYellow:  '#fde047',
  blue:    '#38bdf8', brightBlue:    '#7dd3fc',
  magenta: '#a78bfa', brightMagenta: '#c4b5fd',
  cyan:    '#22d3ee', brightCyan:    '#67e8f9',
  white:   '#e2e8f0', brightWhite:   '#f8fafc'
};

// "Aura Api" (fire, default) dan "Aura Es" (ice/biru) - pilihan tema dari menu
// Pengaturan. Kunci di sini HARUS cocok dengan data-theme-choice di terminal.html
// dan atribut [data-theme] yang dipakai CSS untuk swap palet warna UI.
const THEMES = { 'aura-api': THEME_FIRE, 'aura-es': THEME_ICE };
const THEME_STORAGE_KEY = 'terminalInTab.themeName';

// Dibaca & diterapkan ke <html data-theme="..."> SEBELUM DOM lain sempat dirender
// (script ini dimuat di akhir <body>, jadi elemen <html> sudah ada tapi belum
// di-paint) - localStorage dipakai (bukan chrome.storage.local) justru karena
// sinkron, sehingga tidak ada kedipan tema salah sesaat sebelum async storage
// selesai dibaca.
let currentThemeName = 'aura-api';
try {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (THEMES[saved]) currentThemeName = saved;
} catch (e) {}
document.documentElement.setAttribute('data-theme', currentThemeName);

// ── Terminal transparency/blur ("seperti config Zsh") ──
// Off by default (same default-off pattern as Auto Enter/Y - an opt-in visual
// feature, not a silent behavior change). Opacity is the single knob; blur
// radius is fixed in CSS (html[data-term-transparent] .pane in terminal.html).
const TERM_TRANSPARENT_KEY = 'terminalInTab.termTransparent';
const TERM_OPACITY_KEY = 'terminalInTab.termOpacity';
let termTransparentEnabled = false;
let termOpacityPercent = 85;
try {
  termTransparentEnabled = localStorage.getItem(TERM_TRANSPARENT_KEY) === '1';
  const savedOpacity = parseInt(localStorage.getItem(TERM_OPACITY_KEY), 10);
  if (!Number.isNaN(savedOpacity)) termOpacityPercent = Math.max(30, Math.min(100, savedOpacity));
} catch (e) {}
document.documentElement.toggleAttribute('data-term-transparent', termTransparentEnabled);
document.documentElement.style.setProperty('--term-bg-alpha', (termOpacityPercent / 100).toFixed(2));

function hexToRgbTriplet(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)).join(',');
}

// ── Mode Hemat Performa (untuk laptop murah/lemah, mis. saat CLI berat seperti
// Claude Code sering redraw seluruh layar) — OFF by default, jadi tampilan
// default TIDAK berubah sama sekali sampai pengguna sendiri yang menyalakan.
// Yang dimatikan saat aktif: animasi ambient (flame/aura, status-ring, pulse
// tombol auto-mode) yang terus jalan di compositor walau tidak krusial, blur
// transparansi (--term-bg-alpha/tint tetap ada, cuma backdrop-filter-nya yang
// mahal di GPU lemah yang dilepas), dan cursor blink (satu timer repaint per
// panel yang terbuka). Semua ini murni CSS/opsi xterm yang bisa dibalik kapan
// saja - tidak ada fitur yang dihapus, cuma kerja compositor yang dikurangi.
const PERF_MODE_KEY = 'terminalInTab.perfMode';
let perfModeEnabled = false;
try {
  perfModeEnabled = localStorage.getItem(PERF_MODE_KEY) === '1';
} catch (e) {}
document.documentElement.toggleAttribute('data-perf-mode', perfModeEnabled);

// Komposisi tema xterm aktual yang dipakai tiap panel. Saat mode transparan
// aktif, background xterm SENDIRI dibuat alpha 0 (tembus total) - bukan
// ikut membawa alpha slider - supaya satu-satunya lapisan yang mewarnai latar
// terminal adalah CSS .pane-body (lihat terminal.html). Kalau dua lapisan
// (xterm + pane-body) sama-sama membawa alpha, area yang tertutup grid xterm
// jadi lebih pekat/gelap daripada sisa piksel yang tidak tertutup grid
// (pembulatan baris/kolom fitAddon nyaris tidak pernah pas persis dengan
// ukuran kontainer) - persis keluhan "terminal tidak pas dengan border".
function composeXtermTheme(name) {
  const base = THEMES[name] || THEME_FIRE;
  if (!termTransparentEnabled) return base;
  return { ...base, background: `rgba(${hexToRgbTriplet(base.background)},0)` };
}

const SHELL_LABELS = {
  'powershell.exe': 'Windows PS',
  'pwsh.exe':       'PowerShell 7',
  'cmd.exe':        'CMD',
  'ubuntu-wsl':     'Ubuntu (WSL)'
};

const SHELL_ICONS = {
  'powershell.exe': '🪟',
  'pwsh.exe':       '❤️',
  'cmd.exe':        '⬛',
  'ubuntu-wsl':     '🐧'
};

const hostName = 'com.antigravity.terminal';

const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 13.5;

// ══════════════════════════════════════════
//  Auto-respond ("Auto Enter/Y") — deteksi prompt CLI yang menunggu
//  konfirmasi (dipakai AI CLI seperti Antigravity/Claude Code/Gemini CLI)
//  dan otomatis kirim jawabannya, kecuali terdeteksi kata berisiko.
// ══════════════════════════════════════════
const AUTO_RESPOND_DEBOUNCE_MS = 450;
// TUI kaya seperti Claude Code (Ink) menggambar ulang seluruh frame (border,
// riwayat percakapan, footer) tiap update, jadi ini disengaja jauh lebih besar
// dari sekadar 1-2 baris prompt agar tidak kepotong sebelum sempat dicek.
const AUTO_RESPOND_BUFFER_MAX = 12000;
const ANSI_ESCAPE_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;
const AUTO_DANGER_RE = /\b(delete|hapus|dihapus|remove|removed|overwrite|ditimpa|force|paksa|permanent|permanen|irreversible|destroy|drop\s+database|rm\s+-rf)\b/i;
// Penunjuk opsi terpilih beda-beda tiap CLI: xterm.js "❯" (U+276F), tapi
// Claude Code CLI kadang merender ">" ASCII biasa tergantung dukungan Unicode
// terminal — keduanya harus dikenali, diikat ke awal baris + "yes" biar aman
// dari ">" yang muncul di teks lain (redirect, prompt shell, dsb).
const AUTO_MENU_YES_RE = /^[ \t]*[>❯»➤][ \t]*\d*\.?[ \t]*yes\b/im;
const AUTO_YESNO_RE = /\(y\/n\)|\[y\/n\]|\(yes\/no\)/i;
const AUTO_ENTER_RE = /press enter to continue|tekan enter (untuk|buat) lanjut/i;
// Menu izin Claude Code ("Requesting permission for: ... Do you want to proceed?")
// selalu naruh "Yes" polos di opsi 1 — begitu frasa ini muncul, Enter kosong
// (pilih default opsi 1) sudah cukup, tak perlu bergantung pada bentuk panahnya.
const AUTO_PROCEED_RE = /do you want to (proceed|continue)\?|apakah (anda|kamu) (ingin|mau) (lanjut|melanjutkan)\??/i;

// ── Tab state ────────────────────────────────
// Each tab owns its own workspace DOM (cloned from #workspace-template) and its own
// pane set - independent terminal sessions living inside ONE browser tab, switched
// via the tab strip (like Windows Terminal / PowerShell 7's tabs), as opposed to
// btn-new-tab-in-browser which used to open a whole new browser tab.
const tabs = {};
const tabOrder = [];
let activeTabId = null;
let nextTabId = 1;

// ── Shell modal state ───────────────────────
let modalResolve = null;

// ── Split-resizer drag state (shared across tabs; only one drag happens at a time) ──
let dragState = null;

// ── DOM refs ────────────────────────────────
const tabList         = document.getElementById('tab-list');
const btnAddTab       = document.getElementById('btn-add-tab');
const workspaceRoot   = document.getElementById('workspace-root');
const workspaceTemplate = document.getElementById('workspace-template');
const btnSplit        = document.getElementById('btn-split');
const btnShell1       = document.getElementById('btn-shell-1');
const btnShell2       = document.getElementById('btn-shell-2');
const btnClear        = document.getElementById('btn-clear');
const btnFullscreen   = document.getElementById('btn-fullscreen');
const btnToggleTabs   = document.getElementById('btn-toggle-tabs');
const btnFileExplorer = document.getElementById('btn-file-explorer');
const btnSettings        = document.getElementById('btn-settings');
const settingsOverlay    = document.getElementById('settings-modal-overlay');
const settingsClose      = document.getElementById('settings-close');
const themeOptionEls     = document.querySelectorAll('.theme-option');
const termTransparentToggle = document.getElementById('term-transparent-toggle');
const termOpacitySlider     = document.getElementById('term-opacity-slider');
const termOpacityValue      = document.getElementById('term-opacity-value');
const opacityRow            = document.getElementById('opacity-row');
const perfModeToggle        = document.getElementById('perf-mode-toggle');
const tabStripEl      = document.getElementById('tab-strip');
const btnFontDec      = document.getElementById('btn-font-dec');
const btnFontInc      = document.getElementById('btn-font-inc');
const fontSizeLabel   = document.getElementById('font-size-label');
const overlay         = document.getElementById('shell-modal-overlay');
const modalCancel     = document.getElementById('modal-cancel');
const toastContainer  = document.getElementById('toast-container');

// ════════════════════════════════════════════
//  Toast notifications
// ════════════════════════════════════════════
function showToast(message, type = 'info', duration = 2600) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
  }, duration);
}

// ════════════════════════════════════════════
//  Settings modal — tema tampilan (Aura Api / Aura Es)
// ════════════════════════════════════════════
function updateThemeModalSelection() {
  themeOptionEls.forEach((el) => {
    el.classList.toggle('selected', el.dataset.themeChoice === currentThemeName);
  });
}

function applyTheme(name) {
  if (!THEMES[name]) name = 'aura-api';
  currentThemeName = name;
  document.documentElement.setAttribute('data-theme', name);

  // Panel yang sudah terbuka juga ikut berubah live, bukan cuma panel baru -
  // xterm.js menerima theme baru lewat setter options dan langsung re-render.
  const xtermTheme = composeXtermTheme(name);
  for (const tab of Object.values(tabs)) {
    for (const paneNum of [1, 2]) {
      const p = tab.panes[paneNum];
      if (p?.term) p.term.options.theme = xtermTheme;
    }
  }

  try { localStorage.setItem(THEME_STORAGE_KEY, name); } catch (e) {}
  updateThemeModalSelection();
}

function applyTermTransparency(enabled, percent) {
  termTransparentEnabled = enabled;
  termOpacityPercent = Math.max(30, Math.min(100, percent));

  document.documentElement.toggleAttribute('data-term-transparent', enabled);
  document.documentElement.style.setProperty('--term-bg-alpha', (termOpacityPercent / 100).toFixed(2));

  const xtermTheme = composeXtermTheme(currentThemeName);
  for (const tab of Object.values(tabs)) {
    for (const paneNum of [1, 2]) {
      const p = tab.panes[paneNum];
      if (p?.term) p.term.options.theme = xtermTheme;
    }
  }

  try {
    localStorage.setItem(TERM_TRANSPARENT_KEY, enabled ? '1' : '0');
    localStorage.setItem(TERM_OPACITY_KEY, String(termOpacityPercent));
  } catch (e) {}
}

function syncTransparencyControls() {
  termTransparentToggle.checked = termTransparentEnabled;
  termOpacitySlider.value = String(termOpacityPercent);
  termOpacityValue.textContent = `${termOpacityPercent}%`;
  opacityRow.classList.toggle('disabled', !termTransparentEnabled);
}

function applyPerfMode(enabled) {
  perfModeEnabled = enabled;
  document.documentElement.toggleAttribute('data-perf-mode', enabled);

  // Cursor blink adalah satu-satunya opsi xterm yang perlu didorong ulang ke
  // panel yang sudah terbuka - sisanya (aura, status-ring, pulse tombol auto,
  // blur transparansi) murni CSS lewat atribut [data-perf-mode] di atas.
  for (const tab of Object.values(tabs)) {
    for (const paneNum of [1, 2]) {
      const p = tab.panes[paneNum];
      if (p?.term) p.term.options.cursorBlink = !enabled;
    }
  }

  try { localStorage.setItem(PERF_MODE_KEY, enabled ? '1' : '0'); } catch (e) {}
}

themeOptionEls.forEach((el) => {
  el.addEventListener('click', () => applyTheme(el.dataset.themeChoice));
});

perfModeToggle.addEventListener('change', () => {
  applyPerfMode(perfModeToggle.checked);
  showToast(
    perfModeEnabled
      ? '🍃 Mode Hemat Performa diaktifkan (animasi & blur ambient dikurangi).'
      : 'Mode Hemat Performa dimatikan.',
    'info', 1800
  );
});

termTransparentToggle.addEventListener('change', () => {
  applyTermTransparency(termTransparentToggle.checked, termOpacityPercent);
  syncTransparencyControls();
  showToast(
    termTransparentEnabled ? '✨ Latar terminal transparan diaktifkan.' : 'Latar terminal transparan dimatikan.',
    'info', 1600
  );
});

termOpacitySlider.addEventListener('input', () => {
  applyTermTransparency(termTransparentEnabled, parseInt(termOpacitySlider.value, 10));
  termOpacityValue.textContent = `${termOpacityPercent}%`;
});

btnSettings.addEventListener('click', () => {
  updateThemeModalSelection();
  syncTransparencyControls();
  perfModeToggle.checked = perfModeEnabled;
  settingsOverlay.classList.add('show');
});
settingsClose.addEventListener('click', () => settingsOverlay.classList.remove('show'));
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove('show');
});

// ════════════════════════════════════════════
//  Shell picker modal
// ════════════════════════════════════════════
function openShellModal(titleSuffix) {
  return new Promise((resolve) => {
    modalResolve = resolve;
    document.getElementById('modal-title').textContent = `Pilih Shell — ${titleSuffix}`;
    overlay.classList.add('show');
  });
}

overlay.querySelectorAll('.shell-option').forEach(opt => {
  opt.addEventListener('click', () => {
    const shell = opt.dataset.shell;
    overlay.classList.remove('show');
    if (modalResolve) { modalResolve(shell); modalResolve = null; }
  });
});

modalCancel.addEventListener('click', () => {
  overlay.classList.remove('show');
  if (modalResolve) { modalResolve(null); modalResolve = null; }
});

// ════════════════════════════════════════════
//  Tab management
// ════════════════════════════════════════════
function createTerminalTab(shell) {
  const id = nextTabId++;
  const workspaceEl = workspaceTemplate.content.firstElementChild.cloneNode(true);
  workspaceRoot.appendChild(workspaceEl);

  const tabItemEl = document.createElement('div');
  tabItemEl.className = 'tab-item';
  tabItemEl.dataset.tabId = String(id);
  tabItemEl.innerHTML = `
    <span class="tab-icon">${SHELL_ICONS[shell] || '💻'}</span>
    <span class="tab-title">${SHELL_LABELS[shell] || shell}</span>
    <button class="tab-close" title="Tutup tab">×</button>
  `;
  tabList.appendChild(tabItemEl);

  const tab = { id, workspaceEl, tabItemEl, isSplit: false, activePaneId: 1, panes: {} };
  tabs[id] = tab;
  tabOrder.push(id);

  tabItemEl.addEventListener('click', (e) => {
    if (e.target.closest('.tab-close')) return;
    hideTabPreview();
    switchToTab(id);
  });
  tabItemEl.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    hideTabPreview();
    closeTab(id);
  });
  tabItemEl.addEventListener('mouseenter', () => showTabPreview(tab, tabItemEl));
  tabItemEl.addEventListener('mouseleave', hideTabPreview);

  setupTabWorkspace(tab);
  createPaneInTab(tab, 1, shell);
  switchToTab(id);
  return tab;
}

function updateTabStripLabel(tab) {
  const shell = tab.panes[1]?.shell;
  tab.tabItemEl.querySelector('.tab-icon').textContent = SHELL_ICONS[shell] || '💻';
  tab.tabItemEl.querySelector('.tab-title').textContent = SHELL_LABELS[shell] || shell;
}

function switchToTab(id) {
  if (activeTabId === id) return;
  const prev = tabs[activeTabId];
  if (prev) {
    prev.workspaceEl.classList.remove('active-tab');
    prev.tabItemEl.classList.remove('active');
  }
  const next = tabs[id];
  next.workspaceEl.classList.add('active-tab');
  next.tabItemEl.classList.add('active');
  activeTabId = id;

  updateToolbarForActiveTab();

  // Cheap safety net (tabs stay correctly sized even while inactive now, via
  // visibility:hidden instead of display:none) - covers edge cases like a resize
  // that happened while this tab wasn't the active one.
  requestAnimationFrame(() => {
    next.panes[1]?.resize();
    if (next.isSplit) next.panes[2]?.resize();
    next.panes[next.activePaneId]?.term.focus();
  });
}

function closeTab(id) {
  const tab = tabs[id];
  if (!tab) return;

  try { const port = tab.panes[1]?.port(); if (port) port.disconnect(); } catch (e) {}
  try { const port = tab.panes[2]?.port(); if (port) port.disconnect(); } catch (e) {}

  const wasActive = activeTabId === id;
  const idx = tabOrder.indexOf(id);
  tabOrder.splice(idx, 1);

  tab.workspaceEl.remove();
  tab.tabItemEl.remove();
  delete tabs[id];

  if (tabOrder.length === 0) {
    window.close();
    return;
  }

  if (wasActive) {
    const nextId = tabOrder[idx] ?? tabOrder[idx - 1] ?? tabOrder[tabOrder.length - 1];
    activeTabId = null;
    switchToTab(nextId);
  }
}

btnAddTab.addEventListener('click', async () => {
  const shell = await openShellModal('Tab Baru');
  if (!shell) return;
  createTerminalTab(shell);
  showToast(`Tab baru: ${SHELL_LABELS[shell] || shell}`, 'success');
});

// ════════════════════════════════════════════
//  Toolbar reflects whichever tab is currently active
// ════════════════════════════════════════════
function updateToolbarForActiveTab() {
  const tab = tabs[activeTabId];
  if (!tab) return;

  const shell1 = tab.panes[1]?.shell;
  document.getElementById('label-shell-1').textContent = `Panel 1: ${SHELL_LABELS[shell1] || shell1 || ''}`;

  btnShell2.style.display = tab.isSplit ? '' : 'none';
  if (tab.isSplit) {
    const shell2 = tab.panes[2]?.shell;
    document.getElementById('label-shell-2').textContent = `Panel 2: ${SHELL_LABELS[shell2] || shell2 || ''}`;
  }

  btnSplit.classList.toggle('active', tab.isSplit);
  updateFontSizeLabel();
}

function setActivePaneForTab(tab, paneNum) {
  tab.activePaneId = paneNum;
  tab.workspaceEl.querySelector('.pane[data-pane="1"]').classList.toggle('active', paneNum === 1);
  tab.workspaceEl.querySelector('.pane[data-pane="2"]').classList.toggle('active', paneNum === 2);
  if (tab.id === activeTabId) updateFontSizeLabel();
}

function updateFontSizeLabel() {
  const tab = tabs[activeTabId];
  const p = tab?.panes[tab.activePaneId];
  if (p) fontSizeLabel.textContent = p.state.fontSize.toFixed(1).replace(/\.0$/, '');
}

// ════════════════════════════════════════════
//  Create a terminal pane inside a given tab
// ════════════════════════════════════════════
function createPaneInTab(tab, paneNum, shell) {
  const paneEl       = tab.workspaceEl.querySelector(`.pane[data-pane="${paneNum}"]`);
  const container    = paneEl.querySelector('[data-role="term-container"]');
  const statusEl     = paneEl.querySelector('[data-role="status"]');
  const statusTextEl = paneEl.querySelector('[data-role="status-text"]');
  const badgeEl      = paneEl.querySelector('[data-role="badge"]');
  const loadingEl    = paneEl.querySelector('[data-role="loading"]');
  const autoBtnEl    = paneEl.querySelector('[data-role="auto-toggle"]');
  const enterBtnEl   = paneEl.querySelector('[data-role="enter-btn"]');

  const term = new Terminal({
    cursorBlink: !perfModeEnabled,
    theme: composeXtermTheme(currentThemeName),
    fontFamily: '"JetBrains Mono", Cascadia Code, Fira Code, Consolas, "Courier New", monospace',
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: 1.25,
    scrollback: 5000,
    allowTransparency: true
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();

  badgeEl.textContent = SHELL_LABELS[shell] || shell;
  statusTextEl.textContent = 'menghubungkan…';
  statusEl.className = 'pane-status connecting';
  loadingEl.classList.remove('hidden');

  // `state` dipakai bersama oleh term.onData dan connect() (termasuk saat reconnect
  // dari changeShell). port/ready TIDAK boleh jadi closure terpisah yang tak ter-update
  // saat reconnect, karena keystroke bisa terus terkirim ke koneksi lama yang terputus.
  const state = {
    port: null, ready: false, pendingInput: [], fontSize: DEFAULT_FONT_SIZE,
    autoMode: 'off', autoBuf: '', autoPending: false, autoWarned: false, lastAutoBuf: null
  };
  let firstOutputReceived = false;

  // Scan output baru untuk prompt yang menunggu konfirmasi (y/n, menu panah,
  // "press enter to continue") dan otomatis kirim jawabannya bila fitur aktif.
  // Mode 'safe' (Aman, default saat diaktifkan): berhenti tanpa auto-jawab kalau
  // ada kata berisiko di buffer yang sama, biar Kaisar yang putuskan manual.
  // Mode 'aggressive' (Agresif): abaikan kata berisiko, tetap auto-jawab semua
  // prompt yang terdeteksi - eksplisit pilihan pengguna, bukan default.
  function scanAutoRespond(chunk) {
    if (state.autoMode === 'off') return;
    // Simpan versi yang SUDAH dibersihkan dari kode ANSI, bukan teks mentah -
    // TUI penuh (mis. Claude Code, berbasis Ink) menggambar ulang seluruh frame
    // (border, riwayat, footer) tiap update, dan overhead kode ANSI mentah per
    // frame bisa jauh melebihi batas buffer sebelum sempat dibersihkan, membuang
    // baris "Do you want to proceed?" duluan sebelum sempat dicek.
    // PENTING: chunk tetap ditambahkan ke buffer walau autoPending true (sedang
    // menunggu debounce kirim respons sebelumnya) - sebelumnya chunk yang
    // datang persis di jendela debounce dibuang total tanpa masuk buffer sama
    // sekali, jadi kalau CLI (mis. Claude Code menjalankan beberapa tool call
    // beruntun) menampilkan prompt izin KEDUA dengan cepat, teksnya hilang
    // permanen sebelum sempat dipindai - baik mode Aman maupun Agresif sama-
    // sama kena, makanya terasa "cuma sebagian yang ke-Enter".
    state.autoBuf = (state.autoBuf + chunk.replace(ANSI_ESCAPE_RE, '')).slice(-AUTO_RESPOND_BUFFER_MAX);
    if (state.autoPending) return;
    const clean = state.autoBuf;

    // Frame yang sama masih ditampilkan ulang (belum berubah sejak respons
    // terakhir) - bukan prompt baru, jangan kirim Enter/Y lagi supaya tidak
    // dobel-kirim ke prompt yang sudah kelar dijawab.
    if (clean === state.lastAutoBuf) return;

    const isDangerous = AUTO_DANGER_RE.test(clean);
    if (isDangerous && state.autoMode === 'safe') {
      if (!state.autoWarned) {
        state.autoWarned = true;
        showToast(`⚠️ Panel ${paneNum}: prompt berisiko terdeteksi, auto-respond dilewati (mode Aman).`, 'error', 3000);
      }
      return;
    }
    // Mode 'aggressive' jatuh ke sini walau isDangerous true - itu memang tujuannya.

    // Mode 'aggressive': tidak perlu cocok pola apapun - setiap ada output baru
    // langsung di-Enter, titik. Mode 'safe' tetap pakai deteksi pola spesifik
    // di bawah supaya tidak sembarang nge-Enter hal yang bukan prompt.
    let response = null;
    if (state.autoMode === 'aggressive') response = '\r';
    else if (AUTO_MENU_YES_RE.test(clean)) response = '\r';
    else if (AUTO_PROCEED_RE.test(clean)) response = '\r';
    else if (AUTO_YESNO_RE.test(clean)) response = 'y\r';
    else if (AUTO_ENTER_RE.test(clean)) response = '\r';
    if (!response) return;

    state.autoPending = true;
    setTimeout(() => {
      if (state.port && state.ready) state.port.postMessage({ type: 'input', data: response });
      else if (state.port) state.pendingInput.push(response);
      // Bukan dikosongkan total (`= ''`) - buffer boleh sudah bertambah selama
      // menunggu debounce ini (lihat catatan di atas), jadi yang diingat adalah
      // ISI TERAKHIR yang sudah direspons, supaya scan berikutnya cuma diam
      // kalau frame-nya benar-benar belum berubah, dan tetap menangkap prompt
      // baru yang keburu numpuk di buffer selama menunggu.
      state.lastAutoBuf = state.autoBuf;
      state.autoWarned = false;
      state.autoPending = false;
      showToast(
        isDangerous
          ? `🔥 Panel ${paneNum}: auto-respond AGRESIF terkirim (mengabaikan kata berisiko).`
          : `⚡ Panel ${paneNum}: auto-respond terkirim.`,
        isDangerous ? 'error' : 'info', 1600
      );
    }, AUTO_RESPOND_DEBOUNCE_MS);
  }

  const AUTO_MODE_TITLE = {
    off: 'Auto Enter/Y untuk prompt CLI (mati) — klik untuk pilih mode',
    safe: 'Auto Enter/Y (AKTIF - Aman): prompt berisiko dilewati — klik untuk ganti mode',
    aggressive: 'Auto Enter/Y (AKTIF - AGRESIF): SEMUA prompt di-ya-kan, termasuk berisiko! — klik untuk ganti mode'
  };
  const AUTO_MODE_TOAST = {
    off: (n) => [`Auto-respond dimatikan untuk Panel ${n}.`, 'info', 1600],
    safe: (n) => [`⚡ Auto-respond AMAN diaktifkan untuk Panel ${n} (prompt berisiko dilewati).`, 'info', 1600],
    aggressive: (n) => [`🔥 Auto-respond AGRESIF diaktifkan untuk Panel ${n} — SEMUA prompt di-ya-kan, termasuk yang berisiko!`, 'error', 2800]
  };

  function setAutoMode(mode) {
    state.autoMode = mode;
    state.autoBuf = '';
    state.lastAutoBuf = null;
    state.autoWarned = false;

    autoBtnEl.classList.toggle('active', mode === 'safe');
    autoBtnEl.classList.toggle('aggressive', mode === 'aggressive');
    autoBtnEl.title = AUTO_MODE_TITLE[mode];

    showToast(...AUTO_MODE_TOAST[mode](paneNum));
  }

  // Klik ⚡ = popup pilih mode langsung (bukan siklus klik-klik) - lebih cepat
  // untuk langsung ke mode yang diinginkan tanpa harus tahu urutan siklusnya.
  autoBtnEl.addEventListener('click', () => {
    showAutoModeMenu(autoBtnEl, state.autoMode, setAutoMode);
  });

  // Tombol 🌊 = kirim Enter manual ke panel ini, tanpa perlu tekan Enter di
  // keyboard fisik - independen dari fitur Auto Enter/Y (⚡) di atas.
  enterBtnEl.addEventListener('click', () => {
    term.focus();
    setActivePaneForTab(tab, paneNum);
    if (state.port && state.ready) state.port.postMessage({ type: 'input', data: '\r' });
    else if (state.port) state.pendingInput.push('\r');
  });

  function connect() {
    try {
      const port = chrome.runtime.connectNative(hostName);
      state.port = port;
      state.ready = false;

      statusEl.className = 'pane-status connecting';
      statusTextEl.textContent = 'menghubungkan…';

      setTimeout(() => {
        port.postMessage({ type: 'init', data: { shell: tab.panes[paneNum].shell, cols: term.cols, rows: term.rows } });
        state.ready = true;
        for (const data of state.pendingInput) port.postMessage({ type: 'input', data });
        state.pendingInput = [];
      }, 200);

      port.onMessage.addListener((msg) => {
        if (msg && msg.data) {
          term.write(msg.data);
          if (!firstOutputReceived) {
            firstOutputReceived = true;
            loadingEl.classList.add('hidden');
          }
          scanAutoRespond(msg.data);
        }
      });

      port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError;
        statusEl.className = 'pane-status error';
        statusTextEl.textContent = 'terputus';
        loadingEl.classList.add('hidden');
        term.write('\r\n\r\n  ❌ Terputus dari Terminal Host.\r\n');
        if (err) term.write(`  Detail: ${err.message}\r\n`);
        state.ready = false;
        showToast(`Panel ${paneNum} terputus dari host.`, 'error');
      });

      statusEl.className = 'pane-status connected';
      statusTextEl.textContent = `tersambung sejak ${new Date().toLocaleTimeString()}`;

    } catch (e) {
      statusEl.className = 'pane-status error';
      statusTextEl.textContent = 'gagal';
      loadingEl.classList.add('hidden');
      term.write(`\r\n  ❌ Gagal terhubung: ${e.message}\r\n`);
      showToast(`Panel ${paneNum} gagal terhubung.`, 'error');
    }
  }

  term.onData((data) => {
    if (state.port && state.ready) state.port.postMessage({ type: 'input', data });
    else if (state.port) state.pendingInput.push(data);
  });

  // Bell: flash the pane border + a quick toast instead of a silent beep
  term.onBell(() => {
    paneEl.classList.remove('bell');
    void paneEl.offsetWidth; // restart animation
    paneEl.classList.add('bell');
    showToast(`🔔 Bell — Panel ${paneNum}`, 'info', 1600);
  });

  // Copy-on-select (debounced): salin otomatis ke clipboard saat seleksi berhenti berubah
  let selectionDebounce = null;
  term.onSelectionChange(() => {
    const sel = term.getSelection();
    if (!sel) return;
    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(() => {
      navigator.clipboard.writeText(sel).catch(() => {});
    }, 150);
  });

  // Klik kanan = menu Copy/Paste custom (browser tidak punya "Paste" native
  // di area non-input seperti terminal, jadi menu ini menggantikannya).
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, term);
  });

  // Focus tracking
  term.onKey(() => setActivePaneForTab(tab, paneNum));
  container.addEventListener('click', (e) => {
    setActivePaneForTab(tab, paneNum);
    moveCursorToClick(e);
  });

  // Klik kiri langsung pindahkan kursor edit ke posisi yang diklik (mirip
  // Option/Alt+klik di iTerm2) - shell/readline sama sekali tidak tahu soal
  // klik mouse, jadi ini dikonversi jadi tombol panah kiri/kanan sebanyak
  // selisih kolomnya lalu dikirim ke PTY, biar tidak perlu pencet kiri-kanan
  // berkali-kali cuma buat benerin ketikan yang salah. Dilewati kalau:
  // - klik itu sebenarnya drag seleksi teks (ada hasil seleksi) - jangan
  //   rebut alur seleksi/copy yang sudah ada
  // - ada aplikasi TUI yang lagi "pegang" mouse (mis. Claude Code CLI) -
  //   xterm sudah otomatis neruskan klik itu ke aplikasinya sendiri, jangan
  //   dobel dikirim
  // - baris yang diklik beda dari baris kursor, atau layar lagi di-scroll ke
  //   scrollback - posisi kursor asli tidak bisa dipastikan lagi
  function moveCursorToClick(e) {
    if (e.button !== 0) return;
    if (term.hasSelection()) return;
    if (term._core.coreMouseService.areMouseEventsActive) return;

    const buf = term.buffer.active;
    if (buf.viewportY !== buf.baseY) return;

    const cell = term._core._renderService.dimensions.css.cell;
    if (!cell || !cell.width || !cell.height) return;

    const rect = term.element.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / cell.width);
    const row = Math.floor((e.clientY - rect.top) / cell.height);
    if (row !== buf.cursorY) return;

    const delta = col - buf.cursorX;
    if (delta === 0) return;
    const seq = (delta > 0 ? '\x1b[C' : '\x1b[D').repeat(Math.abs(delta));
    if (state.port && state.ready) state.port.postMessage({ type: 'input', data: seq });
    else if (state.port) state.pendingInput.push(seq);
  }

  // Drag file dari luar (mis. File Explorer) langsung ke panel ini - path
  // lengkapnya otomatis diketik ke posisi kursor terminal DAN disalin ke
  // clipboard, tidak perlu ketik/cari path manual.
  // CATATAN PENTING: Chrome versi baru sudah MENGHAPUS `File.path` di SEMUA
  // konteks (termasuk extension) demi keamanan - jadi path absolut TIDAK
  // BISA dibaca murni lewat drag-and-drop browser lagi, ini pembatasan
  // platform, bukan bug di sini. `getAsFile-uri-list` dicoba sebagai jalan
  // kedua (masih bekerja di sebagian sumber drag), tapi kalau dua-duanya
  // gagal, fallback-nya cuma nama filenya saja (bukan diam/gagal total) -
  // beri tahu Kaisar supaya tidak salah kira kode-nya rusak.
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    paneEl.classList.add('drag-over');
  });
  container.addEventListener('dragleave', (e) => {
    if (e.target === container) paneEl.classList.remove('drag-over');
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    paneEl.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;

    const uriList = (e.dataTransfer.getData('text/uri-list') || '')
      .split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));

    function uriToPath(uri) {
      if (!uri.startsWith('file:')) return null;
      try {
        let p = decodeURIComponent(uri.replace(/^file:\/{2,3}/, ''));
        if (/^[a-zA-Z]:/.test(p) === false && /^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
        return p;
      } catch { return null; }
    }

    let paths = files.map((f) => f.path).filter(Boolean);
    let usedFallback = false;
    if (!paths.length && uriList.length) {
      paths = uriList.map(uriToPath).filter(Boolean);
    }
    if (!paths.length) {
      // Chrome tidak kasih path sama sekali - nama file saja lebih baik
      // daripada diam total, tapi ini bukan path lengkap.
      paths = files.map((f) => f.name);
      usedFallback = true;
    }

    const text = paths.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ');

    term.focus();
    setActivePaneForTab(tab, paneNum);
    if (state.port && state.ready) state.port.postMessage({ type: 'input', data: text });
    else if (state.port) state.pendingInput.push(text);

    navigator.clipboard.writeText(text).catch(() => {});
    showToast(
      usedFallback
        ? `⚠️ Panel ${paneNum}: Chrome tidak izinkan baca path lengkap - cuma nama file (${paths.length}) yang diketik & disalin. Tips: klik-kanan file di Explorer → "Copy as path" lalu Ctrl+V untuk path lengkap.`
        : `📎 Panel ${paneNum}: ${paths.length} path file diketik & disalin.`,
      usedFallback ? 'error' : 'info', usedFallback ? 4200 : 1800
    );
  });

  // Auto-focus mengikuti mouse: cukup arahkan kursor ke panel ini, langsung
  // fokus + jadi panel aktif - tidak perlu klik dulu sebelum mengetik. Dilewati
  // saat sedang men-drag resizer supaya drag antar panel tidak ikut merebut
  // fokus di tengah jalan. PENTING: dilewati juga kalau panel ini SUDAH fokus -
  // memanggil term.focus() berulang pada textarea yang sudah aktif (mis. tiap
  // kali mouse lewat tepi panel saat sedang mengetik) memicu browser scroll-
  // into-view bawaan pada textarea tersembunyi xterm, yang di renderer DOM
  // (bukan canvas) terlihat sebagai teks yang baru diketik "meleset" muncul di
  // bawah baris seharusnya - persis bug yang dilaporkan.
  container.addEventListener('mouseenter', () => {
    if (dragState) return;
    if (document.activeElement === term.textarea) return;
    term.focus();
    setActivePaneForTab(tab, paneNum);
  });

  tab.panes[paneNum] = {
    term, fitAddon, shell, state,
    port: () => state.port,
    ready: () => state.ready,
    connect,
    setFontSize(size) {
      const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
      state.fontSize = clamped;
      term.options.fontSize = clamped;
      fitAddon.fit();
      this.resize();
      return clamped;
    },
    resize() {
      fitAddon.fit();
      if (state.port && state.ready) state.port.postMessage({ type: 'resize', data: { cols: term.cols, rows: term.rows } });
    }
  };

  connect();
}

// ════════════════════════════════════════════
//  Font size controls (act on the active tab's active pane)
// ════════════════════════════════════════════
function adjustFontSize(delta) {
  const tab = tabs[activeTabId];
  const p = tab?.panes[tab.activePaneId];
  if (!p) return;
  const newSize = p.setFontSize(p.state.fontSize + delta);
  updateFontSizeLabel();
  showToast(`Font Panel ${tab.activePaneId}: ${newSize}px`, 'info', 1200);
}

btnFontDec.addEventListener('click', () => adjustFontSize(-1));
btnFontInc.addEventListener('click', () => adjustFontSize(1));

// ════════════════════════════════════════════
//  Clear active pane scrollback
// ════════════════════════════════════════════
btnClear.addEventListener('click', () => {
  const tab = tabs[activeTabId];
  const p = tab?.panes[tab.activePaneId];
  if (!p) return;
  p.term.clear();
  showToast(`Panel ${tab.activePaneId} dibersihkan.`, 'info', 1200);
});

// ════════════════════════════════════════════
//  Fullscreen toggle
// ════════════════════════════════════════════
function updateFullscreenIcon() {
  const isFs = !!document.fullscreenElement;
  btnFullscreen.classList.toggle('active', isFs);
  btnFullscreen.title = isFs ? 'Keluar Fullscreen (F11)' : 'Fullscreen (F11)';
}

btnFullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => showToast('Fullscreen tidak didukung.', 'error'));
});
document.addEventListener('fullscreenchange', updateFullscreenIcon);

// ════════════════════════════════════════════
//  Tab-strip visibility toggle
// ════════════════════════════════════════════
let tabStripVisible = true;

btnToggleTabs.addEventListener('click', () => {
  tabStripVisible = !tabStripVisible;
  tabStripEl.style.display = tabStripVisible ? '' : 'none';
  btnToggleTabs.classList.toggle('active', !tabStripVisible);
  btnToggleTabs.title = tabStripVisible ? 'Sembunyikan tab-strip' : 'Tampilkan tab-strip';

  // workspace-root is flex:1, so hiding/showing the strip changes how much
  // height it gets - refit the active tab's panes once the layout settles.
  requestAnimationFrame(() => {
    const tab = tabs[activeTabId];
    if (!tab) return;
    tab.panes[1]?.resize();
    if (tab.isSplit) tab.panes[2]?.resize();
  });
});

// ════════════════════════════════════════════
//  Buka File Explorer Windows (di folder Home) — spawn lewat native host
//  seperti shell, karena Chrome extension tidak bisa menjalankan proses
//  native langsung tanpa native-messaging.
// ════════════════════════════════════════════
btnFileExplorer.addEventListener('click', () => {
  try {
    const port = chrome.runtime.connectNative(hostName);
    port.postMessage({ type: 'open-explorer' });
    showToast('📁 Membuka File Explorer…', 'info', 1500);
    setTimeout(() => { try { port.disconnect(); } catch (e) {} }, 600);
  } catch (err) {
    showToast('Gagal membuka File Explorer.', 'error');
  }
});

// ════════════════════════════════════════════
//  Live hover preview: like Windows' taskbar peek, grabs the tab's own xterm
//  canvas layers and draws them scaled-down into a floating tooltip - a real
//  snapshot of what that tab currently shows, not a generic icon.
// ════════════════════════════════════════════
let previewEl = null;

function capturePanePreview(tab) {
  const pane1 = tab.panes[1];
  if (!pane1) return null;

  // This xterm.js build renders with real DOM elements (rows of spans), not a
  // <canvas> - so the "screenshot" is a cloned, scaled-down copy of that live DOM
  // subtree rather than a canvas drawImage(). Works on background tabs too because
  // inactive .workspace elements use visibility:hidden (not display:none), which
  // keeps them laid out and measurable - see the CSS comment on .workspace.
  const paneEl = tab.workspaceEl.querySelector('.pane[data-pane="1"]');
  const container = paneEl.querySelector('[data-role="term-container"]');
  const xtermEl = container.querySelector('.xterm');
  if (!xtermEl) return null;

  const rect = xtermEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const previewW = 220;
  const scale = previewW / rect.width;
  const previewH = Math.round(rect.height * scale);

  const clone = xtermEl.cloneNode(true);
  clone.querySelectorAll('textarea').forEach((el) => el.remove());
  clone.style.transform = `scale(${scale})`;
  clone.style.transformOrigin = 'top left';
  clone.style.pointerEvents = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'tab-preview-canvas';
  wrapper.style.width = `${previewW}px`;
  wrapper.style.height = `${previewH}px`;
  wrapper.appendChild(clone);
  return wrapper;
}

function showTabPreview(tab, anchorEl) {
  const snapshot = capturePanePreview(tab);
  if (!snapshot) return;
  hideTabPreview();

  previewEl = document.createElement('div');
  previewEl.className = 'tab-preview';
  previewEl.appendChild(snapshot);

  const label = document.createElement('div');
  label.className = 'tab-preview-label';
  const shell1 = tab.panes[1]?.shell;
  label.textContent = (SHELL_LABELS[shell1] || shell1 || '') + (tab.isSplit ? ' + Panel 2' : '');
  previewEl.appendChild(label);

  document.body.appendChild(previewEl);

  const rect = anchorEl.getBoundingClientRect();
  const pw = previewEl.offsetWidth;
  const ph = previewEl.offsetHeight;
  let left = rect.left + rect.width / 2 - pw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  previewEl.style.left = `${left}px`;
  previewEl.style.top = `${rect.top - ph - 10}px`;

  requestAnimationFrame(() => previewEl && previewEl.classList.add('show'));
}

function hideTabPreview() {
  if (previewEl) { previewEl.remove(); previewEl = null; }
}

// ════════════════════════════════════════════
//  Custom right-click menu (Copy / Paste)
// ════════════════════════════════════════════
let ctxMenuEl = null;

function hideContextMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
}

function showContextMenu(x, y, term) {
  hideContextMenu();

  const hasSelection = !!term.getSelection();

  ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'ctx-menu';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'ctx-menu-item';
  copyBtn.textContent = '📋 Copy';
  copyBtn.disabled = !hasSelection;
  copyBtn.addEventListener('click', () => {
    const sel = term.getSelection();
    hideContextMenu();
    if (!sel) return;
    navigator.clipboard.writeText(sel).catch(() => {});
    showToast('Disalin ke clipboard.', 'info', 1200);
  });

  const pasteBtn = document.createElement('button');
  pasteBtn.className = 'ctx-menu-item';
  pasteBtn.textContent = '📥 Paste';
  pasteBtn.addEventListener('click', async () => {
    hideContextMenu();
    try {
      const text = await navigator.clipboard.readText();
      if (text) term.paste(text);
    } catch (err) {
      showToast('Gagal membaca clipboard.', 'error');
    }
  });

  ctxMenuEl.appendChild(copyBtn);
  ctxMenuEl.appendChild(pasteBtn);
  document.body.appendChild(ctxMenuEl);

  const mw = ctxMenuEl.offsetWidth;
  const mh = ctxMenuEl.offsetHeight;
  ctxMenuEl.style.left = `${Math.min(x, window.innerWidth - mw - 8)}px`;
  ctxMenuEl.style.top = `${Math.min(y, window.innerHeight - mh - 8)}px`;
}

window.addEventListener('mousedown', (e) => {
  if (ctxMenuEl && !ctxMenuEl.contains(e.target)) hideContextMenu();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu();
});
window.addEventListener('blur', hideContextMenu);

// ════════════════════════════════════════════
//  Auto Enter/Y mode picker popup (mati / Aman / Agresif)
// ════════════════════════════════════════════
let autoModeMenuEl = null;

function hideAutoModeMenu() {
  if (autoModeMenuEl) { autoModeMenuEl.remove(); autoModeMenuEl = null; }
}

const AUTO_MODE_MENU_ITEMS = [
  { mode: 'off', label: '⭘ Mati', desc: 'Tidak auto-respond' },
  { mode: 'safe', label: '🛡️ Aman', desc: 'Lewati prompt berisiko' },
  { mode: 'aggressive', label: '🔥 Agresif', desc: 'Semua prompt di-ya-kan' }
];

function showAutoModeMenu(anchorEl, currentMode, onSelect) {
  hideAutoModeMenu();

  autoModeMenuEl = document.createElement('div');
  autoModeMenuEl.className = 'ctx-menu';

  for (const { mode, label, desc } of AUTO_MODE_MENU_ITEMS) {
    const btn = document.createElement('button');
    btn.className = 'ctx-menu-item auto-mode-item' + (mode === currentMode ? ' selected' : '');
    btn.innerHTML = `<span class="auto-mode-item-label">${label}</span><span class="auto-mode-item-desc">${desc}</span>`;
    btn.addEventListener('click', () => {
      hideAutoModeMenu();
      onSelect(mode);
    });
    autoModeMenuEl.appendChild(btn);
  }

  document.body.appendChild(autoModeMenuEl);

  const rect = anchorEl.getBoundingClientRect();
  const mw = autoModeMenuEl.offsetWidth;
  const mh = autoModeMenuEl.offsetHeight;
  let left = rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  let top = rect.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = rect.top - mh - 4;
  autoModeMenuEl.style.left = `${left}px`;
  autoModeMenuEl.style.top = `${top}px`;
}

window.addEventListener('mousedown', (e) => {
  if (autoModeMenuEl && !autoModeMenuEl.contains(e.target)) hideAutoModeMenu();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideAutoModeMenu();
});
window.addEventListener('blur', hideAutoModeMenu);

// ════════════════════════════════════════════
//  Global keyboard shortcuts
// ════════════════════════════════════════════
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.altKey) return;
  if (e.key === '=' || e.key === '+') { e.preventDefault(); adjustFontSize(1); }
  else if (e.key === '-') { e.preventDefault(); adjustFontSize(-1); }
  else if (e.key === '0') {
    e.preventDefault();
    const tab = tabs[activeTabId];
    const p = tab?.panes[tab.activePaneId];
    if (p) { p.setFontSize(DEFAULT_FONT_SIZE); updateFontSizeLabel(); showToast('Font direset.', 'info', 1200); }
  }
});

// ════════════════════════════════════════════
//  Change shell for the active tab's Panel 1 / Panel 2 (reconnect)
// ════════════════════════════════════════════
async function changeShellForActivePane(paneNum) {
  const shell = await openShellModal(`Panel ${paneNum}`);
  if (!shell) return;

  const tab = tabs[activeTabId];
  const p = tab?.panes[paneNum];
  if (!p) return;

  try { const port = p.port(); if (port) port.disconnect(); } catch (e) {}

  p.term.clear();
  p.term.write(`\r\n  🔄 Berpindah ke ${SHELL_LABELS[shell] || shell}...\r\n`);
  p.shell = shell;

  const paneEl = tab.workspaceEl.querySelector(`.pane[data-pane="${paneNum}"]`);
  paneEl.querySelector('[data-role="badge"]').textContent = SHELL_LABELS[shell] || shell;
  if (paneNum === 1) updateTabStripLabel(tab);
  updateToolbarForActiveTab();

  p.connect();
  showToast(`Panel ${paneNum} berpindah ke ${SHELL_LABELS[shell] || shell}.`, 'success');
}

btnShell1.addEventListener('click', () => changeShellForActivePane(1));
btnShell2.addEventListener('click', () => changeShellForActivePane(2));

// ════════════════════════════════════════════
//  Split toggle (per active tab)
// ════════════════════════════════════════════
function closeSplitForTab(tab) {
  tab.isSplit = false;
  tab.workspaceEl.classList.remove('split');

  try { const port = tab.panes[2]?.port(); if (port) port.disconnect(); } catch (e) {}
  delete tab.panes[2];

  const pane2El = tab.workspaceEl.querySelector('.pane[data-pane="2"]');
  const resizerEl = tab.workspaceEl.querySelector('.resizer');
  pane2El.style.display = 'none';
  resizerEl.style.display = 'none';
  pane2El.querySelector('.pane-body').innerHTML =
    `<div class="pane-loading hidden" data-role="loading"><div class="spinner-ring"></div><div class="pane-loading-text">Menghubungkan…</div></div>`;

  setActivePaneForTab(tab, 1);
  if (tab.id === activeTabId) updateToolbarForActiveTab();
  setTimeout(() => tab.panes[1]?.resize(), 100);
}

btnSplit.addEventListener('click', async () => {
  const tab = tabs[activeTabId];
  if (!tab) return;

  if (!tab.isSplit) {
    const shell2 = await openShellModal('Panel 2');
    if (!shell2) return;

    tab.isSplit = true;
    tab.workspaceEl.classList.add('split');

    const pane1El = tab.workspaceEl.querySelector('.pane[data-pane="1"]');
    const pane2El = tab.workspaceEl.querySelector('.pane[data-pane="2"]');
    const resizerEl = tab.workspaceEl.querySelector('.resizer');
    pane2El.style.display = 'flex';
    resizerEl.style.display = '';
    pane1El.style.flex = '1';
    pane2El.style.flex = '1';

    createPaneInTab(tab, 2, shell2);
    updateToolbarForActiveTab();

    setTimeout(() => {
      tab.panes[1]?.resize();
      tab.panes[2]?.resize();
    }, 100);
  } else {
    closeSplitForTab(tab);
  }
});

// ════════════════════════════════════════════
//  Per-tab workspace wiring: resizer drag + Panel 2's traffic-light close dot
// ════════════════════════════════════════════
function setupTabWorkspace(tab) {
  const resizerEl = tab.workspaceEl.querySelector('.resizer');
  const pane1El   = tab.workspaceEl.querySelector('.pane[data-pane="1"]');
  const pane2El   = tab.workspaceEl.querySelector('.pane[data-pane="2"]');
  const closeDot  = pane2El.querySelector('[data-role="close-pane2"]');

  resizerEl.addEventListener('mousedown', (e) => {
    dragState = {
      tab, pane1El, pane2El, resizerEl,
      startX: e.clientX,
      startW1: pane1El.getBoundingClientRect().width
    };
    resizerEl.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  closeDot.addEventListener('click', () => { if (tab.isSplit) closeSplitForTab(tab); });
}

document.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  const { tab, pane1El, pane2El, resizerEl, startX, startW1 } = dragState;
  const cs    = getComputedStyle(tab.workspaceEl);
  const gap   = parseFloat(cs.columnGap || cs.gap) || 0;
  const total = tab.workspaceEl.clientWidth - resizerEl.offsetWidth - gap * 2;
  const newW1 = Math.max(180, Math.min(startW1 + (e.clientX - startX), total - 180));
  const newW2 = total - newW1;
  pane1El.style.flex = 'none'; pane1El.style.width = newW1 + 'px';
  pane2El.style.flex = 'none'; pane2El.style.width = newW2 + 'px';
});

document.addEventListener('mouseup', () => {
  if (!dragState) return;
  const { tab, resizerEl } = dragState;
  resizerEl.classList.remove('dragging');
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  tab.panes[1]?.resize();
  tab.panes[2]?.resize();
  dragState = null;
});

// ════════════════════════════════════════════
//  Window resize: refit only the active tab's panes
// ════════════════════════════════════════════
window.addEventListener('resize', () => {
  const tab = tabs[activeTabId];
  if (!tab) return;
  tab.panes[1]?.resize();
  if (tab.isSplit) tab.panes[2]?.resize();
});

// ════════════════════════════════════════════
//  Boot: first tab from URL param or shell picker
// ════════════════════════════════════════════
(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  let shell1 = urlParams.get('shell');

  if (!shell1) {
    shell1 = await openShellModal('Panel 1');
    if (!shell1) shell1 = 'powershell.exe';
  }

  createTerminalTab(shell1);
})();
