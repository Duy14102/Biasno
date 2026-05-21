import React from 'react'
import { useLanguage } from '@/i18n'
import { TrashIcon } from './icons'
import { ConfirmModal } from '@/components/common'

interface Props {
  name:      string
  onCancel:  () => void
  onConfirm: () => void
}

export default function ClearConfirmModal({ name, onCancel, onConfirm }: Props): React.JSX.Element {
  const { t } = useLanguage()
  return (
    <ConfirmModal
      icon={<TrashIcon className="w-5 h-5" />}
      iconAccent="red"
      title={t('freeClearConfirmTitle')}
      subtitle={name || t('freeUntitled')}
      cancelLabel={t('freeCancel')}
      confirmLabel={t('freeClear')}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <p>{t('freeClearConfirmBody')}</p>
      <p className="mt-2 text-xs text-slate-500">{t('freeClearConfirmNote')}</p>
    </ConfirmModal>
  )
}
