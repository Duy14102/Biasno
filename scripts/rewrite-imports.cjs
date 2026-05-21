'use strict'
const fs   = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'src', 'renderer')

const BARREL_DIRS = new Set()
;(function findBarrels(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const sub = path.join(dir, e.name)
    if (fs.existsSync(path.join(sub, 'index.ts'))) {
      BARREL_DIRS.add(path.relative(ROOT, sub).replace(/\\/g, '/'))
    }
    findBarrels(sub)
  }
})(ROOT)

function deepestBarrel(targetPath) {
  const parts = targetPath.split('/')
  for (let i = parts.length; i >= 1; i--) {
    const prefix = parts.slice(0, i).join('/')
    if (BARREL_DIRS.has(prefix)) return prefix
  }
  return null
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = walk(ROOT)

const importRegex = /from\s+(['"])(\.\.[^'"]*)\1/g
let totalReplacements = 0
let touchedFiles = 0

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  let count = 0
  const out = src.replace(importRegex, (match, quote, spec) => {
    const abs = path.resolve(path.dirname(file), spec)
    let rel = path.relative(ROOT, abs).replace(/\\/g, '/')
    if (rel.startsWith('..')) return match
    rel = rel.replace(/\.(ts|tsx)$/, '')
    const barrel = deepestBarrel(rel)
    if (!barrel) return match
    count++
    return `from ${quote}@/${barrel}${quote}`
  })
  if (count > 0) {
    fs.writeFileSync(file, out)
    touchedFiles++
    totalReplacements += count
  }
}

console.log(`Rewrote ${totalReplacements} imports across ${touchedFiles} files.`)
