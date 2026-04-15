import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  FiFile,
  FiFileText,
  FiPhone,
  FiFolder,
  FiChevronRight,
  FiChevronDown,
  FiEdit2,
  FiTrash2,
  FiCopy,
  FiFolderPlus,
  FiFilePlus,
  FiSettings,
  FiExternalLink,
} from 'react-icons/fi';
import { useDiagramStore, type DiagramMetadata, type DiagramType } from '../../stores/diagramStore';
import { useProjectFsStore, type ProjectFile } from '../../stores/projectFsStore';
import DiagramSettingsDialog from './DiagramSettingsDialog';

interface DiagramExplorerProps {
  onSelectDiagram: (id: string) => void;
  activeDiagramId: string | null;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'diagram' | 'other-file';
  path: string;
  relativePath: string;
  extension?: string;
  diagram?: DiagramMetadata;
  file?: ProjectFile;
  children: TreeNode[];
  depth: number;
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
    createProject,
  } = useDiagramStore();

  const {
    files,
    projectPath,
    isLoading,
    createFolder,
    createFile,
    deleteFile,
    renameFile,
    openWithSystem,
    showInFolder,
  } = useProjectFsStore();

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
  const [settingsDiagramId, setSettingsDiagramId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo((): TreeNode[] => {
    if (!projectPath || files.length === 0) return [];

    const nodeMap = new Map<string, TreeNode>();
    const rootChildren: TreeNode[] = [];

    const diagramByPath = new Map<string, DiagramMetadata>();
    project?.diagrams.forEach((d) => {
      diagramByPath.set(d.path.replace(/\\/g, '/'), d);
    });

    const folders = files.filter((f) => f.isDirectory);
    const sortedFolders = [...folders].sort((a, b) => {
      const aDepth = a.relativePath.split('/').length;
      const bDepth = b.relativePath.split('/').length;
      return aDepth - bDepth;
    });

    sortedFolders.forEach((folder) => {
      const parts = folder.relativePath.split('/');
      const depth = parts.length;

      nodeMap.set(folder.relativePath, {
        id: folder.relativePath,
        name: folder.name,
        type: 'folder',
        path: folder.path,
        relativePath: folder.relativePath,
        children: [],
        depth,
      });
    });

    nodeMap.forEach((node) => {
      const parentPath = node.relativePath.includes('/')
        ? node.relativePath.substring(0, node.relativePath.lastIndexOf('/'))
        : '';

      if (parentPath && nodeMap.has(parentPath)) {
        nodeMap.get(parentPath)!.children.push(node);
      } else {
        rootChildren.push(node);
      }
    });

    const regularFiles = files.filter((f) => f.isFile && !f.isProjectFile);

    regularFiles.forEach((file) => {
      const normalizedPath = file.relativePath.replace(/\\/g, '/');
      const parts = normalizedPath.split('/');
      const depth = parts.length;
      const diagram = diagramByPath.get(normalizedPath);

      const node: TreeNode = {
        id: diagram?.id || normalizedPath,
        name: file.name.replace(/\.[^.]+$/, ''),
        type: file.isProcessFile ? 'diagram' : 'other-file',
        path: file.path,
        relativePath: normalizedPath,
        extension: file.extension,
        diagram,
        file,
        children: [],
        depth,
      };

      nodeMap.set(node.id, node);

      const parentPath = normalizedPath.includes('/')
        ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
        : '';

      if (parentPath && nodeMap.has(parentPath)) {
        nodeMap.get(parentPath)!.children.push(node);
      } else {
        rootChildren.push(node);
      }
    });

    const sortChildren = (children: TreeNode[]): TreeNode[] => {
      return children
        .sort((a, b) => {
          if (a.type !== b.type) {
            const typeOrder = { folder: 0, diagram: 1, 'other-file': 2 };
            return typeOrder[a.type] - typeOrder[b.type];
          }
          return a.name.localeCompare(b.name);
        })
        .map((child) => ({
          ...child,
          children: sortChildren(child.children),
        }));
    };

    return sortChildren(rootChildren);
  }, [files, projectPath, project]);

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

  const getFileIcon = (extension?: string) => {
    if (!extension) return <FiFileText className="w-4 h-4 text-slate-400" />;
    
    const ext = extension.toLowerCase();
    switch (ext) {
      case '.xlsx':
      case '.xls':
        return <FiFileText className="w-4 h-4 text-green-600" />;
      case '.json':
        return <FiFileText className="w-4 h-4 text-yellow-600" />;
      case '.txt':
      case '.csv':
        return <FiFileText className="w-4 h-4 text-blue-500" />;
      case '.pdf':
        return <FiFileText className="w-4 h-4 text-red-500" />;
      default:
        return <FiFileText className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleNodeClick = useCallback((node: TreeNode) => {
    setSelectedNode(node.id);
    
    if (node.type === 'diagram' && node.diagram) {
      onSelectDiagram(node.id);
    } else if (node.type === 'other-file') {
      openWithSystem(node.relativePath);
    }
  }, [onSelectDiagram, openWithSystem]);

  const handleNodeDoubleClick = useCallback((node: TreeNode) => {
    if (node.type === 'other-file') {
      openWithSystem(node.relativePath);
    }
  }, [openWithSystem]);

  const handleContextMenu = (e: React.MouseEvent, node?: TreeNode, isRoot = false) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node, isRoot });
  };

  const handleCreateFolder = async (parentPath?: string) => {
    const newFolderName = 'New Folder';
    let newPath = parentPath ? `${parentPath}/${newFolderName}` : newFolderName;

    const existingFolders = files.filter(
      (f) => f.isDirectory && f.relativePath.startsWith(parentPath || '')
    );
    let counter = 1;
    while (existingFolders.some((f) => f.relativePath === newPath)) {
      newPath = parentPath ? `${parentPath}/${newFolderName} ${counter}` : `${newFolderName} ${counter}`;
      counter++;
    }

    await createFolder(newPath);
    setExpandedFolders((prev) => new Set([...prev, parentPath || '']));

    setTimeout(() => {
      setEditingNode(`folder:${newPath}`);
      setEditValue(newFolderName);
    }, 200);

    setContextMenu(null);
  };

  const handleCreateDiagram = async (parentPath?: string) => {
    const newDiagramName = 'New Process';
    let sanitizedName = newDiagramName.toLowerCase().replace(/\s+/g, '-');
    let relativePath = parentPath 
      ? `${parentPath}/${sanitizedName}.process`
      : `${sanitizedName}.process`;

    const existingProcessFiles = files.filter(
      (f) => f.isProcessFile && f.relativePath.startsWith(parentPath || '')
    );
    let counter = 1;
    while (existingProcessFiles.some((f) => f.relativePath === relativePath)) {
      sanitizedName = `${newDiagramName.toLowerCase().replace(/\s+/g, '-')}-${counter}`;
      relativePath = parentPath 
        ? `${parentPath}/${sanitizedName}.process`
        : `${sanitizedName}.process`;
      counter++;
    }

    const newDiagram = addDiagram({
      name: newDiagramName,
      type: 'sub-diagram',
      path: relativePath,
      folder: parentPath,
    });

    const emptyProcess = {
      version: '1.0.0',
      templateType: 'process',
      metadata: {
        id: newDiagram.id,
        name: newDiagramName,
      },
      diagram: {
        nodes: [{
          id: 'start',
          type: 'start',
          position: { x: 100, y: 100 },
          data: { blockData: { id: 'start', type: 'start', name: 'Start', label: 'Start' } },
        }],
        edges: [],
      },
    };

    await createFile(relativePath, JSON.stringify(emptyProcess, null, 2));

    if (parentPath) {
      setExpandedFolders((prev) => new Set([...prev, parentPath]));
    }

    setTimeout(() => {
      setEditingNode(newDiagram.id);
      setEditValue(newDiagramName);
    }, 100);

    setContextMenu(null);
  };

  const handleRename = (node: TreeNode) => {
    setEditingNode(node.id);
    setEditValue(node.name);
    setContextMenu(null);
  };

  const handleDelete = async (node: TreeNode) => {
    await deleteFile(node.relativePath);
    if (node.type === 'diagram') {
      removeDiagram(node.id);
    }
    setContextMenu(null);
  };

  const handleDuplicate = async (node: TreeNode) => {
    if (node.type === 'diagram' && node.diagram) {
      const newName = `${node.name} (Copy)`;
      const newRelativePath = node.relativePath.replace('.process', '-copy.process');
      
      const content = await useProjectFsStore.getState().readFile(node.relativePath);
      const newContent = content.replace(
        new RegExp(`"name":\\s*"${node.name}"`),
        `"name": "${newName}"`
      );
      
      await createFile(newRelativePath, newContent);
      
      addDiagram({
        name: newName,
        type: node.diagram.type,
        path: newRelativePath,
        folder: node.diagram.folder,
      });
    }
    setContextMenu(null);
  };

  const handleOpenInSystem = (node: TreeNode) => {
    openWithSystem(node.relativePath);
    setContextMenu(null);
  };

  const handleShowInFolder = (node: TreeNode) => {
    showInFolder(node.relativePath);
    setContextMenu(null);
  };

  const handleEditSubmit = async (node: TreeNode) => {
    if (!editValue.trim()) {
      setEditingNode(null);
      setEditValue('');
      return;
    }

    const newName = editValue.trim();
    
    if (node.type === 'folder') {
      const parentPath = node.relativePath.includes('/')
        ? node.relativePath.substring(0, node.relativePath.lastIndexOf('/'))
        : '';
      const newRelativePath = parentPath ? `${parentPath}/${newName}` : newName;

      if (node.relativePath !== newRelativePath) {
        await renameFile(node.relativePath, newRelativePath);
      }
    } else if (node.type === 'diagram') {
      const sanitizedName = newName.toLowerCase().replace(/\s+/g, '-');
      const parentPath = node.relativePath.includes('/')
        ? node.relativePath.substring(0, node.relativePath.lastIndexOf('/'))
        : '';
      const newRelativePath = parentPath 
        ? `${parentPath}/${sanitizedName}.process`
        : `${sanitizedName}.process`;

      if (node.relativePath !== newRelativePath) {
        await renameFile(node.relativePath, newRelativePath);
      }
      updateDiagram(node.id, { name: newName, path: newRelativePath });
    }

    setEditingNode(null);
    setEditValue('');
  };

  const handleDragStart = (e: React.DragEvent, node: TreeNode) => {
    setDraggedNode(node);
    e.dataTransfer.effectAllowed = 'copyMove';

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

  const handleDrop = async (e: React.DragEvent, targetNode: TreeNode) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedNode || draggedNode.type !== 'diagram' || targetNode.type !== 'folder') {
      setDraggedNode(null);
      return;
    }

    const targetFolder = targetNode.relativePath;
    if (draggedNode.diagram && draggedNode.diagram.folder !== targetFolder) {
      const sanitizedName = draggedNode.name.toLowerCase().replace(/\s+/g, '-');
      const newRelativePath = targetFolder 
        ? `${targetFolder}/${sanitizedName}.process`
        : `${sanitizedName}.process`;

      await renameFile(draggedNode.relativePath, newRelativePath);
      updateDiagram(draggedNode.id, { folder: targetFolder || undefined, path: newRelativePath });
    }

    setDraggedNode(null);
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedNode || draggedNode.type !== 'diagram') {
      setDraggedNode(null);
      return;
    }

    if (draggedNode.diagram && draggedNode.diagram.folder) {
      const sanitizedName = draggedNode.name.toLowerCase().replace(/\s+/g, '-');
      const newRelativePath = `${sanitizedName}.process`;

      await renameFile(draggedNode.relativePath, newRelativePath);
      updateDiagram(draggedNode.id, { folder: undefined, path: newRelativePath });
    }

    setDraggedNode(null);
  };

  const renderNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.relativePath);
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
            onClick={() => toggleFolder(node.relativePath)}
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

    if (node.type === 'other-file') {
      return (
        <div
          key={node.id}
          className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-sm select-none
            ${isSelected ? 'bg-slate-200 dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}
          `}
          style={{ paddingLeft: `${node.depth * 12 + 8}px` }}
          onClick={() => handleNodeClick(node)}
          onDoubleClick={() => handleNodeDoubleClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          <div className="w-4 flex-shrink-0" />
          {getFileIcon(node.extension)}
          <span className="truncate text-slate-700 dark:text-slate-300 flex-1">
            {node.name}
          </span>
          <span className="text-xs text-slate-400">{node.extension}</span>
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
        onClick={() => handleNodeClick(node)}
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

  if (!projectPath) {
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
            title="New Process"
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
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            <p>Loading...</p>
          </div>
        ) : tree.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            <p>No files yet</p>
            <p className="text-xs mt-1">Right-click to create</p>
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
                  <FiFilePlus className="w-4 h-4" /> New Process
                </button>
              </>
            )}
            {contextMenu.node?.type === 'folder' && (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => handleCreateFolder(contextMenu.node?.relativePath)}
                >
                  <FiFolderPlus className="w-4 h-4" /> New Folder
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => handleCreateDiagram(contextMenu.node?.relativePath)}
                >
                  <FiFilePlus className="w-4 h-4" /> New Process
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
                  onClick={() => {
                    setSettingsDiagramId(contextMenu.node?.diagram?.id || null);
                    setContextMenu(null);
                  }}
                >
                  <FiSettings className="w-4 h-4" /> Settings
                </button>
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
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => contextMenu.node && handleShowInFolder(contextMenu.node)}
                >
                  <FiFolder className="w-4 h-4" /> Show in Folder
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
            {contextMenu.node?.type === 'other-file' && (
              <>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => contextMenu.node && handleOpenInSystem(contextMenu.node)}
                >
                  <FiExternalLink className="w-4 h-4" /> Open
                </button>
                <button
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => contextMenu.node && handleShowInFolder(contextMenu.node)}
                >
                  <FiFolder className="w-4 h-4" /> Show in Folder
                </button>
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
          </div>
        </>
      )}

      <DiagramSettingsDialog
        isOpen={!!settingsDiagramId}
        diagramId={settingsDiagramId}
        onClose={() => setSettingsDiagramId(null)}
      />
    </div>
  );
};

export default DiagramExplorer;
