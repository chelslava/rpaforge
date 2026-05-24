/**
 * Builds a pre-filled GitHub new-issue URL for a console error entry.
 *
 * Control characters and Unicode bidirectional overrides are stripped from
 * the title segment before URL-encoding to prevent visual spoofing in the
 * browser address bar. The raw message is preserved verbatim in the body
 * (inside a fenced code block where overrides are harmless).
 */
export function buildIssueReportUrl(
  message: string,
  details?: Record<string, string>,
  timestamp: Date = new Date(),
): string {
  const safeMsg = message.replace(/[ -‎‏‪-‮]/g, '');
  const issueTitle = encodeURIComponent(`Error: ${safeMsg.slice(0, 50)}`);
  const issueBody = encodeURIComponent(
    `## Error Details\n\`\`\`\n${message}\n\`\`\`\n\n## Context\n- Activity: ${details?.activityName || 'N/A'}\n- Library: ${details?.library || 'N/A'}\n- Time: ${timestamp.toISOString()}\n\n## Steps to Reproduce\n1. \n2. \n3. \n\n## Expected Behavior\n\n## Actual Behavior`,
  );
  return `https://github.com/chelslava/rpaforge/issues/new?title=${issueTitle}&body=${issueBody}`;
}
