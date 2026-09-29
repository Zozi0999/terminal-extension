const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let pty;
let ptyProcess = null;
let usePty = false;
let shuttingDown = false;

const logFile = path.join(__dirname, 'host_debug.log');
const MAX_LOG_BYTES = 2 * 1024 * 1024;

// Cegah log tumbuh tanpa batas (pernah mencapai puluhan ribu baris akibat bug EPIPE lama)
try {
  const stat = fs.statSync(logFile);
  if (stat.size > MAX_LOG_BYTES) fs.writeFileSync(logFile, '');
} catch (e) {}

function log(msg) {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
  } catch (e) {}
}

// Native Messaging Host TIDAK mengirim sinyal disconnect eksplisit: saat tab/Chrome
// menutup channel, stdin cukup berhenti mengalirkan data ('end'/'close'). Tanpa
// menangani ini, ptyProcess (shell) terus berjalan selamanya sebagai proses zombie
// dan setiap write ke stdout yang sudah putus memicu EPIPE tanpa henti.
function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Mematikan host (${reason}).`);
  try {
    if (ptyProcess) ptyProcess.kill();
  } catch (e) {}
  process.exit(0);
}

process.stdin.on('end', () => shutdown('stdin end'));
process.stdin.on('close', () => shutdown('stdin close'));
process.stdin.on('error', () => shutdown('stdin error'));

log("Memulai Native Host...");

// Mencoba menggunakan node-pty
try {
  pty = require('node-pty');
  usePty = true;
  log("node-pty berhasil dimuat.");
} catch (e) {
  usePty = false;
  log("node-pty tidak ditemukan atau gagal dimuat. Menggunakan standard child_process.");
}

// App Execution Alias (reparse point IO_REPARSE_TAG_APPEXECLINK) membuat fs.existsSync()
// SELALU bernilai false: fs.statSync() yang dipakainya di dalam melempar EACCES (bukan
// ENOENT) untuk reparse point ini, dan existsSync menelan semua error sebagai "tidak ada".
// Ini menyebabkan pwsh.exe (yang diinstal via MS Store) selalu dianggap "tidak ditemukan"
// padahal aliasnya valid dan BISA di-spawn langsung oleh node-pty. lstatSync tidak mengikuti
// reparse point sehingga tidak kena masalah ini - dipakai di sini sebagai pengecekan yang benar.
function pathExists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

// Menemukan path absolut NYATA untuk pwsh.exe
function resolveShellPath(shellName) {
  if (shellName === 'pwsh.exe') {
    const { execSync } = require('child_process');
    const userProfile = process.env.USERPROFILE || 'C:\\Users\\user';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    // Cek lokasi instalasi Program Files terlebih dahulu (bukan alias Store)
    const priorityPaths = [
      path.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
      path.join(programFiles, 'PowerShell', '7.6.3', 'pwsh.exe'),
      path.join(programFilesX86, 'PowerShell', '7', 'pwsh.exe'),
    ];

    for (const p of priorityPaths) {
      if (pathExists(p)) {
        log(`[resolveShellPath] Ditemukan di Program Files: ${p}`);
        return p;
      }
    }

    // Alias eksekusi (App Execution Alias) milik user untuk paket Store - BISA di-spawn
    // langsung oleh node-pty, dan path-nya stabil terlepas dari versi paket yang terpasang,
    // tidak seperti folder Program Files\WindowsApps yang namanya berisi nomor versi
    // (mis. Microsoft.PowerShell_7.6.3.0_x64__8wekyb3d8bbwe). Dicek dengan pathExists(),
    // BUKAN fs.existsSync(), karena alasan di komentar pathExists() di atas.
    const storeAliasPaths = [
      path.join(userProfile, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'pwsh.exe'),
    ];

    for (const p of storeAliasPaths) {
      if (pathExists(p)) {
        log(`[resolveShellPath] Menggunakan Store alias: ${p}`);
        return p;
      }
    }

    // Terakhir, coba 'where pwsh' untuk menemukan path dari PATH sistem
    try {
      const whereResult = execSync('where pwsh', { timeout: 3000 }).toString().trim();
      const lines = whereResult.split(/\r?\n/).filter(l => l.trim());
      // Filter: jangan pakai path Program Files\WindowsApps (folder paket MSIX yang
      // dilindungi ACL, beda dari App Execution Alias di AppData\Local yang dicek di atas)
      const realPath = lines.find(l => !l.includes('WindowsApps'));
      if (realPath) {
        log(`[resolveShellPath] Ditemukan via 'where pwsh' (non-alias): ${realPath}`);
        return realPath;
      }
    } catch (e) {
      log(`[resolveShellPath] 'where pwsh' gagal: ${e.message}`);
    }

    log(`[resolveShellPath] pwsh.exe tidak ditemukan di lokasi manapun. Fallback ke 'pwsh.exe'`);
    return 'pwsh.exe';
  }
  return shellName;
}

// WSL selalu tersedia di System32 saat fitur WSL aktif; tidak perlu resolusi App
// Execution Alias seperti pwsh karena wsl.exe adalah binary sistem biasa.
function resolveWslPath() {
  const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const p = path.join(systemRoot, 'System32', 'wsl.exe');
  return pathExists(p) ? p : 'wsl.exe';
}


// Fungsi untuk meluncurkan shell yang dipilih oleh pengguna
function startShell(shellName, cols, rows) {
  let resolvedShell;
  let shellArgs = [];

  if (shellName === 'ubuntu-wsl') {
    resolvedShell = resolveWslPath();
    shellArgs = ['-d', 'Ubuntu'];
  } else {
    resolvedShell = resolveShellPath(shellName);
  }

  log(`Menjalankan shell: ${resolvedShell} ${shellArgs.join(' ')} (cols: ${cols}, rows: ${rows})`);

  if (usePty) {
    try {
      // Catatan: alias eksekusi App Execution Alias (mis. AppData\Local\Microsoft\WindowsApps\pwsh.exe)
      // bisa di-spawn langsung oleh node-pty/CreateProcess, sama seperti saat shell manapun
      // menjalankan "pwsh" lewat PATH. Membungkusnya dengan cmd.exe /c "..." pernah menyebabkan
      // bug quoting ganda (argumen ikut di-quote ulang oleh node-pty) yang berujung "File not found".
      ptyProcess = pty.spawn(resolvedShell, shellArgs, {
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.USERPROFILE || process.env.HOME || 'C:\\',
        env: process.env
      });

      ptyProcess.onData((data) => {
        sendMessage({ type: 'output', data: data });
      });

      ptyProcess.on('exit', () => {
        log("Proses shell berakhir.");
        process.exit(0);
      });
    } catch (err) {
      log(`Gagal memulai PTY shell ${resolvedShell}: ${err.message}`);
      sendMessage({
        type: 'output',
        data: `\r\n❌ Gagal memuat shell PTY "${shellName}". Pastikan program terinstal dan berada dalam PATH Windows Anda.\r\n`
      });
      process.exit(1);
    }
  } else {
    // Fallback: child_process.spawn
    try {
      let args = shellArgs.slice();
      if (resolvedShell.toLowerCase().includes('powershell') || resolvedShell.toLowerCase().includes('pwsh.exe')) {
        args = ['-NoLogo', '-NoExit'];
      }

      ptyProcess = spawn(resolvedShell, args, {
        cwd: process.env.USERPROFILE || process.env.HOME || 'C:\\',
        env: process.env
      });

      ptyProcess.stdout.on('data', (data) => {
        sendMessage({ type: 'output', data: data.toString() });
      });

      ptyProcess.stderr.on('data', (data) => {
        sendMessage({ type: 'output', data: data.toString() });
      });

      ptyProcess.on('exit', () => {
        log("Proses shell berakhir.");
        process.exit(0);
      });

      ptyProcess.on('error', (err) => {
        log(`Gagal spawn process: ${err.message}`);
        sendMessage({
          type: 'output',
          data: `\r\n❌ Gagal memuat shell: "${shellName}" (${err.message}). Pastikan program terinstal.\r\n`
        });
        process.exit(1);
      });
    } catch (err) {
      log(`Exception pada child_process.spawn: ${err.message}`);
      sendMessage({
        type: 'output',
        data: `\r\n❌ Error saat memuat shell: ${err.message}\r\n`
      });
      process.exit(1);
    }
  }
}

// Parsing Native Messaging protocol (4-byte length prefix + JSON string)
let inputBuffer = Buffer.alloc(0);

process.stdin.on('data', (data) => {
  inputBuffer = Buffer.concat([inputBuffer, data]);
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length >= 4 + length) {
      const jsonStr = inputBuffer.slice(4, 4 + length).toString('utf-8');
      inputBuffer = inputBuffer.slice(4 + length);
      try {
        const message = JSON.parse(jsonStr);
        handleMessage(message);
      } catch (err) {
        log(`Gagal memparsing JSON: ${err.message}`);
      }
    } else {
      break;
    }
  }
});

function handleMessage(message) {
  if (message.type === 'init') {
    const shellName = message.data.shell || 'powershell.exe';
    const cols = message.data.cols || 80;
    const rows = message.data.rows || 24;
    startShell(shellName, cols, rows);
  } else if (message.type === 'input') {
    if (ptyProcess) {
      if (usePty) {
        ptyProcess.write(message.data);
      } else {
        ptyProcess.stdin.write(message.data);
      }
    }
  } else if (message.type === 'resize') {
    if (usePty && ptyProcess) {
      try {
        ptyProcess.resize(message.data.cols, message.data.rows);
      } catch (err) {
        log(`Gagal resize PTY: ${err.message}`);
      }
    }
  } else if (message.type === 'open-explorer') {
    // explorer.exe adalah GUI app, bukan shell - spawn langsung (bukan lewat node-pty)
    // dan detached+unref supaya tidak ikut ditunggu/dimatikan bareng host ini.
    try {
      const targetPath = process.env.USERPROFILE || process.env.HOME || 'C:\\';
      const child = spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' });
      child.unref();
      log(`Membuka File Explorer di: ${targetPath}`);
    } catch (err) {
      log(`Gagal membuka File Explorer: ${err.message}`);
    }
  }
}

function sendMessage(msg) {
  if (shuttingDown) return;
  try {
    const jsonStr = JSON.stringify(msg);
    const jsonBuffer = Buffer.from(jsonStr, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);

    process.stdout.write(Buffer.concat([lengthBuffer, jsonBuffer]));
  } catch (err) {
    if (err.code === 'EPIPE') {
      // Chrome sudah menutup channel (mis. tab ditutup) - host tidak lagi berguna.
      shutdown('EPIPE saat write');
    } else {
      log(`Gagal mengirim pesan ke Chrome: ${err.message}`);
    }
  }
}

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') shutdown('EPIPE pada stdout');
});

process.on('uncaughtException', (err) => {
  log(`Kesalahan Tidak Terduga: ${err.message}`);
  if (err.code === 'EPIPE') shutdown('EPIPE tak tertangani');
});
