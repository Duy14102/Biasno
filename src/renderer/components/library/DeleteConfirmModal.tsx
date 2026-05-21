import React from 'react'
import type { FileEntry } from '../../context/AppContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { FolderIcon, ImportIcon } from './icons'
import ConfirmModal from '../common/ConfirmModal'

interface Props {
  entry:     FileEntry
  onCancel:  () => void
  onConfirm: () => void
}

export default function DeleteConfirmModal({ entry, onCancel, onConfirm }: Props): React.JSX.Element {
  const { t } = useLanguage()
  const isFolder = entry.source === 'folder'

  return (
    <ConfirmModal
      icon={isFolder ? <FolderIcon className="w-5 h-5" /> : <ImportIcon className="w-5 h-5" />}
      iconAccent={isFolder ? 'amber' : 'blue'}
      title={t('removeFromListQuestion')}
      subtitle={entry.name}
      cancelLabel={t('cancel')}
      confirmLabel={t('deleteAction')}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {isFolder ? (
        <>
          <p>
            {t('folderEntryDescA')}<span className="text-amber-700 dark:text-amber-300 font-medium">{t('folderEntryDescB')}</span>{t('folderEntryDescC')}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {t('folderRescanNote')}
          </p>
        </>
      ) : (
        <>
          <p>
            {t('importEntryDescA')}<span className="text-blue-700 dark:text-blue-300 font-medium">{t('importEntryDescB')}</span>{t('importEntryDescC')}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {t('importAgainNote')}
          </p>
        </>
      )}
    </ConfirmModal>
  )
}
