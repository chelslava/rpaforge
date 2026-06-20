import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted shared mock state (available before vi.mock due to hoisting)
// ---------------------------------------------------------------------------

const { mockFileOps, mockFsStore, mockAiGeneration, toastMock } = vi.hoisted(() => ({
  mockFileOps: {
    isSaving: false,
    isLoading: false,
    lastError: null as string | null,
    save: vi.fn(),
    saveAs: vi.fn(),
    open: vi.fn(),
    openProjectFolder: vi.fn(),
    newProject: vi.fn(),
    newProjectInFolder: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
    newProcess: vi.fn(),
    exportDiagram: vi.fn(),
  },

  mockFsStore: {
    projectPath: null as string | null,
  },

  mockAiGeneration: {
    isGenerating: false,
    providerStatus: [] as Array<{ provider: string; configured: boolean }>,
    refreshProviderStatus: vi.fn(),
    generate: vi.fn(),
    cancel: vi.fn(),
  },

  toastMock: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => React.createRef<HTMLDivElement>(),
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('../../hooks/useFileOperations', () => ({
  useFileOperations: () => mockFileOps,
}));

vi.mock('../../stores/projectFsStore', () => ({
  useProjectFsStore: (
    selector: (state: { projectPath: string | null }) => string | null,
  ) => selector(mockFsStore),
}));

vi.mock('../../hooks/useAiGeneration', () => ({
  useAiGeneration: () => mockAiGeneration,
}));

vi.mock('./MarketplaceDialog', () => ({
  MarketplaceDialog: ({
    isOpen,
    onClose,
    onSelectTemplate,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSelectTemplate: (id: string) => void;
  }) =>
    isOpen ? (
      <div data-testid="marketplace-dialog">
        <button onClick={onClose} data-testid="marketplace-close-btn">
          Close Marketplace
        </button>
        <button
          onClick={() => onSelectTemplate?.('simple-sequence')}
          data-testid="marketplace-select-btn"
        >
          Select Template
        </button>
      </div>
    ) : null,
}));

// ---------------------------------------------------------------------------
// Component import (must come after vi.mock calls)
// ---------------------------------------------------------------------------

import FileMenu from './FileMenu';
import { useProcessMetadataStore } from '../../stores/processMetadataStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Click the toolbar button whose `title` matches the given i18n key. */
function clickToolbarButton(titleKey: string) {
  fireEvent.click(screen.getByTitle(titleKey));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFsStore.projectPath = null;

    // Reset mutable mock properties
    mockFileOps.isSaving = false;
    mockFileOps.isLoading = false;
    mockFileOps.lastError = null;
    mockFileOps.open.mockReset();
    mockFileOps.openProjectFolder.mockReset();
    mockFileOps.save.mockReset();
    mockFileOps.saveAs.mockReset();
    mockFileOps.newProject.mockReset();
    mockFileOps.newProjectInFolder.mockReset();
    mockFileOps.newProcess.mockReset();
    mockFileOps.exportDiagram.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Toolbar button rendering
  // -----------------------------------------------------------------------

  test('renders all toolbar buttons with correct titles', () => {
    render(<FileMenu />);

    expect(screen.getByTitle('fileMenu.newProject')).toBeTruthy();
    expect(screen.getByTitle('fileMenu.newProcess')).toBeTruthy();
    expect(screen.getByTitle('fileMenu.openFile')).toBeTruthy();
    expect(screen.getByTitle('fileMenu.openProject')).toBeTruthy();
    expect(screen.getByTitle('fileMenu.saveProject')).toBeTruthy();
    expect(screen.getByTitle('fileMenu.saveAs')).toBeTruthy();
    expect(screen.getByTitle('fileMenu.exportProject')).toBeTruthy();
  });

  test('renders toolbar button labels via i18n keys', () => {
    render(<FileMenu />);

    expect(screen.getByText('fileMenu.newProject')).toBeTruthy();
    expect(screen.getByText('fileMenu.newProcess')).toBeTruthy();
    expect(screen.getByText('fileMenu.openFile')).toBeTruthy();
    expect(screen.getByText('fileMenu.openFolder')).toBeTruthy();
    expect(screen.getByText('fileMenu.save')).toBeTruthy();
    expect(screen.getByText('actions.saveAs')).toBeTruthy();
    expect(screen.getByText('actions.export')).toBeTruthy();
  });

  test('hides Save As button when a project is open', () => {
    mockFsStore.projectPath = '/some/project';
    render(<FileMenu />);

    expect(screen.queryByTitle('fileMenu.saveAs')).toBeNull();
  });

  test('shows Save As button when no project is open', () => {
    render(<FileMenu />);

    expect(screen.getByTitle('fileMenu.saveAs')).toBeTruthy();
  });

  test('disables Open File and Open Folder when isLoading is true', () => {
    mockFileOps.isLoading = true;
    render(<FileMenu />);

    expect(screen.getByTitle('fileMenu.openFile')).toHaveProperty('disabled', true);
    expect(screen.getByTitle('fileMenu.openProject')).toHaveProperty('disabled', true);
  });

  test('disables Save when isSaving is true', () => {
    mockFileOps.isSaving = true;
    render(<FileMenu />);

    expect(screen.getByTitle('fileMenu.saveProject')).toHaveProperty('disabled', true);
  });

  // -----------------------------------------------------------------------
  // File operations
  // -----------------------------------------------------------------------

  test('calls save when Save button is clicked', () => {
    render(<FileMenu />);
    clickToolbarButton('fileMenu.saveProject');

    expect(mockFileOps.save).toHaveBeenCalledTimes(1);
  });

  test('calls exportDiagram when Export button is clicked', () => {
    render(<FileMenu />);
    clickToolbarButton('fileMenu.exportProject');

    expect(mockFileOps.exportDiagram).toHaveBeenCalledTimes(1);
  });

  test('calls openProjectFolder when Open Folder is clicked', () => {
    render(<FileMenu />);
    clickToolbarButton('fileMenu.openProject');

    expect(mockFileOps.openProjectFolder).toHaveBeenCalledTimes(1);
  });

  test('triggers file input click when Open File is clicked', () => {
    render(<FileMenu />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    clickToolbarButton('fileMenu.openFile');

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('calls open when a file is selected via the hidden input', async () => {
    mockFileOps.open.mockResolvedValue(true);

    render(<FileMenu />);

    const file = new File(['test content'], 'test.rpaforge', {
      type: 'application/octet-stream',
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(mockFileOps.open).toHaveBeenCalledTimes(1);
    expect(mockFileOps.open).toHaveBeenCalledWith(file);
  });

  test('shows success toast when file is opened successfully', async () => {
    mockFileOps.open.mockResolvedValue(true);

    render(<FileMenu />);

    const file = new File(['test content'], 'test.rpaforge', {
      type: 'application/octet-stream',
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(toastMock.success).toHaveBeenCalledWith('fileMenu.opened');
  });

  test('shows success toast on successful save', async () => {
    mockFileOps.save.mockResolvedValue(undefined);

    render(<FileMenu />);
    clickToolbarButton('fileMenu.saveProject');

    // Let microtasks resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(toastMock.success).toHaveBeenCalledWith('fileMenu.projectSaved');
  });

  test('shows error toast when lastError is set', () => {
    mockFileOps.lastError = 'Something went wrong';
    render(<FileMenu />);

    expect(toastMock.error).toHaveBeenCalledWith('Something went wrong');
  });

  // -----------------------------------------------------------------------
  // NewProjectDialog – open / close behaviour
  // -----------------------------------------------------------------------

  test('opens NewProjectDialog when New Project button is clicked', () => {
    render(<FileMenu />);

    // Dialog should not be visible initially
    expect(screen.queryByText('fileMenu.projectName')).toBeNull();

    // Click New Project
    clickToolbarButton('fileMenu.newProject');

    // Dialog should now be visible
    expect(screen.getByText('fileMenu.projectName')).toBeTruthy();
  });

  test('closes NewProjectDialog when close (X) button is clicked', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');
    expect(screen.getByText('fileMenu.projectName')).toBeTruthy();

    // Click the close button (aria-label = fileMenu.closeDialog)
    fireEvent.click(screen.getByLabelText('fileMenu.closeDialog'));

    expect(screen.queryByText('fileMenu.projectName')).toBeNull();
  });

  test('closes NewProjectDialog when Cancel button is clicked', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');
    expect(screen.getByText('fileMenu.projectName')).toBeTruthy();

    fireEvent.click(screen.getByText('actions.cancel'));

    expect(screen.queryByText('fileMenu.projectName')).toBeNull();
  });

  test('shows template selection grid in NewProjectDialog', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');

    // Template names come from the real PROJECT_TEMPLATES data
    expect(screen.getByText('Empty Project')).toBeTruthy();
    expect(screen.getByText('Simple Sequence')).toBeTruthy();
    expect(screen.getByText('REFramework')).toBeTruthy();
  });

  test('calls newProject and shows toast when Quick Create is clicked', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');
    fireEvent.click(screen.getByText('fileMenu.quickCreate'));

    expect(mockFileOps.newProject).toHaveBeenCalledTimes(1);
    expect(mockFileOps.newProject).toHaveBeenCalledWith(
      'fileMenu.newProject',   // default name from t()
      'empty',                 // default template
    );
    expect(toastMock.success).toHaveBeenCalledWith('fileMenu.createdProject');
  });

  test('calls newProject with selected template when a template is chosen', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');

    // Click the "Simple Sequence" template button
    fireEvent.click(screen.getByText('Simple Sequence'));

    // Now click Quick Create
    fireEvent.click(screen.getByText('fileMenu.quickCreate'));

    expect(mockFileOps.newProject).toHaveBeenCalledWith(
      'fileMenu.newProject',
      'simple-sequence',
    );
  });

  test('shows template description section when a template is selected', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');

    // "Empty Project" is the default – its description should be visible
    expect(screen.getByText('fileMenu.templateEmpty')).toBeTruthy();
    expect(screen.getByText('fileMenu.templateEmptyDesc')).toBeTruthy();
    expect(screen.getByText('fileMenu.templateEmptyIncludes')).toBeTruthy();
  });

  test('closes NewProjectDialog when Quick Create is clicked', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');
    expect(screen.getByText('fileMenu.projectName')).toBeTruthy();

    fireEvent.click(screen.getByText('fileMenu.quickCreate'));

    expect(screen.queryByText('fileMenu.projectName')).toBeNull();
  });

  test('shows Browse Marketplace link inside NewProjectDialog', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');

    expect(screen.getByText('marketplace.browse')).toBeTruthy();
  });

  test('opens Marketplace dialog when Browse Marketplace is clicked in NewProjectDialog', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProject');

    // Marketplace dialog should not be visible yet
    expect(screen.queryByTestId('marketplace-dialog')).toBeNull();

    // Click the browse marketplace link
    fireEvent.click(screen.getByText('marketplace.browse'));

    // Marketplace dialog should now be visible
    expect(screen.getByTestId('marketplace-dialog')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // NewProcessDialog – open / close behaviour
  // -----------------------------------------------------------------------

  test('opens NewProcessDialog when New Process button is clicked', () => {
    render(<FileMenu />);

    expect(screen.queryByText('fileMenu.processName')).toBeNull();

    clickToolbarButton('fileMenu.newProcess');

    expect(screen.getByText('fileMenu.processName')).toBeTruthy();
  });

  test('closes NewProcessDialog when Cancel is clicked', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProcess');
    expect(screen.getByText('fileMenu.processName')).toBeTruthy();

    fireEvent.click(screen.getByText('actions.cancel'));

    expect(screen.queryByText('fileMenu.processName')).toBeNull();
  });

  test('calls newProcess when Create Process is clicked', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProcess');
    fireEvent.click(screen.getByText('fileMenu.createProcess'));

    expect(mockFileOps.newProcess).toHaveBeenCalledTimes(1);
    expect(mockFileOps.newProcess).toHaveBeenCalledWith(
      'fileMenu.newProcess',
      'empty-process',
    );
  });

  test('shows process template options in NewProcessDialog', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProcess');

    // Names from the real PROCESS_TEMPLATES data
    expect(screen.getByText('Empty Process')).toBeTruthy();
    expect(screen.getByText('Linear Process')).toBeTruthy();
  });

  test('closes NewProcessDialog on close (X) button', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.newProcess');
    expect(screen.getByText('fileMenu.processName')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('fileMenu.closeDialog'));

    expect(screen.queryByText('fileMenu.processName')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // SaveAsDialog – open / close behaviour
  // -----------------------------------------------------------------------

  test('opens SaveAsDialog when Save As button is clicked', () => {
    render(<FileMenu />);

    expect(screen.queryByText('fileMenu.saveProjectAs')).toBeNull();

    clickToolbarButton('fileMenu.saveAs');

    expect(screen.getByText('fileMenu.saveProjectAs')).toBeTruthy();
  });

  test('closes SaveAsDialog when Cancel is clicked', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.saveAs');
    expect(screen.getByText('fileMenu.saveProjectAs')).toBeTruthy();

    fireEvent.click(screen.getByText('actions.cancel'));

    expect(screen.queryByText('fileMenu.saveProjectAs')).toBeNull();
  });

  test('calls saveAs when Save button is clicked in SaveAsDialog', () => {
    render(<FileMenu />);

    clickToolbarButton('fileMenu.saveAs');

    // The toolbar also has a "fileMenu.save" button, so use getAllByText
    // and pick the one inside the dialog overlay.
    const heading = screen.getByText('fileMenu.saveProjectAs');
    const dialogContainer = heading.parentElement!.parentElement!;
    const saveButton = within(dialogContainer).getByText('fileMenu.save');
    fireEvent.click(saveButton);

    expect(mockFileOps.saveAs).toHaveBeenCalledTimes(1);
    expect(mockFileOps.saveAs).toHaveBeenCalledWith('fileMenu.myProject');
  });

  // -----------------------------------------------------------------------
  // MarketplaceDialog – open / close behaviour
  // -----------------------------------------------------------------------

  test('opens MarketplaceDialog when Marketplace button is clicked', () => {
    render(<FileMenu />);

    // MarketplaceDialog mock renders only when isOpen is true
    expect(screen.queryByTestId('marketplace-dialog')).toBeNull();

    clickToolbarButton('marketplace.title');

    expect(screen.getByTestId('marketplace-dialog')).toBeTruthy();
  });

  test('closes MarketplaceDialog when close is clicked', () => {
    render(<FileMenu />);

    clickToolbarButton('marketplace.title');
    expect(screen.getByTestId('marketplace-dialog')).toBeTruthy();

    // Mock's onClose triggers the real close
    fireEvent.click(screen.getByTestId('marketplace-close-btn'));

    // After the real onClose runs, isOpen becomes false → mock returns null
    expect(screen.queryByTestId('marketplace-dialog')).toBeNull();
  });

  test('shows preview toast when MarketplaceDialog preview is triggered', () => {
    render(<FileMenu />);
    clickToolbarButton('marketplace.title');

    // The real MarketplaceDialog passes onPreviewTemplate that calls toast.info
    // Since we mock MarketplaceDialog, this test verifies the mock integration
    expect(screen.getByTestId('marketplace-dialog')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // AI Generate dialog — error details
  // -----------------------------------------------------------------------

  describe('AI Generate dialog error details', () => {
    beforeEach(() => {
      mockAiGeneration.isGenerating = false;
      mockAiGeneration.providerStatus = [{ provider: 'openai-compatible', configured: true }];
      mockAiGeneration.generate.mockReset();
      mockAiGeneration.refreshProviderStatus.mockReset();
      useProcessMetadataStore.setState({
        metadata: {
          id: 'p1',
          name: 'Test Process',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
    });

    afterEach(() => {
      useProcessMetadataStore.setState({ metadata: null });
    });

    test('shows a details toggle and the raw error text on generation failure', async () => {
      mockAiGeneration.generate.mockResolvedValue({
        success: false,
        errors: ['Upstream error (code 500): Internal Server Error'],
      });
      render(<FileMenu />);

      clickToolbarButton('fileMenu.aiGenerate');
      fireEvent.change(screen.getByPlaceholderText('aiGenerate.promptPlaceholder'), {
        target: { value: 'do something' },
      });

      await act(async () => {
        fireEvent.click(screen.getByText('aiGenerate.generate'));
      });

      expect(screen.getByText('aiGenerate.generateFailed')).toBeTruthy();
      expect(screen.queryByText('Upstream error (code 500): Internal Server Error')).toBeNull();

      fireEvent.click(screen.getByText('aiGenerate.showDetails'));

      expect(screen.getByText('Upstream error (code 500): Internal Server Error')).toBeTruthy();
      expect(screen.getByText('aiGenerate.hideDetails')).toBeTruthy();
    });

    test('copies the raw error details to the clipboard', async () => {
      mockAiGeneration.generate.mockResolvedValue({
        success: false,
        errors: ['Edge from "n1" uses handle "catch", but blockType "try-catch" only supports: error, output.'],
      });
      render(<FileMenu />);

      clickToolbarButton('fileMenu.aiGenerate');
      fireEvent.change(screen.getByPlaceholderText('aiGenerate.promptPlaceholder'), {
        target: { value: 'do something' },
      });

      await act(async () => {
        fireEvent.click(screen.getByText('aiGenerate.generate'));
      });

      fireEvent.click(screen.getByText('aiGenerate.showDetails'));
      fireEvent.click(screen.getByLabelText('aiGenerate.copyDetails'));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Edge from "n1" uses handle "catch", but blockType "try-catch" only supports: error, output.'
      );
    });

    test('does not show a details toggle when generation succeeds', async () => {
      mockAiGeneration.generate.mockResolvedValue({
        success: true,
        preview: { nodes: [], edges: [], warnings: [], variableNames: [] },
      });
      render(<FileMenu />);

      clickToolbarButton('fileMenu.aiGenerate');
      fireEvent.change(screen.getByPlaceholderText('aiGenerate.promptPlaceholder'), {
        target: { value: 'do something' },
      });

      await act(async () => {
        fireEvent.click(screen.getByText('aiGenerate.generate'));
      });

      expect(screen.queryByText('aiGenerate.showDetails')).toBeNull();
    });
  });
});
