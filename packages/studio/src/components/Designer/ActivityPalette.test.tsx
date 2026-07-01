import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useProcessStore } from '../../stores/processStore';

const { getActivitiesMock } = vi.hoisted(() => ({
  getActivitiesMock: vi.fn(),
}));

vi.mock('../../hooks/useEngine', () => ({
  useEngine: () => ({
    getActivities: getActivitiesMock,
    // Activities load only once the engine bridge is connected; this test
    // exercises that connected path.
    isConnected: true,
  }),
}));

import ActivityPalette from './ActivityPalette';

describe('ActivityPalette', () => {
  beforeEach(() => {
    useProcessStore.persist.clearStorage();
    useProcessStore.getState().clearProcess();
    getActivitiesMock.mockReset().mockResolvedValue({
      activities: [
        {
          id: 'DesktopUI.click_element',
          name: 'Click Element',
          library: 'DesktopUI',
          type: 'sync',
          category: 'Desktop',
          description: 'Click a UI element',
          icon: '🖱',
          params: [
            {
              name: 'selector',
              type: 'string',
              label: 'Selector',
              description: 'Target selector',
              required: true,
              options: [],
            },
          ],
        },
      ],
    });
  });

  test('loads SDK activities from bridge-backed designer hook', async () => {
    render(<ActivityPalette />);

    await waitFor(() => expect(getActivitiesMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Click Element')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Desktop/ })).toBeTruthy();
  });
});
