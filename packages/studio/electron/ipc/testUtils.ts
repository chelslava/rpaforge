/**
 * Shared test scaffolding for IPC domain handler modules (issue #828).
 *
 * Each domain test file installs its own top-level `vi.mock('electron', …)`
 * (vi.mock must live in the file's top scope); `makeEvent()` builds a
 * minimal IpcMainInvokeEvent stand-in that passes the real ipc-validator
 * checks. Tests collect registered handlers from the `ipcMain.handle` mock.
 */

import type { IpcMainInvokeEvent } from 'electron';

export function makeEvent(): IpcMainInvokeEvent {
  return {
    sender: { isDestroyed: () => false },
  } as unknown as IpcMainInvokeEvent;
}
