import React, { useState, useMemo } from 'react';
import {
  FiFile,
  FiPhone,
  FiFolder,
  FiFolderPlus,
  FiPlus,
  FiChevronRight,
  FiChevronDown,
  FiMoreVertical,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiMove,
} from 'react-icons/fi';
import { useDiagramStore, type DiagramMetadata, type DiagramType } from '../../stores/diagramStore';

interface DiagramExplorerProps {
  onSelectDiagram: (id: string) => void;
  activeDiagramId: string | null;
}

interface DragItem {
  type: 'diagram' | 'folder';
  id: string;
  folder?: string;
}

const DiagramExplorer: React.FC<DiagramExplorerProps> = ({
  onSelectDiagram,
  activeDiagramId,
}) => {
  const {
    project,
    addDiagram,
    removeDiagram,
    updateDiagram,
    addFolder,
  } = useDiagramStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));
  const [showNewDiagramDialog, setShowNewDiagramDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newDiagramName, setNewDiagramName] = useState('');
  const [newDiagramType, setNewDiagramType] = useState<DiagramType>('sub-diagram');
  const [newDiagramFolder, setNewDiagramFolder] = useState<string | undefined>();
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string | undefined>();
  const [contextMenu, setContextMenu] = useState<{
    type: 'diagram' | 'folder';
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const folders = useMemo(() => {
    const folderSet = new Set<string>();
    project?.diagrams.forEach((d) => {
      if (d.folder) {
        const parts = d.folder.split('/');
        for (let i = 1; i <= parts.length; i++) {
          folderSet.add(parts.slice(0, i).join('/'));
        }
      }
    });
    return Array.from(folderSet).sort();
  }, [project?.diagrams]);

  const diagramsByFolder = useMemo(() => {
    const map = new Map<string | undefined, DiagramMetadata[]>();
    project?.diagrams.forEach((d) => {
      const folder = d.folder || undefined;
      if (!map.has(folder)) {
        map.set(folder, []);
      }
      map.get(folder)!.push(d);
    });
    return map;
  }, [project?.diagrams]);

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };

  const getDiagramIcon = (type: DiagramType) => {
    switch (type) {
      case 'main':
        return <FiFile className="w-4 h-4 text-green-500" />;
      case 'sub-diagram':
        return <FiPhone className="w-4 h-4 text-indigo-500" />;
      case 'library':
        return <FiFile className="w-4 h-4 text-purple-500" />;
      default:
        return <FiFile className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleCreateDiagram = () => {
    if (!newDiagramName.trim()) return;

    addDiagram({
      name: newDiagramName.trim(),
      type: newDiagramType,
      path: `processes/${newDiagramFolder ? `${newDiagramFolder}/` : ''}${newDiagramName.toLowerCase().replace(/\s+/g, '-')}.diagram.json`,
      folder: newDiagramFolder,
    });

    setNewDiagramName('');
    setShowNewDiagramDialog(false);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;

    const folderPath = newFolderParent
      ? `${newFolderParent}/${newFolderName.trim()}`
      : newFolderName.trim();

    addFolder(folderPath);
    setNewFolderName('');
    setShowNewFolderDialog(false);
  };

  const handleDragStart = (e: React.DragEvent, type: 'diagram' | 'folder', id: string, folder?: string) => {
    setDragItem({ type, id, folder });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, id, folder }));
  };

  const handleDragOver = (e: React.DragEvent, targetFolder?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(targetFolder || null);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolder?: string) => {
    e.preventDefault();
    setDropTarget(null);

    if (!dragItem) return;

    if (dragItem.type === 'diagram') {
      if (dragItem.folder !== targetFolder) {
        updateDiagram(dragItem.id, { folder: targetFolder });
      }
    }

    setDragItem(null);
  };

  const handleDiagramDragStart = (e: React.DragEvent, diagram: DiagramMetadata) => {
    e.dataTransfer.setData(
      'application/rpaforge-diagram',
      JSON.stringify({
        type: 'sub-diagram-call',
        diagramId: diagram.id,
        diagramName: diagram.name,
        inputs: diagram.inputs || [],
        outputs: diagram.outputs || [],
      })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'diagram' | 'folder', id: string) => {
    e.preventDefault();
    setContextMenu({ type, id, x: e.clientX, y: e.clientY });
  };

  const renderFolder = (folder: string | undefined, depth = 0) => {
    const isExpanded = expandedFolders.has(folder || '');
    const diagrams = diagramsByFolder.get(folder) || [];
    const childFolders = folders.filter((f) => {
      if (!folder) return !f.includes('/');
      return f.startsWith(folder + '/') && f.split('/').length === folder.split('/').length + 1;
    });

    const isDropTarget = dropTarget === (folder || null);
    const folderName = folder ? folder.split('/').pop() : 'Root';

    const folderElement = folder ? (
      <div
        key={folder}
        className={`flex items-center gap-1 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-sm ${
          isDropTarget ? 'bg-indigo-100 dark:bg-indigo-900' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => toggleFolder(folder)}
        onDragOver={(e) => handleDragOver(e, folder)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, folder)}
        draggable
        onDragStart={(e) => handleDragStart(e, 'folder', folder, folder)}
        onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
      >
        {isExpanded ? (
          <FiChevronDown className="w-3 h-3 text-slate-400" />
        ) : (
          <FiChevronRight className="w-3 h-3 text-slate-400" />
        )}
        <FiFolder className="w-4 h-4 text-amber-500" />
        <span className="text-slate-700 dark:text-slate-300 flex-1">{folderName}</span>
      </div>
    ) : null;

    return (
      <div key={folder || 'root'}>
        {folder && folderElement}
        {(!folder || isExpanded) && (
          <div
            className={isDropTarget && !folder ? 'bg-indigo-100 dark:bg-indigo-900' : ''}
            onDragOver={(e) => handleDragOver(e, undefined)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, undefined)}
          >
            {childFolders.map((f) => renderFolder(f, folder ? depth + 1 : 0))}
            {diagrams.map((d) => renderDiagram(d, folder ? depth + 1 : 0))}
          </div>
        )}
      </div>
    );
  };

  const renderDiagram = (diagram: DiagramMetadata, depth: number) => {
    const isActive = diagram.id === activeDiagramId;
    const isDropTarget = dropTarget === diagram.id;

    return (
      <div
        key={diagram.id}
        className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-sm group ${
          isActive
            ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
        } ${isDropTarget ? 'ring-2 ring-indigo-500' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
        onClick={() => onSelectDiagram(diagram.id)}
        onContextMenu={(e) => handleContextMenu(e, 'diagram', diagram.id)}
        draggable
        onDragStart={(e) => {
          handleDiagramDragStart(e, diagram);
          handleDragStart(e, 'diagram', diagram.id, diagram.folder);
        }}
      >
        {getDiagramIcon(diagram.type)}
        <span className="truncate flex-1">{diagram.name}</span>
        {diagram.inputs && diagram.inputs.length > 0 && (
          <span className="text-xs text-slate-400">📥{diagram.inputs.length}</span>
        )}
        {diagram.outputs && diagram.outputs.length > 0 && (
          <span className="text-xs text-slate-400">📤{diagram.outputs.length}</span>
        )}
        <button
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
          onClick={(e) => {
            e.stopPropagation();
            handleContextMenu(e, 'diagram', diagram.id);
          }}
        >
          <FiMoreVertical className="w-3 h-3" />
        </button>
      </div>
    );
  };

  if (!project) {
    return (
      <div className="p-4 text-center text-sm text-slate-500">
        No project open
        <button
          className="mt-2 px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs"
          onClick={() => useDiagramStore.getState().createProject('New Project')}
        >
          Create Project
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-medium text-slate-500 uppercase">Diagrams</span>
        <div className="flex gap-1">
          <button
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setShowNewFolderDialog(true)}
            title="Add folder"
          >
            <FiFolderPlus className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setShowNewDiagramDialog(true)}
            title="Add diagram"
          >
            <FiPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {renderFolder(undefined, 0)}
      </div>

      {showNewDiagramDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold">New Diagram</h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newDiagramName}
                  onChange={(e) => setNewDiagramName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                  placeholder="My Sub-Diagram"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={newDiagramType}
                  onChange={(e) => setNewDiagramType(e.target.value as DiagramType)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                >
                  <option value="sub-diagram">Sub-Diagram (Reusable)</option>
                  <option value="library">Library (Utilities)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Folder</label>
                <select
                  value={newDiagramFolder || ''}
                  onChange={(e) => setNewDiagramFolder(e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                >
                  <option value="">Root</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
                onClick={() => setShowNewDiagramDialog(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                onClick={handleCreateDiagram}
                disabled={!newDiagramName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewFolderDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold">New Folder</h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                  placeholder="authentication"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Parent Folder</label>
                <select
                  value={newFolderParent || ''}
                  onChange={(e) => setNewFolderParent(e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                >
                  <option value="">Root</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
              <button
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
                onClick={() => setShowNewFolderDialog(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-lg py-1 z-50 min-w-[150px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'diagram' ? (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => {
                    const diagram = useDiagramStore.getState().getDiagram(contextMenu.id);
                    if (diagram) {
                      setNewDiagramName(diagram.name);
                      setNewDiagramType(diagram.type);
                      setNewDiagramFolder(diagram.folder);
                      setShowNewDiagramDialog(true);
                    }
                    setContextMenu(null);
                  }}
                >
                  <FiEdit2 className="w-4 h-4" /> Rename
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => {
                    const diagram = useDiagramStore.getState().getDiagram(contextMenu.id);
                    if (diagram) {
                      addDiagram({
                        name: `${diagram.name} (Copy)`,
                        type: diagram.type,
                        path: diagram.path.replace('.diagram.json', '-copy.diagram.json'),
                        folder: diagram.folder,
                      });
                    }
                    setContextMenu(null);
                  }}
                >
                  <FiCopy className="w-4 h-4" /> Duplicate
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => {
                    setContextMenu(null);
                  }}
                >
                  <FiMove className="w-4 h-4" /> Move to...
                </button>
                <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-red-600"
                  onClick={() => {
                    removeDiagram(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <FiTrash2 className="w-4 h-4" /> Delete
                </button>
              </>
            ) : (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => {
                    setNewFolderParent(contextMenu.id);
                    setShowNewFolderDialog(true);
                    setContextMenu(null);
                  }}
                >
                  <FiFolderPlus className="w-4 h-4" /> New Subfolder
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => {
                    setNewDiagramFolder(contextMenu.id);
                    setShowNewDiagramDialog(true);
                    setContextMenu(null);
                  }}
                >
                  <FiPlus className="w-4 h-4" /> New Diagram
                </button>
                <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-red-600"
                  onClick={() => {
                    setContextMenu(null);
                  }}
                >
                  <FiTrash2 className="w-4 h-4" /> Delete Folder
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default DiagramExplorer;
