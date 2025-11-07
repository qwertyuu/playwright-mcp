#!/usr/bin/env node
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Determine if we're being installed as a dependency or run directly from the repo
const isInstalledAsDependency = __dirname.includes('node_modules');

if (isInstalledAsDependency) {
  // We're installed as a dependency, need to apply patches from parent directory
  const patchDir = path.join(__dirname, 'patches');

  // Check if patches directory exists
  if (fs.existsSync(patchDir)) {
    try {
      // Navigate to parent's parent directory (up from node_modules/@playwright/mcp)
      const projectRoot = path.resolve(__dirname, '../..');

      console.log('Applying Playwright MCP patches...');
      execSync(`npx patch-package --patch-dir "${patchDir}"`, {
        cwd: projectRoot,
        stdio: 'inherit'
      });
    } catch (error) {
      console.error('Failed to apply patches:', error.message);
      // Don't fail the installation, just warn
      console.warn('You may need to manually run: npx patch-package --patch-dir node_modules/@playwright/mcp/patches');
    }
  }
} else {
  // We're in the repo itself, apply patches normally
  try {
    console.log('Applying patches in development mode...');
    execSync('npx patch-package', {
      cwd: __dirname,
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('Failed to apply patches:', error.message);
  }
}
