import { useEffect, useState, useCallback, useRef } from 'react';
import type * as Monaco from 'monaco-editor';
import type { Activity } from '../../../domain/activity';

interface RPACompletionCache {
  activities: Activity[];
  timestamp: number;
  ttl: number;
}

const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/**
 * Heuristic: is the cursor inside a string literal or comment on this line?
 * Single-line scan (does not track triple-quoted strings across lines), which is
 * enough to stop activity/library completions from popping up while the user
 * types prose such as a log message.
 */
function isInStringOrComment(textBeforeCursor: string): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < textBeforeCursor.length; i++) {
    const ch = textBeforeCursor[i];
    if (ch === '#' && !inSingle && !inDouble) {
      return true;
    }
    if (ch === "'" && !inDouble && textBeforeCursor[i - 1] !== '\\') {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && textBeforeCursor[i - 1] !== '\\') {
      inDouble = !inDouble;
    }
  }
  return inSingle || inDouble;
}

/**
 * Find the function call that encloses the cursor and which argument (0-based)
 * the cursor is currently in, by scanning the line left of the cursor.
 */
function findEnclosingCall(
  textBeforeCursor: string
): { name: string; argIndex: number } | null {
  let depth = 0;
  let argIndex = 0;
  let openIndex = -1;
  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const ch = textBeforeCursor[i];
    if (ch === ')') {
      depth++;
    } else if (ch === '(') {
      if (depth === 0) {
        openIndex = i;
        break;
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      argIndex++;
    }
  }
  if (openIndex < 0) {
    return null;
  }
  const match = textBeforeCursor.slice(0, openIndex).match(/([A-Za-z_]\w*)\s*$/);
  return match ? { name: match[1], argIndex } : null;
}

export function useRPACompletions() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<RPACompletionCache | null>(null);

  const fetchActivities = useCallback(async () => {
    if (!window.rpaforge?.engine) {
      return;
    }

    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < cacheRef.current.ttl) {
      setActivities(cacheRef.current.activities);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.rpaforge.engine.getActivities();
      if (result && 'activities' in result) {
        setActivities(result.activities);
        cacheRef.current = {
          activities: result.activities,
          timestamp: Date.now(),
          ttl: DEFAULT_CACHE_TTL,
        };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activities');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchActivities();
  }, [fetchActivities]);

  const registerCompletions = useCallback(
    (monaco: typeof Monaco) => {
      const disposable = monaco.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['.'],
        provideCompletionItems: (model, position) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          if (isInStringOrComment(textUntilPosition)) {
            return { suggestions: [] };
          }

          // Replace the word under the cursor so Monaco filters the list by the
          // typed prefix instead of showing every activity at once.
          const word = model.getWordUntilPosition(position);
          const wordRange = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          };

          const activitySuggestions: Monaco.languages.CompletionItem[] = activities.map(
            (activity) => ({
              label: activity.name,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: activity.params.length > 0
                ? `${activity.name}(${activity.params.map((a, i) => `\${${i + 1}:${a.name}}`).join(', ')})`
                : `${activity.name}()`,
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: {
                value: `**${activity.name}** (${activity.library})\n\n${activity.description}\n\n${
                  activity.params.length > 0
                    ? `**Parameters:**\n${activity.params
                        .map((a) => `- \`${a.name}\` (${a.type})${a.required ? ' *required*' : ''}`)
                        .join('\n')}`
                    : ''
                }`,
                isTrusted: true,
              },
              detail: activity.library,
              range: wordRange,
            })
          );

          const librarySuggestions: Monaco.languages.CompletionItem[] = [
            'DesktopUI',
            'WebUI',
            'Excel',
            'OCR',
            'Database',
            'Credentials',
          ].map((lib) => ({
            label: lib,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: lib,
            documentation: {
              value: `**${lib}** - RPAForge ${lib} library`,
              isTrusted: true,
            },
            range: wordRange,
          }));

          const dotMatch = textUntilPosition.match(/(\w+)\.(\w*)$/);
          if (dotMatch) {
            const prefix = dotMatch[2];
            const filteredActivities = activities.filter((a) =>
              a.name.toLowerCase().startsWith(prefix.toLowerCase())
            );

            return {
              suggestions: filteredActivities.map((activity) => ({
                label: activity.name,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: activity.params.length > 0
                  ? `${activity.name}(${activity.params.map((_, i) => `\${${i + 1}:${_.name}}`).join(', ')})`
                  : `${activity.name}()`,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                documentation: {
                  value: `**${activity.name}** (${activity.library})\n\n${activity.description}`,
                  isTrusted: true,
                },
                detail: activity.library,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column - prefix.length,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              })),
            };
          }

          const importMatch = textUntilPosition.match(/from\s+(\w*)$/);
          if (importMatch) {
            const prefix = importMatch[1];
            return {
              suggestions: librarySuggestions.filter((s) =>
                String(s.label).toLowerCase().startsWith(prefix.toLowerCase())
              ),
            };
          }

          return {
            suggestions: [...activitySuggestions, ...librarySuggestions],
          };
        },
      });

      const hoverDisposable = monaco.languages.registerHoverProvider('python', {
        provideHover: (_model, position) => {
          const word = _model.getWordAtPosition(position);
          if (!word) return null;

          const activity = activities.find(
            (a) => a.name === word.word
          );

          if (!activity) return null;

          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            },
            contents: [
              {
                value: `**${activity.name}** \`${activity.library}\``,
                isTrusted: true,
              },
              {
                value: activity.description,
                isTrusted: true,
              },
              ...(activity.params.length > 0
                ? [
                    {
                      value: `**Parameters:**\n${activity.params
                        .map((a) => `- \`${a.name}\` (${a.type})${a.required ? ' *required*' : ''}`)
                        .join('\n')}`,
                      isTrusted: true,
                    },
                  ]
                : []),
            ],
          };
        },
      });

      const signatureDisposable = monaco.languages.registerSignatureHelpProvider(
        'python',
        {
          signatureHelpTriggerCharacters: ['(', ','],
          signatureHelpRetriggerCharacters: [','],
          provideSignatureHelp: (model, position) => {
            const textUntilPosition = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });

            const call = findEnclosingCall(textUntilPosition);
            if (!call) return null;

            const activity = activities.find((a) => a.name === call.name);
            if (!activity || activity.params.length === 0) return null;

            const paramLabels = activity.params.map(
              (param) => `${param.name}: ${param.type}`
            );

            return {
              value: {
                signatures: [
                  {
                    label: `${activity.name}(${paramLabels.join(', ')})`,
                    documentation: activity.description,
                    parameters: activity.params.map((param, index) => ({
                      label: paramLabels[index],
                      documentation: param.description || '',
                    })),
                  },
                ],
                activeSignature: 0,
                activeParameter: Math.min(
                  call.argIndex,
                  activity.params.length - 1
                ),
              },
              dispose: () => {},
            };
          },
        }
      );

      return () => {
        disposable.dispose();
        hoverDisposable.dispose();
        signatureDisposable.dispose();
      };
    },
    [activities]
  );

  return {
    activities,
    isLoading,
    error,
    refetch: fetchActivities,
    registerCompletions,
  };
}
