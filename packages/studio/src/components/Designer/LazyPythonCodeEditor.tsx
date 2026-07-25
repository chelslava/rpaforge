import { lazy } from 'react';
import type { ComponentProps } from 'react';
import { LazyFeature } from '../Common/LazyFeature';

const PythonCodeEditor = lazy(() => import('./PythonCodeEditor'));

type LazyPythonCodeEditorProps = ComponentProps<typeof PythonCodeEditor>;

export default function LazyPythonCodeEditor(props: LazyPythonCodeEditorProps) {
  if (!props.isOpen) return null;

  return (
    <LazyFeature>
      <PythonCodeEditor {...props} />
    </LazyFeature>
  );
}
