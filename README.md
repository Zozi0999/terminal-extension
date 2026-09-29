# 🖥️ Local Terminal In-Tab (Chrome Extension)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey.svg)](#)
[![Built With xterm.js](https://img.shields.io/badge/Terminal-xterm.js-red.svg)](https://xtermjs.org/)

Buka dan jalankan terminal lokal (PowerShell / CMD / Bash) secara langsung di tab browser Chrome / Chromium melalui integrasi **Chrome Native Messaging Host**.

---

## 🌟 Fitur Utama

- **In-Browser Terminal**: Akses command line lokal langsung dari tab browser tanpa perlu beralih aplikasi.
- **Xterm.js Full Support**: Dukungan penuh emulator terminal (ANSI colors, cursor styling, fit addon, copy-paste).
- **Persistent Extension Key**: Menggunakan public key tetap di `manifest.json`, sehingga Extension ID selalu konsisten dan tidak berubah saat reload atau ganti folder.
- **Automated Host Setup**: Skrip instalasi otomatis untuk mendaftarkan Native Messaging Host ke Registry Windows.
- **Multi-Tab Ready**: Desain antarmuka tab rapi dengan akses popup cepat.

---

## 🏗️ Struktur Proyek

```text
terminal-extension/
├── host/
│   ├── host.js                   # Node.js Native Messaging host backend
│   ├── host-manifest-template.json # Template manifest Native Host
│   ├── run_host.bat              # Runner batch file untuk host Node.js
│   └── package.json              # Dependency backend host
├── manifest.json                 # Manifest Extension Chrome (V3)
├── popup.html / popup.js         # UI & aksi popup toolbar
├── terminal.html / terminal.js   # Halaman utama terminal in-tab
├── install.bat / install.js      # Installer otomatis Native Messaging Host
├── xterm.js / xterm.css          # Emulator library Xterm.js & styling
└── addon-fit.js                  # Xterm fit addon untuk penyesuaian ukuran otomatis
```

---

## 🚀 Panduan Instalasi

### 1. Prasyarat
- **Google Chrome** / **Microsoft Edge** / browser berbasis Chromium lainnya.
- **Node.js** (LTS direkomendasikan).

### 2. Muat Ekstensi ke Browser
1. Buka browser dan arahkan ke: `chrome://extensions/` (atau `edge://extensions/`).
2. Aktifkan **Developer mode** di pojok kanan atas.
3. Klik tombol **Load unpacked**.
4. Pilih folder `terminal-extension`.

### 3. Daftarkan Native Messaging Host (Windows)
Jalankan file instalasi agar browser diizinkan berkomunikasi dengan terminal lokal:
- Klik dua kali pada file **`install.bat`** (atau jalankan `node install.js` di terminal dengan hak akses yang sesuai).
- Skrip akan membaca ID ekstensi secara otomatis dan mendaftarkannya ke Registry Windows.

---

## 💻 Penggunaan

1. Klik ikon ekstensi **Local Terminal In-Tab** di toolbar browser.
2. Klik **Buka Terminal** untuk meluncurkan terminal di tab baru browser.
3. Anda langsung terhubung ke shell lokal Anda!

---

## 🛡️ Lisensi

Proyek ini dilisensikan di bawah lisensi MIT. Lihat file [LICENSE](LICENSE) untuk detail lebih lanjut.
