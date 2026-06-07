import { describe, it, expect } from 'vitest';
import type { RpaNode, RpaEdge } from '@rpaforge/domain-model';
import { generatePythonCode } from './generator';
import { diagramToMermaid } from './mermaidGenerator';
import { nodes as simpleNodes, edges as simpleEdges } from './golden/simple-process';
import { nodes as complexNodes, edges as complexEdges } from './golden/complex-process';

describe('golden', () => {
  describe('simple process', () => {
    it('generates expected Python code', () => {
      const diagram = { nodes: simpleNodes, edges: simpleEdges };
      const actual = generatePythonCode(diagram);
      const expected = `"""Auto-generated RPAForge process."""

def Simple_Process():
    builtin.log("Hello, World!")
    # End


if __name__ == "__main__":
    Simple_Process()
`;
      expect(actual).toBe(expected);
    });

    it('generates valid Mermaid output', () => {
      const mermaid = diagramToMermaid(simpleNodes, simpleEdges);
      expect(mermaid).toContain('flowchart TD');
      expect(mermaid).toContain('Start');
      expect(mermaid).toContain('Log');
      expect(mermaid).toContain('End');
    });
  });

  describe('complex process', () => {
    it('generates expected Python code', () => {
      const diagram = { nodes: complexNodes, edges: complexEdges };
      const actual = generatePythonCode(diagram);
      const expected = `"""Auto-generated RPAForge process."""

def Complex_Process():
    if \${status} == "approved":
        builtin.log("Approval confirmed")
    else:
        desktopui.open_application("notepad.exe")
    builtin.log("Not approved - opening notepad")
    builtin.log("Processing complete")
    # End
from rpaforge_libraries.DesktopUI import *



if __name__ == "__main__":
    Complex_Process()
`;
      expect(actual).toBe(expected);
    });

    it('generates valid Mermaid output', () => {
      const mermaid = diagramToMermaid(complexNodes, complexEdges);
      expect(mermaid).toContain('flowchart TD');
      expect(mermaid).toContain('Start');
      expect(mermaid).toContain('End');
      expect(mermaid).toContain('Log');
      expect(mermaid).toContain('Open Application');
    });
  });
});
