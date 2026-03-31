import React from 'react';

const PropertyPanel: React.FC = () => {
  return (
    <div className="property-panel">
      <h2 className="font-semibold mb-4">Properties</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-500 mb-1">Name</label>
          <input
            type="text"
            className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600"
            defaultValue="Open Application"
          />
        </div>
        
        <div>
          <label className="block text-sm text-slate-500 mb-1">Executable</label>
          <input
            type="text"
            className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600"
            placeholder="notepad.exe"
          />
        </div>
        
        <div>
          <label className="block text-sm text-slate-500 mb-1">Arguments</label>
          <input
            type="text"
            className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600"
            placeholder="Optional arguments"
          />
        </div>
        
        <div>
          <label className="block text-sm text-slate-500 mb-1">Timeout</label>
          <input
            type="text"
            className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600"
            defaultValue="30s"
          />
        </div>
        
        <div className="pt-2 border-t dark:border-slate-600">
          <label className="block text-sm text-slate-500 mb-1">Documentation</label>
          <textarea
            className="w-full px-2 py-1 border rounded dark:bg-slate-700 dark:border-slate-600 h-20"
            placeholder="Add documentation..."
          />
        </div>
      </div>
    </div>
  );
};

export default PropertyPanel;
