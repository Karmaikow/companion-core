import { parse } from 'acorn';
import rewritePattern from 'regexpu-core';

// Node Mobile has no ICU: expand Unicode properties at build time, not on-device.
export function mobileRegexps(source) {
  const edits = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.regex && /\\[pP]\{/.test(node.regex.pattern)) {
      const pattern = rewritePattern(node.regex.pattern, node.regex.flags, { unicodePropertyEscapes: 'transform' });
      edits.push({ start: node.start, end: node.end, text: `/${pattern}/${node.regex.flags}` });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parse(source, { ecmaVersion: 2022, sourceType: 'script' }));
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
