import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEdit2, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { useOrchestratorStore, type ServeSchedule } from '../../stores/orchestratorStore';
import { describeCron } from './cronPreview';

interface ScheduleFormState {
  name: string;
  cron: string;
  diagram_path: string;
  priority: string;
  missed_run_policy: string;
}

const EMPTY_FORM: ScheduleFormState = {
  name: '',
  cron: '*/5 * * * *',
  diagram_path: '',
  priority: 'Normal',
  missed_run_policy: 'skip',
};

function CronPreview({ expression }: { expression: string }) {
  const { t } = useTranslation('common');
  const description = describeCron(expression);
  return (
    <span className="text-ui-text-muted">
      {t(`orchestrator.cron.${description.key}`, {
        defaultValue: expression,
        ...description.params,
      })}
    </span>
  );
}

/**
 * Schedules panel (issue #858): maps 1:1 to serve `GET /schedules` and
 * `PUT`/`DELETE /schedules/{name}` (issues #857, #876). The daemon hot-reloads the
 * schedules file, so upserts apply without a daemon restart.
 */
const SchedulesTab: React.FC = () => {
  const { t } = useTranslation('common');
  const schedules = useOrchestratorStore((s) => s.schedules);
  const schedulesLoading = useOrchestratorStore((s) => s.schedulesLoading);
  const schedulesError = useOrchestratorStore((s) => s.schedulesError);
  const schedulesSupported = useOrchestratorStore((s) => s.schedulesSupported);
  const refreshSchedules = useOrchestratorStore((s) => s.refreshSchedules);
  const upsertSchedule = useOrchestratorStore((s) => s.upsertSchedule);
  const deleteSchedule = useOrchestratorStore((s) => s.deleteSchedule);
  const [form, setForm] = useState<ScheduleFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    void refreshSchedules();
    // Initial load only; user refreshes explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openForm = (schedule?: ServeSchedule) => {
    setFormError(null);
    setForm(
      schedule
        ? {
            name: schedule.name,
            cron: schedule.cron,
            diagram_path: schedule.diagram_path,
            priority: schedule.priority,
            missed_run_policy: schedule.missed_run_policy,
          }
        : { ...EMPTY_FORM },
    );
  };

  const handleDelete = async (name: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSchedule(name);
      setConfirmingDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setFormError(null);
    try {
      await upsertSchedule(form.name, {
        cron: form.cron,
        diagram_path: form.diagram_path,
        priority: form.priority,
        missed_run_policy: form.missed_run_policy,
      });
      setForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!schedulesSupported) {
    return (
      <div className="p-2 text-xs text-ui-text-muted">
        {t('orchestrator.schedules.unsupported')}
      </div>
    );
  }

  return (
    <div className="text-xs">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void refreshSchedules()}
          className="flex items-center gap-1 rounded px-2 py-1 text-ui-text-muted hover:bg-ui-surface-hover"
          aria-label={t('orchestrator.schedules.refresh')}
        >
          <FiRefreshCw className={`h-3 w-3 ${schedulesLoading ? 'animate-spin' : ''}`} />
          {t('orchestrator.schedules.refresh')}
        </button>
        <button
          type="button"
          data-testid="orchestrator-schedule-new"
          onClick={() => openForm()}
          className="flex items-center gap-1 rounded bg-accent-primary/20 px-2 py-1 text-accent-primary hover:bg-accent-primary/30"
        >
          <FiPlus className="h-3 w-3" />
          {t('orchestrator.schedules.new')}
        </button>
      </div>

      {schedulesError && <div className="mb-2 text-red-500">{schedulesError}</div>}
      {deleteError && <div className="mb-2 text-red-500">{deleteError}</div>}

      <div data-testid="orchestrator-schedule-list">
        {schedules.length === 0 && !schedulesLoading ? (
          <div className="p-2 text-ui-text-muted">{t('orchestrator.schedules.empty')}</div>
        ) : (
          schedules.map((schedule) => (
            <div key={schedule.name} className="flex items-center gap-2 border-b border-ui-border py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ui-text">{schedule.name}</div>
                <div className="font-mono text-ui-text-muted">
                  {schedule.cron} · {schedule.diagram_path}
                </div>
                <div className="mt-0.5">
                  <CronPreview expression={schedule.cron} />
                  {schedule.last_enqueued && (
                    <span className="ml-2 text-ui-text-muted">
                      {t('orchestrator.schedules.lastRun', { time: schedule.last_enqueued })}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openForm(schedule)}
                className="rounded p-1 text-ui-text-muted hover:bg-ui-surface-hover"
                aria-label={t('orchestrator.schedules.edit', { name: schedule.name })}
              >
                <FiEdit2 className="h-3.5 w-3.5" />
              </button>
              {confirmingDelete === schedule.name ? (
                <button
                  type="button"
                  data-testid="orchestrator-schedule-delete-confirm"
                  disabled={deleting}
                  onClick={() => void handleDelete(schedule.name)}
                  className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-500 hover:bg-red-600/30 disabled:opacity-50"
                >
                  {t('orchestrator.schedules.confirmDelete')}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="orchestrator-schedule-delete"
                  onClick={() => setConfirmingDelete(schedule.name)}
                  className="rounded p-1 text-ui-text-muted hover:bg-ui-surface-hover"
                  aria-label={t('orchestrator.schedules.delete', { name: schedule.name })}
                >
                  <FiTrash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('orchestrator.schedules.formTitle')}>
          <div className="w-full max-w-md rounded-lg bg-ui-surface p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-bold text-ui-text">{t('orchestrator.schedules.formTitle')}</h3>
            <div className="space-y-2">
              <label className="block">
                <span className="text-ui-text-muted">{t('orchestrator.schedules.fieldName')}</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  disabled={schedules.some((s) => s.name === form.name)}
                  className="mt-0.5 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 text-ui-text disabled:opacity-60"
                />
              </label>
              <label className="block">
                <span className="text-ui-text-muted">{t('orchestrator.schedules.fieldCron')}</span>
                <input
                  value={form.cron}
                  onChange={(event) => setForm({ ...form, cron: event.target.value })}
                  className="mt-0.5 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 font-mono text-ui-text"
                />
                <CronPreview expression={form.cron} />
              </label>
              <label className="block">
                <span className="text-ui-text-muted">{t('orchestrator.schedules.fieldDiagram')}</span>
                <input
                  value={form.diagram_path}
                  onChange={(event) => setForm({ ...form, diagram_path: event.target.value })}
                  className="mt-0.5 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 font-mono text-ui-text"
                />
              </label>
              <label className="block">
                <span className="text-ui-text-muted">{t('orchestrator.schedules.fieldPriority')}</span>
                <select
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  className="mt-0.5 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 text-ui-text"
                >
                  {['High', 'Normal', 'Low'].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-ui-text-muted">{t('orchestrator.schedules.fieldMissedPolicy')}</span>
                <select
                  value={form.missed_run_policy}
                  onChange={(event) => setForm({ ...form, missed_run_policy: event.target.value })}
                  className="mt-0.5 w-full rounded border border-ui-border bg-ui-surface px-2 py-1 text-ui-text"
                >
                  {['skip', 'catch_up'].map((policy) => (
                    <option key={policy} value={policy}>{policy}</option>
                  ))}
                </select>
              </label>
            </div>
            {formError && <div className="mt-2 text-red-500">{formError}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded px-3 py-1.5 text-ui-text-muted hover:bg-ui-surface-hover"
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                data-testid="orchestrator-schedule-save"
                disabled={saving || !form.name || !form.diagram_path}
                onClick={() => void handleSave()}
                className="rounded bg-accent-primary px-3 py-1.5 text-white hover:opacity-90 disabled:opacity-50"
              >
                {t('orchestrator.schedules.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulesTab;
