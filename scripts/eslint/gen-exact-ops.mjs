// §6.4 determinism lint: src/core/gen/** may use only exactly rounded
// operations. ECMA-262 leaves the transcendental Math members
// implementation-approximated (Math.pow differed by 1 ulp in 10% of inputs
// between V8 12.4 and 13.6), and `**` routes through the same machinery.

const ALLOWED_MATH = new Set([
  'sqrt', 'floor', 'ceil', 'round', 'trunc', 'abs', 'min', 'max',
  'fround', 'imul', 'clz32',
  // Exact value properties.
  'PI', 'E', 'MAX_SAFE_INTEGER', 'MIN_SAFE_INTEGER',
]);

const BANNED_GLOBALS = new Set(['Date', 'performance', 'crypto']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'allow only exactly rounded arithmetic in the terrain generator',
    },
    messages: {
      math: 'Math.{{name}} is implementation-approximated (ECMA-262); only the exact-ops allowlist is permitted in src/core/gen/**.',
      exponent: 'The ** operator is implementation-approximated; use integer loops or allowed Math members.',
      global: '{{name}} is non-deterministic and banned in src/core/gen/**.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object.type !== 'Identifier' || node.object.name !== 'Math') return;
        let name = null;
        if (!node.computed && node.property.type === 'Identifier') name = node.property.name;
        else if (node.computed && node.property.type === 'Literal') name = String(node.property.value);
        if (name === null || !ALLOWED_MATH.has(name)) {
          context.report({ node, messageId: 'math', data: { name: name ?? '<computed>' } });
        }
      },
      BinaryExpression(node) {
        if (node.operator === '**') context.report({ node, messageId: 'exponent' });
      },
      AssignmentExpression(node) {
        if (node.operator === '**=') context.report({ node, messageId: 'exponent' });
      },
      Identifier(node) {
        if (!BANNED_GLOBALS.has(node.name)) return;
        const p = node.parent;
        // Only flag reads of the global, not `obj.performance` or declarations.
        if (p.type === 'MemberExpression' && p.property === node && !p.computed) return;
        if (p.type === 'Property' && p.key === node && !p.computed) return;
        if ((p.type === 'VariableDeclarator' && p.id === node) || p.type === 'FunctionDeclaration') return;
        const scope = context.sourceCode.getScope(node);
        const ref = scope.references.find((r) => r.identifier === node);
        if (ref && ref.resolved && ref.resolved.defs.length > 0) return; // locally shadowed
        context.report({ node, messageId: 'global', data: { name: node.name } });
      },
    };
  },
};
