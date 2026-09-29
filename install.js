const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

// manifest.json punya field "key" (public key RSA tetap) sehingga Chrome/Edge
// SELALU menghasilkan ID ekstensi yang sama saat "Load unpacked", di folder
// manapun ekstensi ini dimuat - tidak lagi acak per-instalasi. Ini menghilangkan
// langkah manual "salin ID 32 karakter dari chrome://extensions" yang sebelumnya
// wajib dilakukan tiap kali install ulang / pindah komputer.
// Algoritma sama seperti yang dipakai Chromium: ID = 16 byte pertama SHA-256
// dari DER public key, tiap nibble hex (0-15) dipetakan ke huruf 'a'-'p'.
function extensionIdFromManifestKey(manifestJsonPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));
  if (!manifest.key) {
    throw new Error('manifest.json tidak punya field "key" - tidak bisa menghitung ID tetap.');
  }
  const der = Buffer.from(manifest.key, 'base64');
  const hash = crypto.createHash('sha256').update(der).digest();
  let id = '';
  for (const byte of hash.subarray(0, 16)) {
    id += String.fromCharCode(97 + ((byte >> 4) & 0xf)) + String.fromCharCode(97 + (byte & 0xf));
  }
  return id;
}

let extensionId;
try {
  extensionId = extensionIdFromManifestKey(path.join(__dirname, 'manifest.json'));
  console.log(`✅ ID Ekstensi tetap terdeteksi otomatis dari manifest.json: ${extensionId}`);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const templatePath = path.join(__dirname, 'host', 'host-manifest-template.json');
const manifestPath = path.join(__dirname, 'host', 'host-manifest.json');

// 1. Baca template dan ganti dengan ID Ekstensi yang benar
console.log('⚙️  Mengonfigurasi manifest dengan ID Ekstensi Anda...');
let templateContent;
try {
  templateContent = fs.readFileSync(templatePath, 'utf8');
} catch (err) {
  console.error(`❌ Gagal membaca template: ${err.message}`);
  process.exit(1);
}

// Path host harus absolut sesuai lokasi folder ini sekarang - sebelumnya template
// menyimpan path statis (C:\terminal-extension\...) sehingga instalasi dari lokasi
// lain (mis. folder arsip/backup) tetap menunjuk ke lokasi lama yang salah.
const hostBatPath = path.join(__dirname, 'host', 'run_host.bat');

const manifestContent = templateContent
  .replace('[EXTENSION_ID]', extensionId)
  .replace('[HOST_PATH]', hostBatPath.replace(/\\/g, '\\\\'));

try {
  fs.writeFileSync(manifestPath, manifestContent, 'utf8');
  console.log('✅ Berkas host-manifest.json berhasil dibuat.');
} catch (err) {
  console.error(`❌ Gagal menulis manifest: ${err.message}`);
  process.exit(1);
}

// 2. Tambahkan Registry Key untuk Google Chrome dan Microsoft Edge (HKCU - tidak butuh akses Administrator)
console.log('⚙️  Meregistrasikan Native Messaging Host di Registry Windows...');

const chromeRegCommand = `reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.antigravity.terminal" /ve /t REG_SZ /d "${manifestPath}" /f`;
const edgeRegCommand = `reg add "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.antigravity.terminal" /ve /t REG_SZ /d "${manifestPath}" /f`;

exec(chromeRegCommand, (err, stdout, stderr) => {
  if (err) {
    console.error(`❌ Gagal meregistrasi untuk Chrome: ${stderr || err.message}`);
  } else {
    console.log('✅ Berhasil meregistrasikan Host untuk Google Chrome.');
  }

  exec(edgeRegCommand, (err2, stdout2, stderr2) => {
    if (err2) {
      console.error(`❌ Gagal meregistrasi untuk Microsoft Edge: ${stderr2 || err2.message}`);
    } else {
      console.log('✅ Berhasil meregistrasikan Host untuk Microsoft Edge.');
    }
    
    console.log('\n🎉 Penginstalan selesai! Sekarang silakan muat ulang tab terminal Anda di browser.');
  });
});
