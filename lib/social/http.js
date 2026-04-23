/**
 * OpenPersona - Social HTTP helpers
 *
 * Shared HTTP client for lib/social/acn-client.js and lib/social/contacts.js.
 * Supports GET, POST, and DELETE with optional Authorization header (Agent API Key).
 * No external dependencies — uses Node.js built-in https/http.
 *
 * Safety limits:
 *   - 15 s request timeout (prevents CLI hang on unresponsive ACN gateway)
 *   - 5 MB response body cap (prevents OOM from malicious/buggy gateways)
 */
const https = require('https');
const http = require('http');

const TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Make an HTTP GET request.
 *
 * @param {string} url
 * @param {object} [headers] - Additional headers (e.g. { Authorization: 'Bearer key' })
 * @returns {Promise<{ status: number, body: object|string }>}
 */
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, val) => { if (!done) { done = true; fn(val); } };

    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'Accept': 'application/json', ...headers },
      },
      (res) => {
        let d = '';
        let bytesRead = 0;
        res.on('data', (c) => {
          bytesRead += c.length;
          if (bytesRead > MAX_BODY_BYTES) {
            finish(reject, new Error(`ACN response exceeds ${MAX_BODY_BYTES / 1024 / 1024} MB limit`));
            res.destroy();
            return;
          }
          d += c;
        });
        res.on('end', () => {
          try { finish(resolve, { status: res.statusCode, body: JSON.parse(d) }); }
          catch { finish(resolve, { status: res.statusCode, body: d }); }
        });
        res.on('error', (e) => finish(reject, e));
      }
    );
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`ACN request timed out after ${TIMEOUT_MS / 1000}s`));
    });
    req.on('error', (e) => finish(reject, e));
    req.end();
  });
}

/**
 * Make an HTTP POST request with a JSON body.
 *
 * @param {string} url
 * @param {object} body
 * @param {object} [headers] - Additional headers (e.g. { Authorization: 'Bearer key' })
 * @returns {Promise<{ status: number, body: object|string }>}
 */
function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, val) => { if (!done) { done = true; fn(val); } };

    const data = JSON.stringify(body);
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let d = '';
        let bytesRead = 0;
        res.on('data', (c) => {
          bytesRead += c.length;
          if (bytesRead > MAX_BODY_BYTES) {
            finish(reject, new Error(`ACN response exceeds ${MAX_BODY_BYTES / 1024 / 1024} MB limit`));
            res.destroy();
            return;
          }
          d += c;
        });
        res.on('end', () => {
          try { finish(resolve, { status: res.statusCode, body: JSON.parse(d) }); }
          catch { finish(resolve, { status: res.statusCode, body: d }); }
        });
        res.on('error', (e) => finish(reject, e));
      }
    );
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`ACN request timed out after ${TIMEOUT_MS / 1000}s`));
    });
    req.on('error', (e) => finish(reject, e));
    req.write(data);
    req.end();
  });
}

/**
 * Make an HTTP DELETE request.
 *
 * @param {string} url
 * @param {object} [headers] - Additional headers (e.g. { Authorization: 'Bearer key' })
 * @returns {Promise<{ status: number, body: object|string }>}
 */
function del(url, headers = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, val) => { if (!done) { done = true; fn(val); } };

    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'DELETE',
        headers: { 'Accept': 'application/json', 'User-Agent': 'OpenPersona-Social/1.0', ...headers },
      },
      (res) => {
        let d = '';
        let bytesRead = 0;
        res.on('data', (c) => {
          bytesRead += c.length;
          if (bytesRead > MAX_BODY_BYTES) {
            finish(reject, new Error(`ACN response exceeds ${MAX_BODY_BYTES / 1024 / 1024} MB limit`));
            res.destroy();
            return;
          }
          d += c;
        });
        res.on('end', () => {
          try { finish(resolve, { status: res.statusCode, body: JSON.parse(d) }); }
          catch { finish(resolve, { status: res.statusCode, body: d }); }
        });
        res.on('error', (e) => finish(reject, e));
      }
    );
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`ACN request timed out after ${TIMEOUT_MS / 1000}s`));
    });
    req.on('error', (e) => finish(reject, e));
    req.end();
  });
}

module.exports = { get, post, del };
