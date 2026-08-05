import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env, text, number, publicError } from './core.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function browserCandidates() {
  return [
    env('CHROMIUM_PATH'),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].map(text).filter(Boolean);
}

async function executablePath() {
  const { access } = await import('node:fs/promises');
  for (const candidate of browserCandidates()) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('Chromium is not installed. Deploy this build with the included Dockerfile/Render Blueprint.');
}

function randomPort() {
  return 9300 + Math.floor(Math.random() * 500);
}

async function fetchJson(url, options = {}, attempts = 1) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      await sleep(150);
    }
  }
  throw last;
}

class CdpSocket {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect(timeoutMs = 10000) {
    if (typeof WebSocket !== 'function') throw new Error('Node.js 22 or newer is required for the Chromium collector');
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error('Chromium DevTools connection timed out')), timeoutMs);
      socket.addEventListener('open', () => { clearTimeout(timer); this.socket = socket; resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Chromium DevTools connection failed')); }, { once: true });
      socket.addEventListener('message', event => this.#message(event.data));
      socket.addEventListener('close', () => this.#close());
    });
  }

  #message(raw) {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (message.id) {
      const row = this.pending.get(message.id);
      if (!row) return;
      this.pending.delete(message.id);
      clearTimeout(row.timer);
      if (message.error) row.reject(new Error(message.error.message || 'Chromium command failed'));
      else row.resolve(message.result || {});
      return;
    }
    if (message.method) {
      for (const listener of this.listeners.get(message.method) || []) {
        try { listener(message.params || {}); } catch {}
      }
    }
  }

  #close() {
    for (const row of this.pending.values()) {
      clearTimeout(row.timer);
      row.reject(new Error('Chromium DevTools connection closed'));
    }
    this.pending.clear();
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
    return () => this.listeners.get(method)?.delete(listener);
  }

  once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const off = this.on(method, value => { clearTimeout(timer); off(); resolve(value); });
      const timer = setTimeout(() => { off(); reject(new Error(`${method} timed out`)); }, timeoutMs);
    });
  }

  send(method, params = {}, timeoutMs = 15000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Chromium DevTools is not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

export class ChromiumSession {
  constructor(options = {}) {
    this.options = options;
    this.process = null;
    this.profileDir = null;
    this.port = null;
    this.cdp = null;
    this.network = [];
    this.networkSeen = new Set();
    this.startedAt = null;
    this.stderr = [];
  }

  async start() {
    this.startedAt = new Date().toISOString();
    this.profileDir = await mkdtemp(join(tmpdir(), 'sporty-browser-'));
    this.port = randomPort();
    const chrome = await executablePath();
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      '--lang=en-GB',
      '--window-size=1440,1800',
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.profileDir}`,
      'about:blank',
    ];
    this.process = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    this.process.stderr.on('data', chunk => {
      const lines = String(chunk).split(/\r?\n/).map(text).filter(Boolean);
      this.stderr.push(...lines.slice(-8));
      if (this.stderr.length > 40) this.stderr.splice(0, this.stderr.length - 40);
    });
    this.process.once('exit', code => {
      if (code && !this.cdp) this.stderr.push(`Chromium exited before connection with code ${code}`);
    });

    const deadline = Date.now() + 15000;
    let version;
    while (Date.now() < deadline) {
      try { version = await fetchJson(`http://127.0.0.1:${this.port}/json/version`, {}, 1); break; } catch { await sleep(150); }
    }
    if (!version?.webSocketDebuggerUrl) throw new Error(`Chromium did not start: ${this.stderr.slice(-3).join(' | ') || 'no diagnostics'}`);

    const target = await fetchJson(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' }, 5);
    this.cdp = new CdpSocket(target.webSocketDebuggerUrl);
    await this.cdp.connect();
    await Promise.all([
      this.cdp.send('Page.enable'),
      this.cdp.send('Runtime.enable'),
      this.cdp.send('Network.enable', { maxTotalBufferSize: 80_000_000, maxResourceBufferSize: 8_000_000 }),
      this.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1800, deviceScaleFactor: 1, mobile: false }),
      this.cdp.send('Network.setUserAgentOverride', {
        userAgent: env('SPORTYBET_BROWSER_USER_AGENT', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'),
        acceptLanguage: 'en-GB,en;q=0.9',
        platform: 'Windows',
      }),
    ]);
    this.#captureNetwork();
    return this;
  }

  #captureNetwork() {
    const requests = new Map();
    const requestMeta = new Map();
    this.cdp.on('Network.requestWillBeSent', params => {
      const request = params.request || {};
      const url = text(request.url);
      if (!url) return;
      let requestKeys = [];
      const rawBody = text(request.postData);
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) requestKeys = Object.keys(parsed).slice(0, 24);
        } catch {
          try { requestKeys = [...new URLSearchParams(rawBody).keys()].slice(0, 24); } catch {}
        }
      }
      requestMeta.set(params.requestId, {
        method: text(request.method) || 'GET',
        requestKeys: [...new Set(requestKeys.map(text).filter(Boolean))],
      });
    });
    this.cdp.on('Network.responseReceived', params => {
      const response = params.response || {};
      const url = text(response.url);
      if (!url) return;
      requests.set(params.requestId, {
        requestId: params.requestId,
        url,
        status: response.status || null,
        mimeType: text(response.mimeType),
        type: text(params.type),
        headers: response.headers || {},
        ...(requestMeta.get(params.requestId) || { method:'GET', requestKeys:[] }),
      });
    });
    this.cdp.on('Network.loadingFinished', async params => {
      const row = requests.get(params.requestId);
      if (!row || this.networkSeen.has(params.requestId)) return;
      this.networkSeen.add(params.requestId);
      if (!/(sportybet\.com|127\.0\.0\.1|localhost)/i.test(row.url)) return;
      if (!/(xhr|fetch|document|script)/i.test(row.type)) return;
      try {
        const result = await this.cdp.send('Network.getResponseBody', { requestId: params.requestId }, 5000);
        let body = text(result.body);
        if (result.base64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
        if (Buffer.byteLength(body) > 6_000_000) body = body.slice(0, 6_000_000);
        this.network.push({ ...row, body });
        if (this.network.length > 180) this.network.splice(0, this.network.length - 180);
      } catch {}
    });
  }


  async setExtraHeaders(headers = {}) {
    const clean = {};
    for (const [key, value] of Object.entries(headers)) if (text(value)) clean[key] = text(value);
    await this.cdp.send('Network.setExtraHTTPHeaders', { headers: clean });
  }

  async setCookie({ name, value, url, domain, path = '/' }) {
    const params = { name:text(name), value:text(value), path };
    if (url) params.url = text(url);
    if (domain) params.domain = text(domain);
    return this.cdp.send('Network.setCookie', params);
  }

  async navigate(url, { waitMs = 7000, timeoutMs = 30000 } = {}) {
    const load = this.cdp.once('Page.loadEventFired', timeoutMs).catch(() => null);
    const result = await this.cdp.send('Page.navigate', { url }, timeoutMs);
    if (result.errorText) throw new Error(`Page navigation failed: ${result.errorText}`);
    await load;
    if (waitMs > 0) await sleep(waitMs);
    return this.currentUrl();
  }

  async currentUrl() {
    const value = await this.evaluate('location.href');
    return text(value);
  }

  async evaluate(expression, { awaitPromise = true, returnByValue = true, timeoutMs = 15000 } = {}) {
    const result = await this.cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue,
      userGesture: true,
    }, timeoutMs);
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed';
      throw new Error(description);
    }
    return result.result?.value;
  }

  async scroll({ steps = 5, delayMs = 700 } = {}) {
    for (let i = 0; i < steps; i += 1) {
      await this.evaluate(`window.scrollTo({top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), behavior: 'instant'}); true`);
      await sleep(delayMs);
    }
  }

  networkSince(index = 0) {
    return this.network.slice(index);
  }

  networkIndex() {
    return this.network.length;
  }

  async screenshot(label = 'page') {
    const enabled = /^(1|true|yes|on)$/i.test(env('SPORTYBET_COLLECTOR_SCREENSHOTS', 'false'));
    if (!enabled) return null;
    try {
      const result = await this.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 15000);
      const path = join(tmpdir(), `sporty-${label.replace(/[^a-z0-9_-]/gi, '-')}-${Date.now()}.png`);
      await writeFile(path, Buffer.from(result.data, 'base64'));
      return path;
    } catch { return null; }
  }

  diagnostics() {
    const noisy = /(DBus|PHONE_REGISTRATION_ERROR|google_apis\/gcm|TensorFlow Lite|XNNPACK|freedesktop)/i;
    const warnings = this.stderr.filter(line => !noisy.test(line));
    return {
      chromium_started_at: this.startedAt,
      captured_responses: this.network.length,
      stderr_tail: warnings.slice(-5).map(line => line.slice(0, 240)),
      ignored_runtime_noise: this.stderr.length - warnings.length,
    };
  }

  async close() {
    try { this.cdp?.close(); } catch {}
    try { this.process?.kill('SIGTERM'); } catch {}
    await sleep(150);
    try { this.process?.kill('SIGKILL'); } catch {}
    if (this.profileDir) await rm(this.profileDir, { recursive: true, force: true }).catch(() => null);
  }
}

export async function withChromium(task, options = {}) {
  const session = new ChromiumSession(options);
  try {
    await session.start();
    return await task(session);
  } catch (error) {
    const suffix = session.stderr.length ? ` (${session.stderr.slice(-2).join(' | ')})` : '';
    throw new Error(`${publicError(error)}${suffix}`);
  } finally {
    await session.close();
  }
}
