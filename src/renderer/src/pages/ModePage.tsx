import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import type { PracticeMode } from '../types'

interface ModeOption {
  id: PracticeMode
  label: string
  description: string
  icon: string
  color: string
}

const MODES: ModeOption[] = [
  {
    id: 'view-listen',
    label: 'Xem và Nghe',
    description: 'Xem note rơi và nghe bài nhạc tự động phát',
    icon: '👁️',
    color: 'from-slate-600 to-slate-500'
  },
  {
    id: 'right-melody',
    label: 'Tay phải — Melody',
    description: 'Tập đánh đúng note bằng tay phải',
    icon: '🫱',
    color: 'from-blue-700 to-blue-500'
  },
  {
    id: 'left-melody',
    label: 'Tay trái — Melody',
    description: 'Tập đánh đúng note bằng tay trái',
    icon: '🫲',
    color: 'from-purple-700 to-purple-500'
  },
  {
    id: 'both-melody',
    label: 'Cả 2 tay — Melody',
    description: 'Tập đánh đúng note bằng cả 2 tay',
    icon: '🙌',
    color: 'from-indigo-700 to-indigo-500'
  },
  {
    id: 'right-rhythm',
    label: 'Tay phải — Rhythm',
    description: 'Chỉ cần đánh đúng nhịp, không cần đúng note',
    icon: '🫱',
    color: 'from-blue-700 to-cyan-500'
  },
  {
    id: 'left-rhythm',
    label: 'Tay trái — Rhythm',
    description: 'Chỉ cần đánh đúng nhịp tay trái',
    icon: '🫲',
    color: 'from-purple-700 to-pink-500'
  },
  {
    id: 'both-rhythm',
    label: 'Cả 2 tay — Rhythm',
    description: 'Chỉ cần đánh đúng nhịp bằng cả 2 tay',
    icon: '🙌',
    color: 'from-indigo-700 to-cyan-500'
  },
  {
    id: 'right-melody-rhythm',
    label: 'Tay phải — Melody + Rhythm',
    description: 'Đúng cả note lẫn nhịp bằng tay phải',
    icon: '🫱',
    color: 'from-blue-800 to-blue-400'
  },
  {
    id: 'left-melody-rhythm',
    label: 'Tay trái — Melody + Rhythm',
    description: 'Đúng cả note lẫn nhịp bằng tay trái',
    icon: '🫲',
    color: 'from-purple-800 to-purple-400'
  },
  {
    id: 'both-melody-rhythm',
    label: 'Cả 2 tay — Melody + Rhythm',
    description: 'Đúng cả note lẫn nhịp bằng cả 2 tay',
    icon: '🙌',
    color: 'from-indigo-800 to-blue-400'
  }
]

function formatTime(s: number): string {
  const m   = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function ModePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { midiFile, setPracticeSettings, resumePoint, setResumePoint } = useAppContext()

  if (!midiFile) {
    navigate('/')
    return <></>
  }

  const startFresh = (mode: PracticeMode) => {
    setResumePoint(null)
    setPracticeSettings({ mode, midiFile })
    navigate('/practice')
  }

  const continueSession = () => {
    if (!resumePoint) return
    setPracticeSettings({ mode: resumePoint.mode, midiFile })
    navigate('/practice')
  }

  return (
    <div className="flex flex-col h-screen bg-piano-black text-white">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 bg-slate-900 border-b border-slate-700" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-white transition-colors text-sm"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ← Quay lại
        </button>
        <div className="w-px h-5 bg-slate-600" />
        <span className="text-slate-300 font-medium truncate">{midiFile.name}</span>
        <span className="text-slate-500 text-sm">{Math.round(midiFile.bpm)} BPM</span>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">

          {/* Resume banner */}
          {resumePoint && (
            <div className="mb-6 p-4 rounded-xl bg-slate-800 border border-slate-600 flex items-center justify-between gap-4">
              <div>
                <p className="text-white font-semibold text-sm">Tiếp tục từ {formatTime(resumePoint.time)}</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {MODES.find(m => m.id === resumePoint.mode)?.label ?? resumePoint.mode}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={continueSession}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
                >
                  Tiếp tục
                </button>
                <button
                  onClick={() => setResumePoint(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          )}

          <h1 className="text-2xl font-bold text-white mb-1">Chọn chế độ luyện tập</h1>
          <p className="text-slate-400 text-sm mb-6">
            Chọn bộ phận và loại kỹ năng bạn muốn tập
          </p>

          {/* View & Listen */}
          <div className="mb-6">
            <ModeCard mode={MODES[0]} onSelect={startFresh} />
          </div>

          {/* Melody modes */}
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Melody — đánh đúng note</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {MODES.slice(1, 4).map((m) => <ModeCard key={m.id} mode={m} onSelect={startFresh} />)}
          </div>

          {/* Rhythm modes */}
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Rhythm — đánh đúng nhịp</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {MODES.slice(4, 7).map((m) => <ModeCard key={m.id} mode={m} onSelect={startFresh} />)}
          </div>

          {/* Melody + Rhythm */}
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Melody + Rhythm — đánh đúng cả hai</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODES.slice(7).map((m) => <ModeCard key={m.id} mode={m} onSelect={startFresh} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeCard({ mode, onSelect }: { mode: ModeOption; onSelect: (id: PracticeMode) => void }): React.JSX.Element {
  return (
    <button
      onClick={() => onSelect(mode.id)}
      className={[
        'w-full text-left p-4 rounded-xl bg-gradient-to-br border border-white/10',
        'hover:scale-[1.02] hover:border-white/25 transition-all duration-150',
        mode.color
      ].join(' ')}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{mode.icon}</span>
        <span className="font-bold text-white text-sm leading-tight">{mode.label}</span>
      </div>
      <p className="text-white/60 text-xs leading-relaxed">{mode.description}</p>
    </button>
  )
}
