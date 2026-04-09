import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FiFile,
  FiPhone,
  FiFolder,
  FiChevronRight,
  FiChevronDown,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiFolderPlus,
  FiFilePlus,
} from 'react-icons/fi';
import { useDiagramStore, type DiagramMetadata, type DiagramType } from '../../stores/diagramStore';

interface DiagramExplorerProps {
  onSelectDiagram: (id: string) => void;
  activeDiagramId: string | null;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'diagram';
  path: string;
  diagram?: DiagramMetadata;
  children: TreeNode[];
  depth: number;
}

const DiagramExplorer: React.FC<DiagramExplorerProps> = ({
  onSelectDiagram,
  activeDiagramId,
}) => {
  const {
    project,
    folders,
    addDiagram,
    removeDiagram,
    updateDiagram,
    addFolder,
    removeFolder,
    createProject,
  } = useDiagramStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node?: TreeNode;
    isRoot?: boolean;
  } | null>(null);
  const [draggedNode, setDraggedNode] = useState<TreeNode | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo((): TreeNode[] => {
    if (!project) return [];

    const nodeMap = new Map<string, TreeNode>();
    const rootChildren: TreeNode[] = [];

    const allPaths = new Set<string>();
    folders.forEach((f) => allPaths.add(f));
    project.diagrams.forEach((d) => {
      if (d.folder) {
        const parts = d.folder.split('/');
        for (let i = 1; i <= parts.length; i++) {
          allPaths.add(parts.slice(0, i).join('/'));
        }
      }
    });

    const sortedPaths = Array.from(allPaths).sort((a, b) => {
      const aParts = a.split('/');
      const bParts = b.split('/');
      for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
        if (aParts[i] !== bParts[i]) {
          return aParts[i].localeCompare(bParts[i]);
        }
      }
      return aParts.length - bParts.length;
    });

    sortedPaths.forEach((path) => {
      const parts = path.split('/');
      const name = parts[parts.length - 1];
      nodeMap.set(path, {
        id: path,
        name,
        type: 'folder',
        path,
        children: [],
        depth: parts.length,
      });
    });

    project.diagrams.forEach((diagram) => {
      const node: TreeNode = {
        id: diagram.id,
        name: diagram.name,
        type: 'diagram',
        path: diagram.folder ? `${diagram.folder}/${diagram.id}` : diagram.id,
        diagram,
        children: [],
        depth: diagram.folder ? diagram.folder.split('/').length + 1 : 1,
      };
      nodeMap.set(diagram.id, node);
    });

    nodeMap.forEach((node) => {
      if (node.type === 'folder') {
        const parentPath = node.path.includes('/')
          ? node.path.substring(0, node.path.lastIndexOf('/'))
          : '';

        if (parentPath) {
          const parent = nodeMap.get(parentPath);
          if (parent) {
            parent.children.push(node);
          }
        } else {
          rootChildren.push(node);
        }
      }
    });

    project.diagrams.forEach((diagram) => {
      const node = nodeMap.get(diagram.id);
      if (node) {
        if (diagram.folder) {
          const parent = nodeMap.get(diagram.folder);
          if (parent) {
            parent.children.push(node);
          }
        } else {
          rootChildren.push(node);
        }
      }
    });

    const sortChildren = (children: TreeNode[]): TreeNode[] => {
      return children
        .sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        })
        .map((child) => ({
          ...child,
          children: sortChildren(child.children),
        }));
    };

    return sortChildren(rootChildren);
  }, [project, folders]);

  useEffect(() => {
    if (editingNode && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNode]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
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

  const handleContextMenu = (e: React.MouseEvent, node?: TreeNode, isRoot = false) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node, isRoot });
  };

  const handleCreateFolder = (parentPath?: string) => {
    const newFolderName = 'New Folder';
    let newPath = parentPath ? `${parentPath}/${newFolderName}` : newFolderName;

    let counter = 1;
    while (folders.includes(newPath)) {
      newPath = parentPath ? `${parentPath}/${newFolderName} ${counter}` : `${newFolderName} ${counter}`;
      counter++;
    }

    addFolder(newPath);
    setExpandedFolders((prev) => new Set([...prev, parentPath || '']));

    setTimeout(() => {
      setEditingNode(newPath);
      setEditValue(newFolderName);
    }, 100);

    setContextMenu(null);
  };

  const handleCreateDiagram = (parentPath?: string) => {
    const newDiagramName = 'New Diagram';
    const diagram = addDiagram({
      name: newDiagramName,
      type: 'sub-diagram',
      path: `processes/${newDiagramName.toLowerCase().replace(/\s+/g, '-')}.diagram.json`,
      folder: parentPath,
    });

    if (parentPath) {
      setExpandedFolders((prev) => new Set([...prev, parentPath]));
    }

    setTimeout(() => {
      setEditingNode(diagram.id);
      setEditValue(newDiagramName);
    }, 100);

    setContextMenu(null);
  };

  const handleRename = (node: TreeNode) => {
    setEditingNode(node.id);
    setEditValue(node.name);
    setContextMenu(null);
  };

  const handleDelete = (node: TreeNode) => {
    if (node.type === 'folder') {
      removeFolder(node.path);
    } else {
      removeDiagram(node.id);
    }
    setContextMenu(null);
  };

  const handleDuplicate = (node: TreeNode) => {
    if (node.type === 'diagram' && node.diagram) {
      addDiagram({
        name: `${node.diagram.name} (Copy)`,
        type: node.diagram.type,
        path: node.diagram.path.replace('.diagram.json', '-copy.diagram.json'),
        folder: node.diagram.folder,
      });
    }
    setContextMenu(null);
  };

  const handleEditSubmit = (node: TreeNode) => {
    if (editValue.trim()) {
      if (node.type === 'folder') {
        const oldPath = node.path;
        const parentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
        const newPath = parentPath ? `${parentPath}/${editValue.trim()}` : editValue.trim();

        if (oldPath !== newPath) {
          removeFolder(oldPath);
          addFolder(newPath);

          project?.diagrams.forEach((d) => {
            if (d.folder === oldPath || d.folder?.startsWith(oldPath + '/')) {
              updateDiagram(d.id, {
                folder: d.folder?.replace(oldPath, newPath),
              });
            }
          });
        }
      } else if (node.diagram) {
        updateDiagram(node.id, { name: editValue.trim() });
      }
    }
    setEditingNode(null);
    setEditValue('');
  };

  const handleDragStart = (e: React.DragEvent, node: TreeNode) => {
    setDraggedNode(node);
    e.dataTransfer.effectAllowed = 'move';

    if (node.type === 'diagram' && node.diagram) {
      e.dataTransfer.setData(
        'application/rpaforge-diagram',
        JSON.stringify({
          type: 'sub-diagram-call',
          diagramId: node.diagram.id,
          diagramName: node.diagram.name,
          inputs: node.diagram.inputs || [],
          outputs: node.diagram.outputs || [],
        })
      );
    }
  };

  const handleDragOver = (e: React.DragEvent, node: TreeNode) => {
    e.preventDefault();
    if (node.type === 'folder' && draggedNode?.id !== node.id) {
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(node.id);
    }
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetNode: TreeNode) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedNode || draggedNode.type !== 'diagram' || targetNode.type !== 'folder') {
      setDraggedNode(null);
      return;
    }

    const targetFolder = targetNode.path;
    if (draggedNode.diagram && draggedNode.diagram.folder !== targetFolder) {
      updateDiagram(draggedNode.id, { folder: targetFolder || undefined });
    }

    setDraggedNode(null);
  };

  const handleDropOnRoot = (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedNode || draggedNode.type !== 'diagram') {
      setDraggedNode(null);
      return;
    }

    if (draggedNode.diagram && draggedNode.diagram.folder) {
      updateDiagram(draggedNode.id, { folder: undefined });
    }

    setDraggedNode(null);
  };

  const renderNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path);
    const isEditing = editingNode === node.id;
    const isDropTarget = dropTarget === node.id;
    const isSelected = selectedNode === node.id;
    const isActive = node.type === 'diagram' && node.id === activeDiagramId;

    if (node.type === 'folder') {
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-sm select-none
              ${isDropTarget ? 'bg-indigo-100 dark:bg-indigo-900' : ''}
              ${isSelected ? 'bg-slate-200 dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}
            `}
            style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
            onClick={() => toggleFolder(node.path)}
            onContextMenu={(e) => handleContextMenu(e, node)}
            onDragOver={(e) => handleDragOver(e, node)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, node)}
            draggable
            onDragStart={(e) => handleDragStart(e, node)}
          >
            {isExpanded ? (
              <FiChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
            ) : (
              <FiChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            )}
            <FiFolder className="w-4 h-4 text-amber-500 flex-shrink-0" />
            {isEditing ? (
              <input
                ref={editInputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleEditSubmit(node)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEditSubmit(node);
                  if (e.key === 'Escape') {
                    setEditingNode(null);
                    setEditValue('');
                  }
                }}
                className="flex-1 px-1 py-0.5 bg-white dark:bg-slate-700 border border-indigo-500 rounded text-sm outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate text-slate-700 dark:text-slate-300">{node.name}</span>
            )}
          </div>
          {isExpanded && node.children.length > 0 && (
            <div>{node.children.map((child) => renderNode(child))}</div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-sm select-none
          ${isActive ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : ''}
          ${isSelected && !isActive ? 'bg-slate-200 dark:bg-slate-700' : ''}
          hover:bg-slate-100 dark:hover:bg-slate-800
        `}
        style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
        onClick={() => {
          setSelectedNode(node.id);
          if (node.diagram) {
            onSelectDiagram(node.id);
          }
        }}
        onContextMenu={(e) => handleContextMenu(e, node)}
        draggable
        onDragStart={(e) => handleDragStart(e, node)}
      >
        <div className="w-4 flex-shrink-0" />
        {node.diagram && getDiagramIcon(node.diagram.type)}
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleEditSubmit(node)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEditSubmit(node);
              if (e.key === 'Escape') {
                setEditingNode(null);
                setEditValue('');
              }
            }}
            className="flex-1 px-1 py-0.5 bg-white dark:bg-slate-700 border border-indigo-500 rounded text-sm outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="truncate text-slate-700 dark:text-slate-300 flex-1">
              {node.name}
            </span>
            {node.diagram?.inputs && node.diagram.inputs.length > 0 && (
              <span className="text-xs text-slate-400">📥{node.diagram.inputs.length}</span>
            )}
            {node.diagram?.outputs && node.diagram.outputs.length > 0 && (
              <span className="text-xs text-slate-400">📤{node.diagram.outputs.length}</span>
            )}
          </>
        )}
      </div>
    );
  };

  if (!project) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-2 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-medium text-slate-500 uppercase">Explorer</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <FiFolder className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">No project opened</p>
            <button
              onClick={() => createProject('My Project')}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
            >
              Create Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-medium text-slate-500 uppercase">Explorer</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleCreateFolder()}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            title="New Folder"
          >
            <FiFolderPlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleCreateDiagram()}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            title="New Diagram"
          >
            <FiFilePlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto py-1"
        onContextMenu={(e) => handleContextMenu(e, undefined, true)}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={handleDropOnRoot}
      >
        {tree.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            <p>No diagrams yet</p>
            <p className="text-xs mt-1">Right-click to create a diagram</p>
          </div>
        ) : (
          tree.map((node) => renderNode(node))
        )}
      </div>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.isRoot && !contextMenu.node && (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => handleCreateFolder()}
                >
                  <FiFolderPlus className="w-4 h-4" /> New Folder
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => handleCreateDiagram()}
                >
                  <FiFilePlus className="w-4 h-4" /> New Diagram
                </button>
              </>
            )}
            {contextMenu.node?.type === 'folder' && (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => handleCreateFolder(contextMenu.node?.path)}
                >
                  <FiFolderPlus className="w-4 h-4" /> New Folder
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => handleCreateDiagram(contextMenu.node?.path)}
                >
                  <FiFilePlus className="w-4 h-4" /> New Diagram
                </button>
                <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => contextMenu.node && handleRename(contextMenu.node)}
                >
                  <FiEdit2 className="w-4 h-4" /> Rename
                </button>
                <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-red-600"
                  onClick={() => contextMenu.node && handleDelete(contextMenu.node)}
                >
                  <FiTrash2 className="w-4 h-4" /> Delete
                </button>
              </>
            )}
            {contextMenu.node?.type === 'diagram' && (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => contextMenu.node && handleRename(contextMenu.node)}
                >
                  <FiEdit2 className="w-4 h-4" /> Rename
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => contextMenu.node && handleDuplicate(contextMenu.node)}
                >
                  <FiCopy className="w-4 h-4" /> Duplicate
                </button>
                <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-red-600"
                  onClick={() => contextMenu.node && handleDelete(contextMenu.node)}
                >
                  <FiTrash2 className="w-4 h-4" /> Delete
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
