import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { removeDrawioBlock } = await jiti.import('../src/utils/codeBlock.ts');

const cases = [
	{
		name: 'keeps one blank line between surrounding paragraphs',
		input: ['Before', '', '```drawio', '<mxfile/>', '```', '', 'After'].join('\n'),
		range: { start: 2, end: 4 },
		expected: ['Before', '', 'After'].join('\n'),
	},
	{
		name: 'preserves CRLF line endings',
		input: ['Before', '', '~~~drawio', '<mxfile/>', '~~~', '', 'After'].join('\r\n'),
		range: { start: 2, end: 4 },
		expected: ['Before', '', 'After'].join('\r\n'),
	},
	{
		name: 'removes a block-only document',
		input: ['```drawio', '<mxfile/>', '```'].join('\n'),
		range: { start: 0, end: 2 },
		expected: '',
	},
	{
		name: 'removes a leading separator with a leading block',
		input: ['```drawio', '<mxfile/>', '```', '', 'After'].join('\n'),
		range: { start: 0, end: 2 },
		expected: 'After',
	},
	{
		name: 'removes a preceding separator with a trailing block',
		input: ['Before', '', '```drawio', '<mxfile/>', '```'].join('\n'),
		range: { start: 2, end: 4 },
		expected: 'Before',
	},
	{
		name: 'does not invent spacing where none existed',
		input: ['Before', '```drawio', '<mxfile/>', '```', 'After'].join('\n'),
		range: { start: 1, end: 3 },
		expected: ['Before', 'After'].join('\n'),
	},
];

for (const testCase of cases) {
	assert.equal(
		removeDrawioBlock(testCase.input, testCase.range),
		testCase.expected,
		testCase.name,
	);
}

assert.throws(
	() => removeDrawioBlock('Not a draw.io block', { start: 0, end: 1 }),
	/The draw\.io code block could not be removed\./,
	'rejects a stale or invalid source range',
);

process.stdout.write('Verified safe draw.io fenced-block deletion and newline preservation\n');
