import { useEffect, useState } from 'react';
import './ExecutionHistory.css';

interface RunMetadata {
  filename: string;
  size: number;
  modified: string;
}

interface RunRecord {
  run_id: string;
  process_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  steps: Array<{
    activity: string;
    node_id: string;
    started_at: string;
    duration_ms: number;
    status: string;
    inputs: Record<string, unknown>;
    output: unknown;
    error: string | null;
  }>;
}

export function ExecutionHistory() {
  const [runs, setRuns] = useState<RunMetadata[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    try {
      setLoading(true);
      const runsList = await window.rpaforge?.audit.listRuns();
      setRuns(runsList || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  };

  const loadRun = async (filename: string) => {
    try {
      const run = (await window.rpaforge?.audit.getRun(filename)) as unknown as RunRecord;
      setSelectedRun(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run details');
    }
  };

  const deleteRun = async (filename: string) => {
    if (!confirm('Delete this run?')) return;
    try {
      await window.rpaforge?.audit.deleteRun(filename);
      await loadRuns();
      if (selectedRun?.run_id === filename.split('_')[1]) {
        setSelectedRun(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete run');
    }
  };

  if (loading) {
    return <div className="execution-history loading">Loading runs...</div>;
  }

  return (
    <div className="execution-history">
      <div className="history-panel">
        <h2>Execution History</h2>
        {error && <div className="error-message">{error}</div>}
        {runs.length === 0 ? (
          <p className="no-runs">No execution runs recorded yet</p>
        ) : (
          <div className="runs-list">
            {runs.map((run) => (
              <div
                key={run.filename}
                className="run-item"
                onClick={() => loadRun(run.filename)}
              >
                <div className="run-time">
                  {new Date(run.modified).toLocaleString()}
                </div>
                <div className="run-size">{(run.size / 1024).toFixed(1)} KB</div>
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRun(run.filename);
                  }}
                  title="Delete run"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedRun && (
        <div className="run-details">
          <h3>{selectedRun.process_name}</h3>
          <div className="run-info">
            <div>
              <strong>Status:</strong> <span className={`status-${selectedRun.status}`}>{selectedRun.status}</span>
            </div>
            <div>
              <strong>Started:</strong> {new Date(selectedRun.started_at).toLocaleString()}
            </div>
            {selectedRun.finished_at && (
              <div>
                <strong>Finished:</strong> {new Date(selectedRun.finished_at).toLocaleString()}
              </div>
            )}
            <div>
              <strong>Steps:</strong> {selectedRun.steps.length}
            </div>
          </div>

          <div className="steps-list">
            {selectedRun.steps.map((step, idx) => (
              <div key={idx} className={`step-item status-${step.status}`}>
                <div className="step-header">
                  <span className="step-activity">{step.activity}</span>
                  <span className="step-duration">{step.duration_ms}ms</span>
                  <span className={`step-status status-badge-${step.status}`}>
                    {step.status}
                  </span>
                </div>
                {step.error && <div className="step-error">{step.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
