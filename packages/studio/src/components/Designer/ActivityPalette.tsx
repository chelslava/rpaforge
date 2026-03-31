import React from 'react';

const activities = [
  { name: 'Click Element', library: 'DesktopUI', category: 'Mouse' },
  { name: 'Input Text', library: 'DesktopUI', category: 'Keyboard' },
  { name: 'Open Application', library: 'DesktopUI', category: 'Application' },
  { name: 'Wait For Window', library: 'DesktopUI', category: 'Wait' },
  { name: 'Open Browser', library: 'WebUI', category: 'Browser' },
  { name: 'Navigate', library: 'WebUI', category: 'Browser' },
  { name: 'Click Button', library: 'WebUI', category: 'Mouse' },
  { name: 'IF', library: 'BuiltIn', category: 'Control Flow' },
  { name: 'FOR', library: 'BuiltIn', category: 'Control Flow' },
  { name: 'Log', library: 'BuiltIn', category: 'Logging' },
];

const ActivityPalette: React.FC = () => {
  const categories = [...new Set(activities.map((a) => a.category))];

  return (
    <div className="p-2">
      <h2 className="font-semibold mb-2 px-2">Activities</h2>
      <div className="space-y-3">
        {categories.map((category) => (
          <div key={category}>
            <h3 className="text-xs text-slate-500 uppercase px-2 mb-1">
              {category}
            </h3>
            {activities
              .filter((a) => a.category === category)
              .map((activity) => (
                <div
                  key={activity.name}
                  className="activity-palette-item flex items-center gap-2"
                  draggable
                >
                  <span className="text-indigo-500">▶</span>
                  <span>{activity.name}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivityPalette;
