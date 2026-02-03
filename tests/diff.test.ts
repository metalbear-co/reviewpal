import { parseDiff, extractContext, isTypeScriptFile, isTestFile, quickAiCheck } from '../src/parsers/diff';

describe('parseDiff', () => {
  it('parses a single-file diff with one hunk', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo';
+import { bar } from './bar';

 export function main() {`;

    const result = parseDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].filename).toBe('src/index.ts');
    expect(result.files[0].additions).toBe(1);
    expect(result.files[0].deletions).toBe(0);
    expect(result.files[0].hunks).toHaveLength(1);
    expect(result.files[0].hunks[0].startLine).toBe(1);
    expect(result.files[0].hunks[0].additions).toEqual(["import { bar } from './bar';"]);
    expect(result.files[0].hunks[0].deletions).toEqual([]);
  });

  it('parses a diff with additions and deletions', () => {
    const diff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -5,7 +5,7 @@
 some context
-old line
+new line
 more context`;

    const result = parseDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].additions).toBe(1);
    expect(result.files[0].deletions).toBe(1);
    expect(result.files[0].hunks[0].additions).toEqual(['new line']);
    expect(result.files[0].hunks[0].deletions).toEqual(['old line']);
  });

  it('parses multi-file diffs', () => {
    const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1,2 +1,3 @@
 a
+b
 c`;

    const result = parseDiff(diff);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].filename).toBe('file1.ts');
    expect(result.files[1].filename).toBe('file2.ts');
  });

  it('parses multiple hunks in one file', () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 first section
+added here
 end first
@@ -20,3 +21,4 @@
 second section
+added there
 end second`;

    const result = parseDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].hunks).toHaveLength(2);
    expect(result.files[0].hunks[0].startLine).toBe(1);
    expect(result.files[0].hunks[1].startLine).toBe(21);
  });

  it('returns empty files for empty input', () => {
    const result = parseDiff('');
    expect(result.files).toEqual([]);
  });

  it('generates fileDiffHash for hunks', () => {
    const diff = `diff --git a/foo.ts b/foo.ts
--- a/foo.ts
+++ b/foo.ts
@@ -1,2 +1,3 @@
 a
+b
 c`;

    const result = parseDiff(diff);
    expect(result.files[0].hunks[0].fileDiffHash).toBeDefined();
    expect(typeof result.files[0].hunks[0].fileDiffHash).toBe('string');
    expect(result.files[0].hunks[0].fileDiffHash!.length).toBe(64); // SHA256 hex
  });

  it('handles hunk headers without line counts', () => {
    const diff = `diff --git a/x.ts b/x.ts
--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-old
+new`;

    const result = parseDiff(diff);
    expect(result.files[0].hunks).toHaveLength(1);
    expect(result.files[0].hunks[0].startLine).toBe(1);
    expect(result.files[0].hunks[0].endLine).toBe(1);
  });
});

describe('extractContext', () => {
  const fileContent = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');

  it('extracts context around a range', () => {
    const ctx = extractContext(fileContent, 50, 55, 5);
    const lines = ctx.split('\n');
    expect(lines[0]).toBe('line 45');
    expect(lines[lines.length - 1]).toBe('line 60');
  });

  it('clamps to start of file', () => {
    const ctx = extractContext(fileContent, 1, 3, 5);
    expect(ctx.startsWith('line 1')).toBe(true);
  });

  it('clamps to end of file', () => {
    const ctx = extractContext(fileContent, 98, 100, 5);
    expect(ctx.endsWith('line 100')).toBe(true);
  });
});

describe('isTypeScriptFile', () => {
  it.each([
    ['app.ts', true],
    ['app.tsx', true],
    ['app.js', true],
    ['app.jsx', true],
    ['app.py', false],
    ['app.rs', false],
    ['tsconfig.json', false],
    ['README.md', false],
  ])('%s → %s', (filename, expected) => {
    expect(isTypeScriptFile(filename)).toBe(expected);
  });
});

describe('isTestFile', () => {
  it.each([
    ['app.test.ts', true],
    ['app.spec.tsx', true],
    ['app.test.js', true],
    ['__tests__/foo.ts', true],
    ['__mocks__/bar.ts', true],
    ['src/app.ts', false],
    ['test-utils.ts', false],
  ])('%s → %s', (filename, expected) => {
    expect(isTestFile(filename)).toBe(expected);
  });
});

describe('quickAiCheck', () => {
  it('returns low for minimal code', () => {
    const code = `const x = 1;\nconst y = 2;\nreturn x + y;`;
    expect(quickAiCheck(code)).toBe('low');
  });

  it('returns high for heavily commented code', () => {
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push('// This is a comment explaining the next line');
      lines.push(`const value${i} = ${i};`);
    }
    // 50% comment ratio → score ≥ 2 from comment density, plus possible pattern matches
    expect(['medium', 'high']).toContain(quickAiCheck(lines.join('\n')));
  });

  it('returns at least medium for code with many AI patterns', () => {
    const code = `
/** Documentation block */
/** Another doc block */
/** Third doc block */
// Initialize the main application handler
// Configure the database connection pool
// Set up authentication middleware
try {
  doSomething();
} catch (err) {
  console.error(err);
}
try {
  doAnother();
} catch (err) {
  console.log(err);
}
try {
  doThird();
} catch (err) {
  console.error(err);
}
const veryLongVariableNameForStoringData = 1;
const anotherExtremelyLongVariableName = 2;
const yetAnotherLongVariableNameHere = 3;
function extremelyLongFunctionNameForHandlingRequests() {}
function anotherVeryLongFunctionNameThatIsTypical() {}
function oneMoreExcessivelyLongFunctionName() {}
`;
    const result = quickAiCheck(code);
    expect(['medium', 'high']).toContain(result);
  });
});
