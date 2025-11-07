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

// Get absolute path to this script's directory
const scriptDir = path.resolve(__dirname);

// Determine if we're being installed as a dependency or run directly from the repo
const isInstalledAsDependency = scriptDir.includes('node_modules');

if (isInstalledAsDependency) {
  // We're installed as a dependency, need to apply patches from parent directory
  const patchDir = path.join(scriptDir, 'patches');

  // Check if patches directory exists
  if (fs.existsSync(patchDir)) {
    try {
      // Navigate up from node_modules/@playwright/mcp to the project root
      const projectRoot = path.resolve(scriptDir, '../../..');

      // Use relative path for patch-dir to avoid Windows path issues
      const relativePatchDir = 'node_modules/@playwright/mcp/patches';

      console.log('Applying Playwright MCP patches...');

      execSync(`npx patch-package --patch-dir "${relativePatchDir}"`, {
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
      cwd: scriptDir,
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('Failed to apply patches:', error.message);
  }
}
