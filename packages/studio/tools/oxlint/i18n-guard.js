/**
 * i18n guard as an oxlint JS plugin (issue #826, migration #884).
 *
 * Replaces the two `no-restricted-syntax` AST selectors from the old
 * eslint config: every pattern the confirmed hardcoded-text leaks shared —
 * multi-word English JSX text nodes and literal title/placeholder/aria-label
 * attributes. Tests are exempt via the `overrides` block in .oxlintrc.json
 * (they legitimately assert on raw strings).
 */

const TEXT_PATTERN = /^\s*[A-Z][a-z]+ [a-zA-Z]/;
const ATTRIBUTE_PATTERN = /^[A-Z][a-z]+/;
const GUARDED_ATTRIBUTES = new Set(['title', 'placeholder', 'aria-label']);

const hardcodedUiText = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Hardcoded user-facing text must be routed through i18n t()',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node) {
        if (TEXT_PATTERN.test(node.value)) {
          context.report({ node, message: 'Hardcoded UI text — route through i18n t() (issue #826).' });
        }
      },
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        if (!GUARDED_ATTRIBUTES.has(name)) return;
        const value = node.value;
        if (value && value.type === 'Literal' && typeof value.value === 'string' && ATTRIBUTE_PATTERN.test(value.value)) {
          context.report({ node, message: 'Hardcoded attribute text — route through i18n t() (issue #826).' });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: 'rpaforge' },
  rules: { 'hardcoded-ui-text': hardcodedUiText },
};

export default plugin;
