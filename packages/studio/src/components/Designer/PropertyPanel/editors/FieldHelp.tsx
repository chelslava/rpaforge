import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiHelpCircle, FiX } from 'react-icons/fi'

interface FieldHelpProps {
  title: string
  description?: string
  format?: string
  examples?: Array<{ value: string; label: string }>
}

export function FieldHelp({ title, description, format, examples }: FieldHelpProps) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation('common')
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="ml-1 text-slate-400 hover:text-indigo-500 transition-colors"
        title={t('fieldHelp.helpFor', { title })}
      >
        <FiHelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{title}</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><FiX className="w-3 h-3" /></button>
          </div>
          {description && <p className="text-slate-600 dark:text-slate-300 mb-2">{description}</p>}
          {format && (
            <div className="mb-2">
              <span className="text-slate-500 font-medium">{t('fieldHelp.format')} </span>
              <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{format}</code>
            </div>
          )}
          {examples && examples.length > 0 && (
            <div>
              <span className="text-slate-500 font-medium block mb-1">{t('fieldHelp.examples')}</span>
              {examples.map(ex => (
                <div key={ex.value} className="flex items-start gap-2 mb-1">
                  <code className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1 rounded flex-shrink-0">{ex.value}</code>
                  <span className="text-slate-500">{ex.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
