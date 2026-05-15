import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import type { PracticeMode } from '../types'

// ─── Hand themes ──────────────────────────────────────────────────────────────
// Colours mirror the practice page (treble = blue, bass = orange, both = green)
// so picking a mode here has visual continuity with the keyboard / falling-notes
// view that opens next.
type Hand  = 'right' | 'left' | 'both'
type Skill = 'melody' | 'rhythm' | 'melody-rhythm'

interface HandTheme {
  label:      string
  emoji:      string
  // Section heading style
  iconBg:     string
  iconRing:   string
  rule:       string   // dashed divider colour
  // Card style
  cardGrad:   string   // tailwind gradient classes
  cardBorder: string
  cardGlow:   string   // hover shadow colour
}

const HAND_THEMES: Record<Hand, HandTheme> = {
  right: {
    label:      'Tay phải',
    emoji:      '🫱',
    iconBg:     'bg-blue-500/15',
    iconRing:   'ring-blue-400/40',
    rule:       'border-blue-500/30',
    cardGrad:   'from-blue-600/30 to-blue-500/10',
    cardBorder: 'border-blue-500/30 hover:border-blue-400/70',
    cardGlow:   'hover:shadow-blue-500/20',
  },
  left: {
    label:      'Tay trái',
    emoji:      '🫲',
    iconBg:     'bg-orange-500/15',
    iconRing:   'ring-orange-400/40',
    rule:       'border-orange-500/30',
    cardGrad:   'from-orange-600/30 to-orange-500/10',
    cardBorder: 'border-orange-500/30 hover:border-orange-400/70',
    cardGlow:   'hover:shadow-orange-500/20',
  },
  both: {
    label:      'Cả 2 tay',
    emoji:      '🙌',
    iconBg:     'bg-emerald-500/15',
    iconRing:   'ring-emerald-400/40',
    rule:       'border-emerald-500/30',
    cardGrad:   'from-emerald-600/30 to-emerald-500/10',
    cardBorder: 'border-emerald-500/30 hover:border-emerald-400/70',
    cardGlow:   'hover:shadow-emerald-500/20',
  },
}

interface SkillInfo {
  key:   Skill
  label: string
  desc:  string
  icon:  string
}

const SKILLS: SkillInfo[] = [
  { key: 'melody',         label: 'Melody',           desc: 'Đúng note',          icon: '🎵' },
  { key: 'rhythm',         label: 'Rhythm',           desc: 'Đúng nhịp',          icon: '🥁' },
  { key: 'melody-rhythm',  label: 'Melody + Rhythm',  desc: 'Đúng cả note và nhịp', icon: '🎯' },
]

