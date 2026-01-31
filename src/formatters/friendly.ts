/**
 * Friendly Reviewer Formatter
 * 
 * Transforms analysis results into human-friendly PR comments
 * that feel like they're from a helpful teammate, not a linter.
 */

import {
  HunkAnalysis,
  FileAnalysis,
  ReviewResult,
  SummaryAnalysis,
  PatternAnalysis,
  PatternMatch,
  ComplexityAnalysis,
  ComplexityMetrics
} from '../types.js';
import { getSeverityLabel } from '../analyzers/complexity.js';

/**
 * Generate ASCII diagram showing nesting structure
 */
function generateNestingDiagram(code: string, functionName?: string): string {
  const lines = code.split('\n');
  let depth = 0;
  let maxDepth = 0;
  const structure: Array<{ depth: number; label: string }> = [];
  
  // Find control flow structures
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Opening braces increase depth
    if (trimmed.includes('{')) {
      // Identify what kind of block
      let label = '';
      if (trimmed.match(/\btry\s*{/)) label = 'try';
      else if (trimmed.match(/\bcatch\s*\(/)) label = 'catch';
      else if (trimmed.match(/\bif\s*\(/)) label = 'if';
      else if (trimmed.match(/\belse\s*(if\s*\()?{?/)) label = 'else';
      else if (trimmed.match(/\bfor\s*\(/)) label = 'for';
      else if (trimmed.match(/\bwhile\s*\(/)) label = 'while';
      else if (trimmed.match(/\bfunction\s/)) label = 'fn';
      else if (trimmed.match(/=>\s*{/)) label = '→';
      else if (trimmed.match(/async\s/)) label = 'async';
      
      if (label) {
        structure.push({ depth, label });
      }
      
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    }
    
    if (trimmed.includes('}')) {
      depth = Math.max(0, depth - 1);
    }
  }
  
  if (structure.length < 2) return '';
  
  // Build simpler ASCII diagram that doesn't break formatting
  const name = functionName || 'function';
  const lines2: string[] = [];
  
  lines2.push('```');
  lines2.push(`${name}()`);
  
  // Show first few levels of nesting in tree format
  const shown = structure.slice(0, 6);
  for (let i = 0; i < shown.length; i++) {
    const item = shown[i];
    const indent = '  '.repeat(Math.min(item.depth, 4));
    const prefix = i === shown.length - 1 ? '└─' : '├─';
    const depthNote = item.depth >= 3 ? ` ← ${item.depth + 1} levels deep!` : '';
    lines2.push(`${indent}${prefix} ${item.label}${depthNote}`);
  }
  
  if (structure.length > 6) {
    lines2.push(`  ... +${structure.length - 6} more nested blocks`);
  }
  
  lines2.push('```');
  
  return lines2.join('\n');
}

/**
 * Generate component hierarchy diagram
 */
function generateComponentDiagram(componentName: string, subComponents: string[]): string {
  if (subComponents.length === 0) return '';
  
  const lines = [
    '```',
    componentName,
    ...subComponents.map((c, i) => {
      const isLast = i === subComponents.length - 1;
      return `${isLast ? '└' : '├'}── ${c}`;
    }),
    '```'
  ];
  
  return lines.join('\n');
}

/**
 * Generate state flow diagram
 */
function generateStateFlowDiagram(states: string[]): string {
  if (states.length === 0) return '';
  
  const lines = ['```'];
  lines.push('State Flow:');
  lines.push('');
  
  for (let i = 0; i < states.length; i++) {
    lines.push(`  [${states[i]}]`);
    if (i < states.length - 1) {
      lines.push('      ↓');
    }
  }
  
  lines.push('```');
  return lines.join('\n');
}

/**
 * Get friendly greeting based on severity
 */
function getGreeting(score: number): string {
  if (score <= 3) return "Looking good! 👍";
  if (score <= 5) return "Hey! 👋 A few things to note:";
  if (score <= 7) return "Hey! 👋 This could use some attention:";
  return "Heads up! 🚨 This needs a closer look:";
}

/**
 * Get friendly severity description
 */
function getSeverityDescription(score: number): string {
  if (score <= 3) return "Clean and straightforward";
  if (score <= 5) return "A bit busy but manageable";
  if (score <= 7) return "Getting complex - might slow down reviewers";
  return "Pretty tangled - will take time to understand";
}

/**
 * Format a complexity analysis in friendly style
 */
function formatFriendlyComplexity(
  complexity: ComplexityAnalysis,
  code: string,
  filename: string
): string {
  const parts: string[] = [];
  const score = complexity.score;
  const label = getSeverityLabel(score);
  
  // Friendly intro
  parts.push(getGreeting(score));
  parts.push('');
  
  // Only show diagram for complex code
  if (score > 5) {
    // Extract function name if possible
    const fnMatch = code.match(/(?:function\s+(\w+)|const\s+(\w+)\s*=|(\w+)\s*\()/);
    const fnName = fnMatch?.[1] || fnMatch?.[2] || fnMatch?.[3] || 'this function';
    
    const diagram = generateNestingDiagram(code, fnName);
    if (diagram) {
      parts.push(diagram);
      parts.push('');
    }
  }
  
  // What's going on section
  parts.push('**What\'s going on:**');
  
  const issues: string[] = [];
  for (const flag of complexity.flags) {
    switch (flag.metric) {
      case 'nestingDepth':
        issues.push(`${flag.value} levels of nesting makes it hard to follow the logic`);
        break;
      case 'cyclomaticComplexity':
        issues.push(`${flag.value} different code paths to consider`);
        break;
      case 'parameterCount':
        issues.push(`${flag.value} parameters is a lot to remember`);
        break;
      case 'lineCount':
        issues.push(`${flag.value} lines means scrolling to understand`);
        break;
      case 'dependencyCount':
        issues.push(`${flag.value} imports suggests too many responsibilities`);
        break;
    }
  }
  
  if (issues.length === 0) {
    parts.push('Actually, this looks pretty reasonable!');
  } else {
    parts.push(issues.join('. ') + '.');
  }
  parts.push('');
  
  // Quick wins section (only for complex code)
  if (score > 4 && complexity.suggestions.length > 0) {
    parts.push('**Quick wins:**');
    
    // Provide concrete suggestions based on issues
    const hasTryCatch = code.match(/catch/g)?.length || 0;
    const hasNestedTry = hasTryCatch > 2;
    
    if (hasNestedTry) {
      parts.push('');
      parts.push('Those nested try-catch blocks? You could simplify to:');
      parts.push('');
      parts.push('```typescript');
      parts.push('// Instead of 5+ nested try-catches, use one:');
      parts.push('try {');
      parts.push('  const response = await fetch(url);');
      parts.push('  const data = await response.json();');
      parts.push('  setState(data);');
      parts.push('} catch (error) {');
      parts.push('  setError(error instanceof Error ? error.message : \'Unknown error\');');
      parts.push('}');
      parts.push('```');
      parts.push('');
      parts.push('React\'s error boundaries handle render errors, so you don\'t need try-catch around JSX returns.');
    } else if (complexity.metrics.nestingDepth > 4) {
      parts.push('');
      parts.push('Extract those nested conditionals into helper functions:');
      parts.push('');
      parts.push('```typescript');
      parts.push('// Instead of deeply nested ifs:');
      parts.push('const canProceed = checkPreconditions(data);');
      parts.push('const result = canProceed ? processData(data) : handleError();');
      parts.push('```');
    } else if (complexity.metrics.lineCount > 80) {
      parts.push('');
      parts.push('Consider splitting into smaller functions. A good rule of thumb:');
      parts.push('if you can name what a block does, extract it.');
    }
    
    parts.push('');
  }
  
  // Why this helps
  if (score > 5) {
    parts.push('**Why this matters:**');
    if (score > 7) {
      parts.push('Code this complex typically takes 2-3x longer to review. Simplifying now saves everyone time.');
    } else {
      parts.push('Simpler code = faster reviews = fewer bugs slipping through.');
    }
    parts.push('');
  }
  
  // Severity badge at the end
  const emoji = score <= 3 ? '🟢' : score <= 5 ? '🟡' : score <= 7 ? '🟠' : '🔴';
  parts.push(`<sub>${emoji} Complexity: ${score.toFixed(1)}/10 (${label})</sub>`);
  
  return parts.join('\n');
}

/**
 * Format pattern matches in friendly style
 */
function formatFriendlyPatterns(patterns: PatternAnalysis): string {
  if (patterns.patternsFound.length === 0) return '';
  
  const parts: string[] = [];
  
  parts.push('**🔮 I noticed some AI-isms:**');
  parts.push('');
  
  for (const pattern of patterns.patternsFound) {
    const friendlyLabel = getFriendlyPatternLabel(pattern.type);
    parts.push(`**${friendlyLabel}**`);
    parts.push(`${pattern.issue}`);
    
    if (pattern.simplerAlternative) {
      parts.push('');
      parts.push(`💡 *Simpler approach:* ${pattern.simplerAlternative}`);
    }
    parts.push('');
  }
  
  if (patterns.keyQuestion) {
    parts.push(`> 🤔 **Question to ask:** ${patterns.keyQuestion}`);
    parts.push('');
  }
  
  return parts.join('\n');
}

/**
 * Get friendly pattern labels
 */
function getFriendlyPatternLabel(type: string): string {
  const labels: Record<string, string> = {
    'over-defensive': '🛡️ Defense Overload',
    'verbose-comments': '📝 Comment Overload',
    'over-abstraction': '🏗️ Over-Engineered',
    'naming-chaos': '🏷️ Naming Inconsistency',
    'import-bloat': '📦 Import Overload',
    'monolithic-function': '🐘 Too Much in One Place',
    'catch-all-error': '🎣 Catch-All Errors'
  };
  return labels[type] || type;
}

/**
 * Format summary in friendly style
 */
function formatFriendlySummary(summary: SummaryAnalysis): string {
  const parts: string[] = [];
  
  parts.push('**📋 Quick Summary:**');
  parts.push('');
  parts.push(`**What changed:** ${summary.what}`);
  parts.push('');
  parts.push(`**Why (probably):** ${summary.why}`);
  
  if (summary.watch.length > 0) {
    parts.push('');
    parts.push('**Worth checking:**');
    for (const item of summary.watch) {
      parts.push(`- ${item}`);
    }
  }
  
  parts.push('');
  return parts.join('\n');
}

/**
 * Format a complete hunk analysis in friendly style
 */
export function formatFriendlyHunkAnalysis(
  hunk: HunkAnalysis,
  includeContext: boolean = true
): string {
  const parts: string[] = [];
  
  // Summary first if available
  if (hunk.summary) {
    parts.push(formatFriendlySummary(hunk.summary));
  }
  
  // Patterns
  if (hunk.patterns && hunk.patterns.patternsFound.length > 0) {
    parts.push(formatFriendlyPatterns(hunk.patterns));
  }
  
  // Complexity (only if notable)
  if (hunk.complexity && hunk.complexity.score > 3) {
    parts.push(formatFriendlyComplexity(
      hunk.complexity,
      hunk.hunk.content,
      hunk.hunk.filename
    ));
  }
  
  return parts.join('\n');
}

/**
 * Format complete review result in friendly style
 */
export function formatFriendlyReviewResult(result: ReviewResult): string {
  const parts: string[] = [];
  
  // Header - friendly and concise
  parts.push('## 🔍 AI Review Helper');
  parts.push('');
  
  // Quick stats
  const hasIssues = result.files.some(f => 
    f.overallComplexity > 5 || 
    f.hunks.some(h => h.patterns?.patternsFound.length || 0 > 0)
  );
  
  if (!hasIssues) {
    parts.push('✨ Looking good! No major concerns found.');
    parts.push('');
    parts.push(`<sub>Reviewed ${result.totalHunks} changes across ${result.files.length} files in ${(result.totalProcessingTime / 1000).toFixed(1)}s</sub>`);
    return parts.join('\n');
  }
  
  // Per-file analysis
  for (const file of result.files) {
    if (file.hunks.every(h => 
      (!h.complexity || h.complexity.score <= 3) && 
      (!h.patterns || h.patterns.patternsFound.length === 0)
    )) {
      continue; // Skip clean files
    }
    
    parts.push(`### 📄 \`${file.filename}\``);
    parts.push('');
    
    for (const hunk of file.hunks) {
      // Only show hunks with findings
      const hasFindings = (hunk.complexity && hunk.complexity.score > 3) ||
                         (hunk.patterns && hunk.patterns.patternsFound.length > 0);
      
      if (!hasFindings) continue;
      
      parts.push(`<details>`);
      parts.push(`<summary>Lines ${hunk.hunk.startLine}-${hunk.hunk.endLine}</summary>`);
      parts.push('');
      parts.push(formatFriendlyHunkAnalysis(hunk));
      parts.push('');
      parts.push('</details>');
      parts.push('');
    }
  }
  
  // Footer
  parts.push('---');
  parts.push(`<sub>Reviewed ${result.totalHunks} changes • ${(result.totalProcessingTime / 1000).toFixed(1)}s • [How to disable](https://github.com/Arephan/reviewpal#configuration)</sub>`);
  
  return parts.join('\n');
}

/**
 * Format as inline PR comment (for specific lines)
 */
export function formatFriendlyInlineComment(
  hunk: HunkAnalysis,
  lineNumber: number
): string {
  const parts: string[] = [];
  
  // Shorter format for inline comments
  if (hunk.complexity && hunk.complexity.score > 5) {
    const score = hunk.complexity.score;
    
    if (score > 7) {
      parts.push('🚨 **This is pretty complex** - might slow down reviews.');
    } else {
      parts.push('👋 **A bit tangled here** - could simplify.');
    }
    parts.push('');
    
    // One key suggestion
    if (hunk.complexity.flags.some(f => f.metric === 'nestingDepth')) {
      parts.push('💡 Consider extracting nested logic into helper functions.');
    } else if (hunk.complexity.flags.some(f => f.metric === 'lineCount')) {
      parts.push('💡 Could split this into smaller, focused functions.');
    }
  }
  
  if (hunk.patterns && hunk.patterns.patternsFound.length > 0) {
    const pattern = hunk.patterns.patternsFound[0];
    parts.push('');
    parts.push(`🔮 ${getFriendlyPatternLabel(pattern.type)}: ${pattern.issue}`);
    if (pattern.simplerAlternative) {
      parts.push(`💡 ${pattern.simplerAlternative}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Format as GitHub suggestion (with ` ```suggestion ` blocks)
 */
export function formatGitHubSuggestion(
  originalCode: string,
  suggestedCode: string,
  explanation: string
): string {
  return `${explanation}

\`\`\`suggestion
${suggestedCode}
\`\`\``;
}
