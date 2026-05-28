// CSS injected into TrimRange.  Pulled out into its own module so the
// component stays under the project's per-file size budget.
export const TIMELINE_STYLES = `
.fm-timeline-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(100, 116, 139, 0.45) transparent;
}
.fm-timeline-scroll::-webkit-scrollbar      { height: 8px; background: transparent; }
.fm-timeline-scroll::-webkit-scrollbar-track { background: transparent; margin: 0 12px; }
.fm-timeline-scroll::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.45);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.fm-timeline-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.7);
  background-clip: content-box;
}

@keyframes fm-ph-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.45), inset 0 0 0 2px rgba(147, 197, 253, 0.7); }
  50%      { box-shadow: 0 0 0 6px rgba(96, 165, 250, 0.0), inset 0 0 0 2px rgba(147, 197, 253, 1);   }
}
.fm-placeholder       { animation: fm-ph-pulse 1.3s ease-in-out infinite; }
.fm-placeholder-over  { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.0), inset 0 0 0 3px rgba(56, 189, 248, 1) !important; animation: none !important; }

@keyframes fm-ghost-fade { from { opacity: 0; } to { opacity: 0.55; } }
.fm-ghost { animation: fm-ghost-fade 160ms ease-out both; }

.fm-trim-chip {
  top: 0;
  height: 16px;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  will-change: transform;
  background-color: rgba(59, 130, 246, 0.15);
  transition:
    background-color 180ms ease,
    box-shadow       180ms ease;
}
.fm-trim-chip[data-pinned="true"] {
  background-color: rgba(59, 130, 246, 0.3);
  box-shadow:
    inset 0 0 0 1px rgba(96, 165, 250, 0.6),
    0 2px 6px -2px rgba(59, 130, 246, 0.35);
}
`
