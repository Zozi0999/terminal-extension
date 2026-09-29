// Popup berbagi origin (chrome-extension://<id>/) dengan terminal.html, jadi
// localStorage-nya SAMA - baca kunci tema yang sama di sini supaya popup ikut
// tema yang terakhir dipilih di menu Pengaturan, bukan selalu "Aura Api".
try {
  const savedTheme = localStorage.getItem('terminalInTab.themeName');
  if (savedTheme === 'aura-es') document.documentElement.setAttribute('data-theme', savedTheme);
} catch (e) {}

document.getElementById('open-btn').addEventListener('click', () => {
  const shellSelect = document.getElementById('shell-select');
  const selectedShell = shellSelect.value;

  chrome.tabs.create({
    url: chrome.runtime.getURL(`terminal.html?shell=${encodeURIComponent(selectedShell)}`)
  });
});
