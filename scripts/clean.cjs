// Cross-platform clean for build outputs.
//
// Why this exists: `npm run package` was failing on Windows with
//   "remove ...\release\win-unpacked\Biasno.exe: Access is denied."
// because the previous build's Biasno.exe was still held by a process
// (the dev shell, a forgotten preview, or even Windows Defender scanning
// the freshly written file).  This script:
//   1) Kills any lingering Biasno / electron-builder processes on Windows.
//   2) Removes `dist/`, `out/`, and `release/` with retry on EBUSY/EPERM.

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const TARGETS = ['dist', 'out', 'release']

function killWindowsProcesses() {
  if (process.platform !== 'win32') return
  // `taskkill` exits non-zero when the image is not found; ignore that.
  for (const image of ['Biasno.exe', 'app-builder.exe']) {
    try {
      execSync(`taskkill /F /IM "${image}" /T`, { stdio: 'ignore' })
    } catch {
      /* not running — fine */
    }
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function rmWithRetry(dir, attempts = 5) {
  const full = path.join(root, dir)
  if (!fs.existsSync(full)) return
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(full, { recursive: true, force: true })
      return
    } catch (err) {
      const code = err && err.code
      if (code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY') {
        // File locked — wait briefly, then retry.  Antivirus usually
        // releases its handle within a second or two of writing.
        await sleep(400 * (i + 1))
        continue
      }
      throw err
    }
  }
  console.error(`[clean] could not remove ${dir} after ${attempts} attempts`)
  process.exit(1)
}

async function main() {
  killWindowsProcesses()
  for (const t of TARGETS) {
    await rmWithRetry(t)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
