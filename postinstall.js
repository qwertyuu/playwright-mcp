#!/usr/bin/env node
/**
 * Postinstall script that patches playwright's network.js to add
 * browser_network_request_details tool and request IDs.
 */

const fs = require('fs');
const path = require('path');

const networkJsPaths = [
  path.join(__dirname, 'packages', 'playwright-mcp', 'node_modules', 'playwright', 'lib', 'mcp', 'browser', 'tools', 'network.js'),
  path.join(__dirname, 'node_modules', 'playwright', 'lib', 'mcp', 'browser', 'tools', 'network.js'),
];

const targetFile = networkJsPaths.find(p => fs.existsSync(p));
if (!targetFile) {
  console.log('postinstall: playwright network.js not found, skipping patch.');
  process.exit(0);
}

const content = fs.readFileSync(targetFile, 'utf-8');

// Check if already patched
if (content.includes('browser_network_request_details')) {
  console.log('postinstall: network.js already patched.');
  process.exit(0);
}

// Check that the file has the expected structure
if (!content.includes('async function renderRequest(request)')) {
  console.error('postinstall: network.js has unexpected structure, skipping patch.');
  process.exit(1);
}

let patched = content;

// 1. Add getRequestId function before renderRequest
patched = patched.replace(
  'async function renderRequest(request) {',
  `function getRequestId(request) {
  const guid = request._guid;
  const hash = guid.includes('@') ? guid.split('@')[1] : guid;
  return hash.slice(0, 8);
}
async function renderRequest(request) {`
);

// 2. Add request ID to renderRequest output
patched = patched.replace(
  "result.push(`[${request.method().toUpperCase()}] ${request.url()}`);",
  `const requestId = getRequestId(request);
  result.push(\`[\${requestId}] [\${request.method().toUpperCase()}] \${request.url()}\`);`
);

// 3. Add requestDetails tool before the network_default array
// Detect the import name for z (could be import_bundle, import_mcpBundle, etc.)
const zImportMatch = patched.match(/(\w+)\.z\.object\(/);
if (!zImportMatch) {
  console.error('postinstall: could not find z.object import, skipping patch.');
  process.exit(1);
}
const zImport = zImportMatch[1];

// Detect response.addResult signature style
const usesNewAddResult = patched.includes('await response.addResult("Network"');

const requestDetailsTool = `
const requestDetails = (0, import_tool.defineTabTool)({
  capability: "core",
  schema: {
    name: "browser_network_request_details",
    title: "Get network request details",
    description: "Returns detailed information about a specific network request including headers, body, timing, and response data. Use the request ID from browser_network_requests.",
    inputSchema: ${zImport}.z.object({
      requestId: ${zImport}.z.string().describe("Request ID from browser_network_requests (8-character hash)")
    }),
    type: "readOnly"
  },
  handle: async (tab, params, response) => {
    const requests2 = await tab.requests();
    const request = Array.from(requests2).find((r) => getRequestId(r) === params.requestId);
    if (!request) {
      response.addError(\`Request with ID \${params.requestId} not found. Use browser_network_requests to see available requests.\`);
      return;
    }
    ${usesNewAddResult
      ? 'response.addResult("Request Details", await renderRequestDetails(request), { prefix: "request-details", ext: "json" });'
      : 'response.addResult(await renderRequestDetails(request));'}
  }
});
async function renderRequestDetails(request) {
  const details = {
    request: {
      id: getRequestId(request),
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      postData: request.postData(),
      resourceType: request.resourceType()
    }
  };
  const response = request.existingResponse ? request.existingResponse() : (request._hasResponse ? await request.response() : null);
  if (response) {
    let body = null;
    let bodySize = 0;
    try {
      const bodyBuffer = await response.body();
      bodySize = bodyBuffer.length;
      if (bodySize > 0 && bodySize < 1e5) {
        const contentType = (response.headers ? response.headers() : {})["content-type"] || "";
        if (contentType.includes("text/") || contentType.includes("application/json") || contentType.includes("application/xml")) {
          body = bodyBuffer.toString("utf-8");
        } else {
          body = \`<binary data, \${bodySize} bytes>\`;
        }
      } else if (bodySize >= 1e5) {
        body = \`<large response, \${bodySize} bytes - truncated>\`;
      }
    } catch (e) {
      body = \`<unable to fetch body: \${e.message}>\`;
    }
    details.response = {
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers: response.headers(),
      body,
      bodySize
    };
    const timing = request._timing;
    if (timing) {
      details.timing = {
        startTime: timing.startTime,
        domainLookupStart: timing.domainLookupStart,
        domainLookupEnd: timing.domainLookupEnd,
        connectStart: timing.connectStart,
        connectEnd: timing.connectEnd,
        requestStart: timing.requestStart,
        responseStart: timing.responseStart,
        responseEnd: timing.responseEnd
      };
    }
  }
  const failure = request.failure ? request.failure() : null;
  if (failure) {
    details.failure = {
      errorText: failure.errorText
    };
  }
  return JSON.stringify(details, null, 2);
}
`;

// Insert requestDetails tool before the network_default array
patched = patched.replace(
  'var network_default = [',
  requestDetailsTool + '\nvar network_default = ['
);

// 4. Add requestDetails to the exported array
// Match the closing of network_default array and add requestDetails
patched = patched.replace(
  /var network_default = \[\n([\s\S]*?)\n\];/,
  (match, inner) => {
    const trimmed = inner.trimEnd();
    // Add requestDetails to the array
    if (trimmed.endsWith(',')) {
      return `var network_default = [\n${trimmed}\n  requestDetails\n];`;
    } else {
      return `var network_default = [\n${trimmed},\n  requestDetails\n];`;
    }
  }
);

fs.writeFileSync(targetFile, patched, 'utf-8');
console.log(`postinstall: Successfully patched ${targetFile}`);
