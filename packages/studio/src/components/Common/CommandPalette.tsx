import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiCommand,
  FiSearch,
  FiPlay,
  FiSquare,
  FiSettings,
  FiHelpCircle,
  FiSun,
  FiMoon,
  FiRotateCcw,
  FiRotateCw,
  FiFilePlus,
  FiSave,
  FiShield,
  FiShoppingBag,
} from 'react-icons/fi';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useDiagramStore } from '../../stores/diagramStore';
import { useBlockStore } from '../../stores/blockStore';
import { useSettingsStore } from '../../stores/settingsStore';

export interface CommandItem {
  id: string;
  category: 'node' | 'action';
  title: string;
  subtitle?: string;
  shortcut?: string;
  icon: React.ReactNode;
  perform: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectNode?: (nodeId: string) => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onOpenSecurityAudit?: () => void;
  onOpenMarketplace?: () => void;
  onRunProcess?: () => void;
  onDebugProcess?: () => void;
  onNewProcess?: () => void;
  onSaveProcess?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onSelectNode,
  onOpenSettings,
  onOpenHelp,
  onOpenSecurityAudit,
  onOpenMarketplace,
  onRunProcess,
  onDebugProcess,
  onNewProcess,
  onSaveProcess,
  onUndo,
  onRedo,
}) => {
  const { t } = useTranslation('common');
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useFocusTrap(containerRef, open);

  const diagramNodes = useDiagramStore((state) => state.nodes);
  const blockNodes = useBlockStore((state) => state.nodes);
  const nodes = (diagramNodes || blockNodes || []) as Array<{
    id: string;
    type?: string;
    data?: { label?: string; name?: string; blockData?: { type?: string } };
  }>;
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);
  const theme = useSettingsStore((state) => state.theme);

  const actions: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: 'action-run',
        category: 'action',
        title: t('navigation.run', 'Run Process'),
        shortcut: 'Ctrl+F5',
        icon: <FiPlay className="text-emerald-500" />,
        perform: () => onRunProcess?.(),
      },
      {
        id: 'action-debug',
        category: 'action',
        title: t('navigation.debug', 'Start Debugger'),
        shortcut: 'F5',
        icon: <FiSquare className="text-amber-500" />,
        perform: () => onDebugProcess?.(),
      },
      {
        id: 'action-new',
        category: 'action',
        title: t('file.new', 'New Process'),
        shortcut: 'Ctrl+N',
        icon: <FiFilePlus className="text-blue-500" />,
        perform: () => onNewProcess?.(),
      },
      {
        id: 'action-save',
        category: 'action',
        title: t('file.save', 'Save Process'),
        shortcut: 'Ctrl+S',
        icon: <FiSave className="text-indigo-500" />,
        perform: () => onSaveProcess?.(),
      },
      {
        id: 'action-undo',
        category: 'action',
        title: t('actions.undo', 'Undo'),
        shortcut: 'Ctrl+Z',
        icon: <FiRotateCcw className="text-slate-400" />,
        perform: () => onUndo?.(),
      },
      {
        id: 'action-redo',
        category: 'action',
        title: t('actions.redo', 'Redo'),
        shortcut: 'Ctrl+Y',
        icon: <FiRotateCw className="text-slate-400" />,
        perform: () => onRedo?.(),
      },
      {
        id: 'action-settings',
        category: 'action',
        title: t('settings.title', 'Settings'),
        icon: <FiSettings className="text-slate-400" />,
        perform: () => onOpenSettings?.(),
      },
      {
        id: 'action-help',
        category: 'action',
        title: t('help.keyboardShortcuts', 'Keyboard Shortcuts & Help'),
        shortcut: 'F1',
        icon: <FiHelpCircle className="text-sky-500" />,
        perform: () => onOpenHelp?.(),
      },
      {
        id: 'action-theme',
        category: 'action',
        title: t('settings.toggleTheme', 'Toggle Theme'),
        icon: theme === 'dark' ? <FiSun className="text-amber-400" /> : <FiMoon className="text-purple-400" />,
        perform: () => toggleTheme(),
      },
      {
        id: 'action-security',
        category: 'action',
        title: t('securityAudit.title', 'Security Audit'),
        icon: <FiShield className="text-rose-500" />,
        perform: () => onOpenSecurityAudit?.(),
      },
      {
        id: 'action-marketplace',
        category: 'action',
        title: t('marketplace.title', 'Marketplace'),
        icon: <FiShoppingBag className="text-pink-500" />,
        perform: () => onOpenMarketplace?.(),
      },
    ];

    return list;
  }, [t, theme, toggleTheme, onRunProcess, onDebugProcess, onNewProcess, onSaveProcess, onUndo, onRedo, onOpenSettings, onOpenHelp, onOpenSecurityAudit, onOpenMarketplace]);

  const nodeItems: CommandItem[] = useMemo(() => {
    return nodes.map((node) => {
      const data = node.data || {};
      const title = data.label || data.name || node.id;
      const subtitle = data.blockData?.type || node.type || 'Node';

      return {
        id: `node-${node.id}`,
        category: 'node',
        title,
        subtitle: `ID: ${node.id} • ${subtitle}`,
        icon: <FiCommand className="text-cyan-500" />,
        perform: () => onSelectNode?.(node.id),
      };
    });
  }, [nodes, onSelectNode]);

  const allItems = useMemo(() => [...actions, ...nodeItems], [actions, nodeItems]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allItems;

    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(query))
    );
  }, [allItems, search]);

  useEffect(() => {
    void Promise.resolve().then(() => setSelectedIndex(0));
  }, [search]);

  useEffect(() => {
    if (open) {
      void Promise.resolve().then(() => {
        setSearch('');
        setSelectedIndex(0);
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].perform();
        onClose();
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-xs">
      <div
        ref={containerRef}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl mx-4 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-slate-900/90 gap-3">
          <FiSearch className="text-slate-400 text-lg shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('commandPalette.placeholder', 'Type a command or search nodes... (Ctrl+K)')}
            className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded font-mono shrink-0">
            ESC
          </kbd>
        </div>

        {/* Items List */}
        <div className="overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/40">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              {t('commandPalette.noResults', 'No commands or nodes found')}
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.perform();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-cyan-600/20 text-cyan-200 border border-cyan-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-xs text-slate-500 truncate">{item.subtitle}</div>
                      )}
                    </div>
                  </div>
                  {item.shortcut && (
                    <kbd className="px-2 py-0.5 text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded font-mono shrink-0 ml-3">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <div>{filteredItems.length} items</div>
        </div>
      </div>
    </div>
  );
};
