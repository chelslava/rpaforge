import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import CodeModal from './CodeModal';

describe('CodeModal', () => {
  test('switches between generated files when a bundle is provided', () => {
    const { container } = render(
      <CodeModal
        isOpen
        code={'*** Tasks ***\nMain Process'}
        files={{
          'processes/main.robot': '*** Tasks ***\nMain Process',
          'processes/auth/login.flow.robot': '*** Keywords ***\nLogin Flow',
        }}
        fileCount={2}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />
    );

    expect(container.querySelector('pre')?.textContent).toContain('*** Tasks ***\nMain Process');

    fireEvent.click(screen.getByRole('button', { name: 'processes/auth/login.flow.robot' }));

    expect(container.querySelector('pre')?.textContent).toContain('*** Keywords ***\nLogin Flow');
  });
});
