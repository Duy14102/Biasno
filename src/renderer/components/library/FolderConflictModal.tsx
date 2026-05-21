import React from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { WarningIcon } from './icons'
import ConfirmModal from '../common/ConfirmModal'

interface Props {
  folder:    string
  conflicts: Array<{ name: string; path: string }>
  onCancel:  () => void
  onConfirm: () => void
}

export default function FolderConflictModal({
  folder, conflicts, onCancel, onConfirm,
}: Props): React.JSX.Element {
  const { t } = useLanguage()
  return (
    <ConfirmModal
      icon={<WarningIcon className="w-5 h-5" />}
      iconAccent="amber"
      title={t('folderConflictTitle')}
      subtitle={folder}
      cancelLabel={t('cancel')}
      confirmLabel={t('folderConflictAdd')}
      confirmAccent="amber"
      width={460}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <p>{t('folderConflictDesc', { n: conflicts.length })}</p>
      <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 px-3 py-2 text-xs font-mono text-slate-600 dark:text-slate-400">
        {conflicts.map((c) => (
          <li key={c.path} className="truncate" title={c.path}>{c.name}</li>
        ))}
      </ul>
    </ConfirmModal>
  )
}
