const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('⚙️  Inisialisasi package.json di root...');
const packageJsonPath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  fs.writeFileSync(packageJsonPath, JSON.stringify({
    name: "terminal-extension-root",
    version: "1.0.0",
    private: true
  }, null, 2));
}

console.log('⚙️  Menginstal @xterm/xterm dan @xterm/addon-fit secara lokal via npm...');
try {
  execSync('npm install @xterm/xterm @xterm/addon-fit', { stdio: 'inherit', cwd: __dirname });
  console.log('✅ npm install selesai.');
} catch (err) {
  console.error('❌ Gagal menjalankan npm install:', err.message);
  process.exit(1);
}

// Definisikan file yang perlu disalin
const sourceDestPairs = [
  {
    src: path.join(__dirname, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
    dest: path.join(__dirname, 'xterm.css')
  },
  {
    src: path.join(__dirname, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js'),
    dest: path.join(__dirname, 'xterm.js')
  },
  {
    src: path.join(__dirname, 'node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js'),
    dest: path.join(__dirname, 'addon-fit.js')
  }
];

console.log('⚙️  Menyalin berkas pustaka xterm ke root ekstensi...');
for (const pair of sourceDestPairs) {
  try {
    if (fs.existsSync(pair.src)) {
      fs.copyFileSync(pair.src, pair.dest);
      console.log(`✅ Berhasil menyalin ${path.basename(pair.dest)}`);
    } else {
      console.error(`❌ Berkas sumber tidak ditemukan: ${pair.src}`);
    }
  } catch (err) {
    console.error(`❌ Gagal menyalin berkas: ${err.message}`);
  }
}

console.log('🎉 Selesai! Semua berkas xterm lokal siap digunakan.');
