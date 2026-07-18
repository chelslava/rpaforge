import { useEffect, useState } from 'react';
import { FiX } from 'react-icons/fi';
import type { SecurityAuditEvent } from '../../types/ipc-contracts';

interface SecurityAuditDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SecurityAuditDialog({ open, onClose }: SecurityAuditDialogProps) {
  const [events, setEvents] = useState<SecurityAuditEvent[]>([]);

  useEffect(() => {
    if (open) void window.rpaforge?.audit.listSecurityEvents().then(setEvents);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-ui-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ui-text">Security audit log</h2>
          <button className="rounded p-1 hover:bg-ui-surface-hover" onClick={onClose} aria-label="Close">
            <FiX className="h-5 w-5 text-ui-text-muted" />
          </button>
        </div>
        <p className="mb-3 text-xs text-ui-text-muted">Sensitive values are redacted and user/process names are anonymized.</p>
        <div className="min-h-0 overflow-auto rounded bg-ui-surface-muted p-3 font-mono text-xs">
          {events.length === 0 ? (
            <div className="text-ui-text-muted">No security events recorded.</div>
          ) : events.map((event, index) => (
            <div key={`${event.timestamp}-${index}`} className="border-b border-ui-border py-2 last:border-0">
              <div className="text-ui-text">{event.timestamp} · {event.eventType}</div>
              <pre className="whitespace-pre-wrap break-words text-ui-text-muted">{JSON.stringify(event.details, null, 2)}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
