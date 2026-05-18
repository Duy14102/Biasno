// Vietnamese — canonical shape.  `TranslationKey` in translations.ts is
// derived from this object, so add new keys here first.

export const vi = {
  // ── App / home header ───────────────────────────────────────────────────
  appSubtitle:            'Học piano qua MIDI',
  audioLoading:           '⏳ Đang tải âm thanh...',
  audioError:             '⚠ Lỗi âm thanh',
  splashLoading:          'Đang khởi động',
  splashHint:             'Đang chuẩn bị mọi thứ cho bạn...',
  audioStatusLoading:     '⌛ Đang tải...',
  audioStatusError:       '⚠ Lỗi',
  language:               'Ngôn ngữ',
  themeDarkHint:          'Chế độ tối — nhấn để chuyển sáng',
  themeLightHint:         'Chế độ sáng — nhấn để chuyển tối',

  // ── MIDI device picker ──────────────────────────────────────────────────
  midiDevicesHeading:     'Đàn điện / MIDI',
  deviceConnected:        'Đã kết nối — nhấn để ngắt',
  deviceClickToConnect:   'Nhấn để kết nối',
  midiUnavailable:        'MIDI không khả dụng',
  noDeviceConnected:      'Chưa kết nối đàn',
  noWebMidiSupport:       'Trình duyệt không hỗ trợ Web MIDI API',
  connectUsbInstruction:  'Cắm đàn qua cổng USB rồi thử lại — hoặc dùng phím máy tính bên dưới.',
  computerKeys:           'Phím máy tính',

  // ── Library list ────────────────────────────────────────────────────────
  songList:               'Danh sách bài',
  songsCount:             '{n} bài',
  importFile:             '📂 Import file',
  chooseFolder:           '🗂 Chọn thư mục',
  noSongsYet:             'Chưa có bài nhạc nào',
  noSongsHintBefore:      'Bấm ',
  noSongsHintImport:      'Import file',
  noSongsHintMiddle:      ' hoặc ',
  noSongsHintFolder:      'Chọn thư mục',
  noSongsHintAfter:       ' phía trên, hoặc kéo thả file ',
  noSongsHintTail:        ' vào đây.',
  dropMidiHere:           'Thả file MIDI vào đây',
  midOrMidi:              '.mid hoặc .midi',
  fromFolder:             'Từ thư mục',
  fromFolderWithPath:     'Từ thư mục: {path}',
  importedFile:           'File đã import',
  loadingShort:           'Đang tải',
  removeFromListShort:    'Xóa khỏi danh sách',

  // ── Delete confirm modal ────────────────────────────────────────────────
  removeFromListQuestion: 'Xóa khỏi danh sách?',
  folderEntryDescA:       'Bài này thuộc ',
  folderEntryDescB:       'thư mục đã chọn',
  folderEntryDescC:       '. Xóa sẽ gỡ khỏi danh sách trong Biasno',
  folderRescanNote:       'Lưu ý: nếu bạn quét lại thư mục, bài sẽ xuất hiện trở lại.',
  importEntryDescA:       'Bài này là ',
  importEntryDescB:       'file import',
  importEntryDescC:       '. Xóa sẽ gỡ khỏi danh sách trong Biasno',
  importAgainNote:        'Bạn có thể import lại bất cứ lúc nào.',
  cancel:                 'Hủy',
  deleteAction:           'Xóa',

  // ── Folder-conflict modal ───────────────────────────────────────────────
  folderConflictTitle:    'Thêm các bài đã xóa trở lại?',
  folderConflictDesc:     'Thư mục này chứa {n} bài bạn đã xóa khỏi danh sách trước đây. Tiếp tục sẽ đưa các bài này trở lại.',
  folderConflictAdd:      'Thêm trở lại',

  // ── Mode page ───────────────────────────────────────────────────────────
  back:                   'Quay lại',
  continueFromLabel:      'Tiếp tục từ ',
  continueAction:         'Tiếp tục',
  skip:                   'Bỏ qua',
  choosePracticeMode:     'Chọn chế độ luyện tập',
  choosePracticeHint:     'Chọn tay bạn muốn tập, sau đó chọn kỹ năng — note, nhịp, hay cả hai.',
  viewAndListen:          'Xem và Nghe',
  viewAndListenDesc:      'Tự động phát bài — xem note rơi và nghe trước khi bắt đầu tập',
  demo:                   'Demo',

  rightHand:              'Tay phải',
  leftHand:               'Tay trái',
  bothHands:              'Cả 2 tay',
  twoHands:               'Hai tay',
  melody:                 'Melody',
  rhythm:                 'Rhythm',
  melodyRhythm:           'Melody + Rhythm',
  skillMelodyDesc:        'Đúng note',
  skillRhythmDesc:        'Đúng nhịp',
  skillBothDesc:          'Đúng cả note và nhịp',
  viewListenShort:        'Xem & Nghe',

  // ── Practice header buttons ─────────────────────────────────────────────
  rewind5s:               'Tua lại 5s',
  fastForward5s:          'Tua tới 5s',
  restartFromStart:       'Bắt đầu lại từ đầu',
  play:                   'Phát',
  pause:                  'Dừng',
  metronome:              'Đếm nhịp',
  loopOn:                 'Bật loop',
  loopOff:                'Tắt loop',
  sheetMusic:             'Sheet nhạc',
  fallingNotes:           'Note rơi',
  decreaseBpm:            'Giảm nhịp 5%',
  increaseBpm:            'Tăng nhịp 5%',
  resetTempo100:          'Nhấn để về 100%',
  defaultTempo:           'Tốc độ mặc định',
  dragTempo:              'Kéo để điều chỉnh nhịp',

  // ── Settings panel ──────────────────────────────────────────────────────
  settings:               'Cài đặt',
  audio:                  'Âm thanh',
  display:                'Hiển thị',
  unmute:                 'Bật tiếng',
  mute:                   'Tắt tiếng',
  noteSize:               'Kích cỡ note',
  measureLines:           'Đường nhịp',
  countdown321:           'Đếm ngược 3-2-1',

  // ── Mode dropdown ───────────────────────────────────────────────────────
  practiceModeHeading:    'Chế độ luyện tập',

  // ── Practice page ───────────────────────────────────────────────────────
  redirecting:            'Đang chuyển hướng...',

  // ── Sheet music ─────────────────────────────────────────────────────────
  loadingSheet:           'Đang tải sheet nhạc...',
  autoScrollOnHint:       'Auto-scroll bật — nhấn để tắt',
  autoScrollOffHint:      'Auto-scroll tắt — nhấn để bật',
  darkSheetHint:          'Chế độ tối — nhấn để chuyển sáng',
  lightSheetHint:         'Chế độ sáng — nhấn để chuyển tối',

  // ── Errors ──────────────────────────────────────────────────────────────
  errMidiNotSupported:    'Web MIDI API không được hỗ trợ',
  errCantAccessMidi:      'Không thể truy cập MIDI: {msg}',
  errCantReadMidiFile:    'Không đọc được file MIDI',
  errEmptyMidi:           'File không chứa note nào',
  errGeneric:             'Lỗi: {msg}',
  errCantReadFile:        'Không đọc được file: {msg}',
  errNoFilesDragged:      'Không có file nào được kéo vào',
  errNotMidiDragged:      'File kéo vào không phải MIDI (.mid / .midi)',
  errFailedToRead:        'Không đọc được: {names}',

  // ── Mode flash labels (mode change overlay) ─────────────────────────────
  modeFlashViewListen:    '👁️  Xem và nghe',
  modeFlashLeftMelody:    '🫲  Tay trái — Melody',
  modeFlashRightMelody:   '🫱  Tay phải — Melody',
  modeFlashBothMelody:    '🙌  Cả 2 tay — Melody',
  modeFlashLeftRhythm:    '🫲  Tay trái — Rhythm',
  modeFlashRightRhythm:   '🫱  Tay phải — Rhythm',
  modeFlashBothRhythm:    '🙌  Cả 2 tay — Rhythm',
  modeFlashLeftMR:        '🫲  Tay trái — Melody + Rhythm',
  modeFlashRightMR:       '🫱  Tay phải — Melody + Rhythm',
  modeFlashBothMR:        '🙌  Cả 2 tay — Melody + Rhythm',
}

export type Translations = typeof vi
