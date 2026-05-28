// Pre-populate electron-builder's winCodeSign cache on Windows.
//
// Why: electron-builder ships `app-builder.exe` which calls `7za x -snld …` to
// extract winCodeSign-*.7z. The archive contains macOS .dylib symbolic links;
// 7-Zip exits with code 2 when Windows refuses symlink creation (which it does
// for non-admin users without Developer Mode). The `-snld` flag is hardcoded
// in the Go binary, so the only sane workaround is to pre-extract the archive
// ourselves with a tolerant 7za invocation and drop it where app-builder looks
// for it.

const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')
const { spawnSync } = require('child_process')

if (process.platform !== 'win32') process.exit(0)

const VERSION = '2.6.0'
const URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-${VERSION}/winCodeSign-${VERSION}.7z`
const CACHE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
const DEST = path.join(CACHE_DIR, `winCodeSign-${VERSION}`)
const MARKER = path.join(DEST, 'rcedit-x64.exe')
const ARCHIVE = path.join(CACHE_DIR, `winCodeSign-${VERSION}.7z`)
const SEVEN_ZA = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')

if (fs.existsSync(MARKER)) {
  console.log(`winCodeSign cache present at ${DEST} — skipping.`)
  process.exit(0)
}

fs.mkdirSync(CACHE_DIR, { recursive: true })

function download(url, file) {
  return new Promise((resolve, reject) => {
    const fetch = (u) => https.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); fetch(res.headers.location); return
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${u}`)); return }
      const out = fs.createWriteStream(file)
      res.pipe(out)
      out.on('finish', () => out.close(resolve))
      out.on('error', reject)
    }).on('error', reject)
    fetch(url)
  })
}

;(async () => {
  if (!fs.existsSync(SEVEN_ZA)) {
    console.error(`7za not found at ${SEVEN_ZA} — is 7zip-bin installed?`)
    process.exit(1)
  }
  console.log(`Downloading ${URL}`)
  await download(URL, ARCHIVE)

  fs.mkdirSync(DEST, { recursive: true })
  // Omit -snld so symlink-creation failures on .dylib files only set sub-item
  // errors instead of bubbling to exit code 2. The Windows-side files (rcedit,
  // signtool, etc.) extract regardless and are all electron-builder needs on
  // win32.
  const r = spawnSync(SEVEN_ZA, ['x', '-bd', '-y', ARCHIVE, `-o${DEST}`], { stdio: 'inherit' })
  // 7za returns 2 when it couldn't create the .dylib symlinks; all Windows
  // files still extract, so only fail if the marker we need is missing.
  if (!fs.existsSync(MARKER)) {
    console.error(`7za exited with ${r.status}; ${MARKER} missing — aborting.`)
    process.exit(r.status || 1)
  }
  console.log(`winCodeSign ready at ${DEST}`)
})().catch((e) => { console.error(e); process.exit(1) })
