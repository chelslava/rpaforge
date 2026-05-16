import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  key: string;
  descriptionKey: string;
}

interface ShortcutGroup {
  titleKey: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    titleKey: 'help.file',
    shortcuts: [
      { key: 'Ctrl+N', descriptionKey: 'shortcuts.newProcess' },
      { key: 'Ctrl+O', descriptionKey: 'shortcuts.openProcess' },
      { key: 'Ctrl+S', descriptionKey: 'shortcuts.saveProcess' },
      { key: 'Ctrl+Shift+S', descriptionKey: 'actions.saveAs' },
    ],
  },
  {
    titleKey: 'help.edit',
    shortcuts: [
      { key: 'Ctrl+Z', descriptionKey: 'actions.undo' },
      { key: 'Ctrl+Shift+Z', descriptionKey: 'actions.redo' },
      { key: 'Ctrl+C', descriptionKey: 'shortcuts.copySelected' },
      { key: 'Ctrl+V', descriptionKey: 'actions.paste' },
      { key: 'Ctrl+X', descriptionKey: 'shortcuts.cutSelected' },
      { key: 'Ctrl+D', descriptionKey: 'shortcuts.duplicateSelected' },
    ],
  },
  {
    titleKey: 'help.canvas',
    shortcuts: [
      { key: 'Ctrl+Space', descriptionKey: 'shortcuts.fitCanvas' },
      { key: 'Delete', descriptionKey: 'shortcuts.deleteSelected' },
      { key: 'Tab', descriptionKey: 'shortcuts.selectNext' },
      { key: 'Arrow keys', descriptionKey: 'shortcuts.moveNode' },
    ],
  },
  {
    titleKey: 'help.run',
    shortcuts: [
      { key: 'F5', descriptionKey: 'shortcuts.runProcess' },
      { key: 'F6', descriptionKey: 'shortcuts.pauseProcess' },
      { key: 'F7', descriptionKey: 'shortcuts.resumeProcess' },
      { key: 'F8', descriptionKey: 'shortcuts.stopProcess' },
    ],
  },
  {
    titleKey: 'help.debug',
    shortcuts: [
      { key: 'F9', descriptionKey: 'shortcuts.toggleBreakpoint' },
    ],
  },
];

const HelpDialog: React.FC<HelpDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation('common');
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="help-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('help.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none"
            aria-label={t('fileMenu.closeDialog')}
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.titleKey}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                {t(group.titleKey)}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {group.shortcuts.map(({ key, descriptionKey }) => (
                    <tr key={key} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-1.5 pr-4 w-40">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-xs">
                          {key}
                        </kbd>
                      </td>
                      <td className="py-1.5 text-slate-600 dark:text-slate-300">
                        {t(descriptionKey)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HelpDialog;
