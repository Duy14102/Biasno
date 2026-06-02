// electron-builder afterPack: drop Chromium's per-language .pak files except
// en-US.  These are Chromium's own UI strings (context menus, etc.) — the
// app's VI/EN text lives in JS i18n, so pruning them is safe and saves ~40 MB.
// Chromium falls back to en-US when a locale .pak is missing.
const fs = require('fs')
const path = require('path')

const KEEP = new Set(['en-US.pak'])

exports.default = async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, 'locales')
  if (!fs.existsSync(localesDir)) return
  let removed = 0
  for (const file of fs.readdirSync(localesDir)) {
    if (file.endsWith('.pak') && !KEEP.has(file)) {
      fs.rmSync(path.join(localesDir, file))
      removed++
    }
  }
  console.log(`[after-pack] pruned ${removed} locale .pak files (kept ${[...KEEP].join(', ')})`)
}