const HANDS: Hand[] = ['right', 'left', 'both']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(s: number): string {
  const m   = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function modeLabel(mode: PracticeMode): string {
  if (mode === 'view-listen') return 'Xem và Nghe'
  const parts = mode.split('-')
  const hand  = parts[0] as Hand
  const skill = parts.slice(1).join('-')
  const handLabel  = HAND_THEMES[hand]?.label ?? hand
  const skillLabel = SKILLS.find(s => s.key === skill)?.label ?? skill
  return `${handLabel} — ${skillLabel}`
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ModePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { midiFile, setPracticeSettings, resumePoints, setResumePoint } = useAppContext()

  if (!midiFile) {
    navigate('/')
    return <></>
  }

  // Resume bookmark is scoped per-song so each MIDI keeps its own mark.
  const resumePoint = resumePoints[midiFile.name] ?? null

  const startFresh = (mode: PracticeMode) => {
    setResumePoint(midiFile.name, null)
    setPracticeSettings({ mode, midiFile })
    navigate('/practice')
  }

  const continueSession = () => {
    if (!resumePoint) return
    setPracticeSettings({ mode: resumePoint.mode, midiFile })
    navigate('/practice')
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        className="flex items-center gap-3 px-5 py-3 bg-gradient-to-b from-slate-800 to-slate-900 border-b border-slate-700/70 shadow-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors text-sm font-medium"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span>←</span>
          <span>Quay lại</span>
        </button>
        <div className="w-px h-6 bg-slate-700/60" />
        <span className="text-white font-bold truncate flex-1 min-w-0" title={midiFile.name}>
          {midiFile.name}
        </span>
        <span className="text-slate-400 text-sm font-mono tabular-nums shrink-0">
          {Math.round(midiFile.bpm)} BPM
        </span>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto">

          {/* Resume banner — only for THIS song, with prominent CTA. */}
          {resumePoint && (
            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-blue-800/15 to-transparent border border-blue-700/40 flex items-center gap-4 shadow-lg shadow-blue-900/20">
              <div className="w-12 h-12 rounded-xl bg-blue-500/15 ring-1 ring-blue-400/40 flex items-center justify-center text-2xl shrink-0">
                ⏱
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">
                  Tiếp tục từ <span className="text-blue-300 font-mono tabular-nums">{formatTime(resumePoint.time)}</span>
                </p>
                <p className="text-slate-400 text-xs mt-0.5 truncate">
                  {modeLabel(resumePoint.mode)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={continueSession}
                  // Brightness + shadow lift instead of scale — the button has
                  // text and scale was making "Tiếp tục" briefly blurry on hover.
                  className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white text-sm font-semibold transition-[background-color,box-shadow] duration-150 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/55"
                >
                  Tiếp tục
                </button>
                <button
                  onClick={() => setResumePoint(midiFile.name, null)}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-sm transition-colors"
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          )}

          {/* Title */}
          <h1 className="text-2xl font-bold text-white mb-1">Chọn chế độ luyện tập</h1>
          <p className="text-slate-400 text-sm mb-6">
            Chọn tay bạn muốn tập, sau đó chọn kỹ năng — note, nhịp, hay cả hai.
          </p>

          {/* Featured: Xem & Nghe ─────────────────────────────────────────── */}
          <button
            onClick={() => startFresh('view-listen')}
            // Lift via shadow + border highlight + gradient brightness — never
            // scale, because the card contains text (title, description, BPM
            // badge) and scale tweens cause subpixel text re-rasterisation.
            className="w-full mb-7 text-left p-5 rounded-2xl border border-violet-500/40 hover:border-violet-400/80 bg-gradient-to-br from-violet-700/40 via-purple-700/25 to-fuchsia-700/30 hover:from-violet-700/55 hover:via-purple-700/40 hover:to-fuchsia-700/45 hover:shadow-xl hover:shadow-violet-500/30 transition-[background,border-color,box-shadow] duration-200 group relative overflow-hidden"
          >
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/20 ring-1 ring-violet-400/40 flex items-center justify-center text-3xl shadow-lg shrink-0">
                👁
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-white text-lg">Xem và Nghe</span>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/25 text-violet-200 font-semibold border border-violet-400/30">
                    Demo
                  </span>
                </div>
                <p className="text-white/70 text-sm">
                  Tự động phát bài — xem note rơi và nghe trước khi bắt đầu tập
                </p>
              </div>
              <span className="self-center text-2xl text-violet-300 group-hover:translate-x-1 transition-transform shrink-0">
                →
              </span>
            </div>
            {/* Decorative oversized icon in the bottom-right */}
            <div className="absolute -right-3 -bottom-6 text-[7rem] leading-none opacity-[0.06] pointer-events-none select-none">
              👁
            </div>
          </button>

          {/* Hand sections ────────────────────────────────────────────────── */}
          {HANDS.map((hand) => {
            const theme = HAND_THEMES[hand]
            return (
              <section key={hand} className="mb-6">
                {/* Section heading — coloured pill + dashed rule extending right */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={[
                      'w-9 h-9 rounded-lg ring-1 flex items-center justify-center text-lg shrink-0',
                      theme.iconBg, theme.iconRing,
                    ].join(' ')}
                  >
                    {theme.emoji}
                  </div>
                  <h2 className="text-base font-bold text-white">{theme.label}</h2>
                  <div className={`flex-1 border-t border-dashed ${theme.rule}`} />
                </div>

                {/* Skill grid — 3 columns on md+, stacked on small screens */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {SKILLS.map((skill) => {
                    const mode = `${hand}-${skill.key}` as PracticeMode
                    return (
                      <SkillCard
                        key={skill.key}
                        skill={skill}
                        theme={theme}
                        onSelect={() => startFresh(mode)}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}

          {/* Footer spacer */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}

// ─── Skill card ───────────────────────────────────────────────────────────────
function SkillCard({
  skill, theme, onSelect
}: {
  skill: SkillInfo
  theme: HandTheme
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onSelect}
      // No scale, no filter: scale tweens re-rasterise text glyphs and `filter`
      // forces text from subpixel-AA to grayscale-AA, both of which look blurry.
      // Stick to colour properties (border, gradient stops, shadow) which the
      // GPU can transition without touching text rasterisation.
      className={[
        'group relative overflow-hidden text-left p-4 rounded-xl border',
        'bg-gradient-to-br', theme.cardGrad,
        theme.cardBorder, theme.cardGlow,
        'transition-[border-color,box-shadow] duration-200',
        'hover:shadow-lg',
      ].join(' ')}
    >
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xl">{skill.icon}</span>
          <span className="font-bold text-white text-sm leading-tight">{skill.label}</span>
        </div>
        <p className="text-white/65 text-xs leading-snug">{skill.desc}</p>
      </div>
      {/* Decorative oversized icon — nearly invisible, just adds texture */}
      <div className="absolute -right-3 -bottom-4 text-6xl leading-none opacity-[0.06] pointer-events-none select-none">
        {skill.icon}
      </div>
      {/* Subtle arrow that slides on hover */}
      <span className="absolute right-3 top-3 text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all text-sm">
        →
      </span>
    </button>
  )
}
