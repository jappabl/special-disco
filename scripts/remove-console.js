#!/usr/bin/env node
/**
 * Remove console.log/warn/error statements from TypeScript files
 */

const fs = require('fs');
const path = require('path');

const files = [
  'src/background.ts',
  'src/content.ts',
  'src/popup.ts',
  'src/analyticsPage.ts'
];

files.forEach(filePath => {
  const fullPath = path.join(process.cwd(), filePath);
  let content = fs.readFileSync(fullPath, 'utf8');

  // Remove single-line console statements
  content = content.replace(/^\s*console\.(log|warn|error|info|debug)\([^)]*\);?\s*$/gm, '');

  // Remove multi-line console statements (with objects, etc.)
  // This regex handles console.log with multi-line arguments
  content = content.replace(/^\s*console\.(log|warn|error|info|debug)\([^;]*?\);?\s*$/gms, '');

  // Clean up excessive blank lines (more than 2 consecutive)
  content = content.replace(/\n\n\n+/g, '\n\n');

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`✓ Cleaned ${filePath}`);
});

console.log('\n✅ All console statements removed!');
