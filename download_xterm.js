const https = require('https');
const fs = require('fs');
const path = require('path');

const files = [
  {
    url: 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.3.0/css/xterm.css',
    dest: 'xterm.css'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.3.0/lib/xterm.js',
    dest: 'xterm.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.8.0/lib/addon-fit.js',
    dest: 'addon-fit.js'
  }
];

function downloadFile(file) {
  return new Promise((resolve, reject) => {
    const destPath = path.join(__dirname, file.dest);
    const fileStream = fs.createWriteStream(destPath);
    
    console.log(`Downloading ${file.url} -> ${file.dest}...`);
    
    https.get(file.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${file.url}, status code: ${response.statusCode}`));
        return;
      }
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`✅ Saved ${file.dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function run() {
  try {
    for (const file of files) {
      await downloadFile(file);
    }
    console.log('🎉 Semua berkas xterm.js berhasil diunduh secara lokal!');
  } catch (err) {
    console.error('❌ Gagal mengunduh berkas:', err.message);
  }
}

run();
