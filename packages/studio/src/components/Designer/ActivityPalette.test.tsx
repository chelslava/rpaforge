import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useProcessStore } from '../../stores/processStore';

// react-virtuoso uses virtualization (zero-height container in tests → no items render).
// Mock: render all items flat, no virtualization.
vi.mock('react-virtuoso', () => {
  const Virtuoso = React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const { data, itemContent, components, style } = props as {
      data?: unknown[];
      itemContent?: (index: number, item: unknown) => React.ReactNode;
      components?: { Header?: React.ComponentType };
      style?: React.CSSProperties;
    };
    const items = (data ?? []).map((item, index) => (
      <div key={index}>{itemContent?.(index, item)}</div>
    ));
    return (
      <div ref={ref} style={style}>
        {components?.Header ? <components.Header /> : null}
        {items}
      </div>
    );
  });
  Virtuoso.displayName = 'Virtuoso';
  return { Virtuoso, VirtuosoHandle: (null as unknown) as React.Ref<HTMLDivElement> };
});

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
