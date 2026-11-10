import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiActivity, FiCalendar, FiLayers, FiServer, FiX } from 'react-icons/fi';
import { useOrchestratorStore } from '../../stores/orchestratorStore';
import { healthBadgeClass } from './health';
import ConnectionsTab from './ConnectionsTab';
import RunsTab from './RunsTab';
import QueuesTab from './QueuesTab';
import SchedulesTab from './SchedulesTab';

type TabId = 'runs' | 'queues' | 'schedules' | 'connections';

const TABS: Array<{ id: TabId; icon: React.ReactNode; key: string }> = [
  { id: 'runs', icon: <FiActivity className="h-4 w-4" />, key: 'orchestrator.tabs.runs' },
  { id: 'queues', icon: <FiLayers className="h-4 w-4" />, key: 'orchestrator.tabs.queues' },
  { id: 'schedules', icon: <FiCalendar className="h-4 w-4" />, key: 'orchestrator.tabs.schedules' },
  { id: 'connections', icon: <FiServer className="h-4 w-4" />, key: 'orchestrator.tabs.connections' },
];

interface ControlTowerDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ControlTowerDialog({ open, onClose }: ControlTowerDialogProps) {
  const { t } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<TabId>('runs');
  const connections = useOrchestratorStore((s) => s.connections);
  const activeConnectionId = useOrchestratorStore((s) => s.activeConnectionId);
  const health = useOrchestratorStore((s) => s.health);
  const loadConnections = useOrchestratorStore((s) => s.loadConnections);
  const checkHealth = useOrchestratorStore((s) => s.checkHealth);

  useEffect(() => {
    if (!open) return;
    void loadConnections().then(() => {
      const id = useOrchestratorStore.getState().activeConnectionId;
      if (id && useOrchestratorStore.getState().health[id] === undefined) {
        void checkHealth(id);
      }
    });
  }, [open, loadConnections, checkHealth]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const activeConnection = connections.find((c) => c.id === activeConnectionId) ?? null;
  const activeHealth = activeConnection ? health[activeConnection.id] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('orchestrator.title')}>
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg bg-ui-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ui-text">
            {t('orchestrator.title')}
            {activeConnection && (
              <span className="flex items-center gap-2 text-sm font-normal text-ui-text-muted">
                <span data-testid="orchestrator-health-badge" className={`rounded px-2 py-0.5 text-xs ${healthBadgeClass(activeHealth)}`}>
                  {t(`orchestrator.health.${activeHealth ?? 'unknown'}`)}
                </span>
                {activeConnection.name}
              </span>
            )}
          </h2>
          <button className="rounded p-1 hover:bg-ui-surface-hover" onClick={onClose} aria-label={t('actions.close')}>
            <FiX className="h-5 w-5 text-ui-text-muted" />
          </button>
        </div>

        {!connections.length ? (
          <ConnectionsTab embedded />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label={t('orchestrator.title')} className="mb-3 flex gap-1 border-b border-ui-border">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`orchestrator-panel-${tab.id}`}
                  id={`orchestrator-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-t px-3 py-2 text-sm ${
                    activeTab === tab.id
                      ? 'border-b-2 border-accent-primary font-semibold text-ui-text'
                      : 'text-ui-text-muted hover:bg-ui-surface-hover'
                  }`}
                >
                  {tab.icon}
                  {t(tab.key)}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`orchestrator-panel-${activeTab}`}
              aria-labelledby={`orchestrator-tab-${activeTab}`}
              className="min-h-0 flex-1 overflow-auto"
            >
              {activeTab === 'runs' && <RunsTab />}
              {activeTab === 'queues' && <QueuesTab />}
              {activeTab === 'schedules' && <SchedulesTab />}
              {activeTab === 'connections' && <ConnectionsTab />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
