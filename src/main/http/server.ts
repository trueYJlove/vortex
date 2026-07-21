/**		      	    				  	  	  	 		 		       	 	 	         	 	    					 
 * HTTP Server - Remote access server for Halo
 * Exposes REST API and serves the frontend for remote access
 */

import express, { Express, Request, Response, Router, NextFunction } from 'express'
import { createServer, Server, request as httpRequest, IncomingMessage } from 'http'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createConnection, createServer as createNetServer } from 'net'

import {
  authMiddleware,
  generateAccessToken,
  getAccessToken,
  clearAccessToken,
  restoreAccessToken,
  handleLogin,
  CredentialRestoreError,
} from './auth'
import { initWebSocket, shutdownWebSocket, getClientCount } from './websocket'
import { registerApiRoutes } from './routes'
import { getMainWindow as getMainWindowFromService } from '../foundation/window.service'

// Vite dev server URL
const VITE_DEV_SERVER = 'http://localhost:5173'
const VITE_DEV_HOST = 'localhost'
const VITE_DEV_PORT = 5173

// Server state
let httpServer: Server | null = null
let expressApp: Express | null = null
let serverPort: number = 0

// Default port
const DEFAULT_PORT = 3847
const MAX_PORT_SEARCH_ATTEMPTS = 20

// ---------------------------------------------------------------------------
// Webhook ingress
// ---------------------------------------------------------------------------

// Mount point and body limit. The limit must match the contract expected by
// apps/runtime WebhookSource (MAX_BODY_BYTES = 256KB).
const WEBHOOK_INGRESS_PATH = '/hooks'
const WEBHOOK_INGRESS_BODY_LIMIT = '256kb'

// The ingress router is a process-lifetime singleton, NOT tied to a server
// instance: apps/runtime initializes (and mounts WebhookSource routes) before
// the HTTP server first starts, and the server may be stopped/restarted with
// a fresh Express app at any time. Each startHttpServer() re-attaches this
// same router, so routes registered on it survive server restarts.
let webhookIngressRouter: Router | null = null

/**
 * Get the webhook ingress router (mounted at /hooks ahead of auth and
 * frontend fallbacks whenever the HTTP server runs). apps/runtime
 * WebhookSource registers its routes here; safe to call before the server
 * has ever started.
 */
export function getWebhookIngressRouter(): Router {
  if (!webhookIngressRouter) {
    webhookIngressRouter = express.Router()
  }
  return webhookIngressRouter
}

/**
 * Mount the webhook ingress on a freshly created Express app, ahead of every
 * other middleware, so external callers (GitHub, Stripe, ...) are never
 * intercepted by the global JSON body limit, auth middleware, or frontend
 * fallbacks. Authentication is per-hook HMAC inside WebhookSource.
 *
 * Chain: content-type guard -> dedicated JSON parser (webhook body limit +
 * raw bytes for HMAC -- re-serialized JSON is not byte-identical) -> ingress
 * router -> 404 terminal (no route consumed the request, e.g. automation
 * runtime inactive) -> JSON error handler (body-parser errors such as 413
 * must never leak an HTML stack trace to external callers).
 */
function attachWebhookIngress(app: Express): void {
  app.use(WEBHOOK_INGRESS_PATH, (req: Request, res: Response, next: NextFunction) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Webhook payloads must be application/json' })
      return
    }
    next()
  })
  app.use(
    WEBHOOK_INGRESS_PATH,
    express.json({
      limit: WEBHOOK_INGRESS_BODY_LIMIT,
      verify: (req, _res, buf) => {
        ;(req as Request & { rawBody?: Buffer }).rawBody = buf
      }
    }),
    getWebhookIngressRouter()
  )
  app.use(WEBHOOK_INGRESS_PATH, (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Webhook ingress not available' })
  })
  app.use(WEBHOOK_INGRESS_PATH, (err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    console.warn(`[HTTP] Webhook ingress request rejected: ${err.message}`)
    res.status(err.status ?? 400).json({ error: 'Invalid webhook request' })
  })
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createNetServer()
    tester.once('error', () => {
      tester.close(() => resolve(false))
    })
    tester.once('listening', () => {
      tester.close(() => resolve(true))
    })
    tester.listen(port, '0.0.0.0')
  })
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let i = 0; i < MAX_PORT_SEARCH_ATTEMPTS; i++) {
    const portToTry = startPort + i
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(portToTry)
    if (available) {
      if (i > 0) {
        console.warn(`[HTTP] Port ${startPort} is in use, falling back to ${portToTry}`)
      }
      return portToTry
    }
  }
  throw new Error(`Unable to find available port near ${startPort}`)
}

function cleanupServerOnError(): void {
  shutdownWebSocket()
  if (httpServer) {
    try {
      httpServer.removeAllListeners('error')
      httpServer.close()
    } catch (err) {
      console.warn('[HTTP] Error closing server after failure:', (err as Error).message)
    }
    httpServer = null
  }
  expressApp = null
  serverPort = 0
  clearAccessToken()
}

/**
 * Start the HTTP server
 *
 * @param port            Preferred port. Falls back to the next available one
 *                        if it is occupied.
 * @param existingToken   Previously persisted access token. When provided and
 *                        non-empty, the server restores it instead of
 *                        generating a fresh one. Callers (remote.service)
 *                        are responsible for persisting newly generated
 *                        tokens to config.
 */
export async function startHttpServer(
  port: number = DEFAULT_PORT,
  existingToken?: string
): Promise<{ port: number; token: string }> {
  const listenPort = await findAvailablePort(port)

  // Create Express app
  expressApp = express()

  attachWebhookIngress(expressApp)

  // Middleware
  expressApp.use(express.json())
  expressApp.use(express.urlencoded({ extended: true }))

  // CORS for remote access
  expressApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }
    next()
  })

  // Login endpoint (before auth middleware). Owns rate-limit + lockout
  // + audit + alert via the auth module.
  expressApp.post('/api/remote/login', handleLogin)

  // Status endpoint (public)
  expressApp.get('/api/remote/status', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        active: true,
        clients: getClientCount(),
        version: '1.0.0'
      }
    })
  })

  // Auth middleware for API routes
  expressApp.use('/api', authMiddleware)

  // Register API routes
  registerApiRoutes(expressApp)

  // Serve static files (frontend)
  if (is.dev) {
    // In development, proxy to Vite dev server
    expressApp.use('/{*path}', (req, res) => {
      // Check if authenticated (has valid token in query or localStorage check via cookie)
      const urlToken = req.query.token as string
      const authHeader = req.headers.authorization
      const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader

      // If accessing root without auth, show login page
      if (req.path === '/' && !urlToken && !headerToken) {
        // Check cookie for token
        const cookies = req.headers.cookie || ''
        const hasToken = cookies.includes('vortex_authenticated=true')
        if (!hasToken) {
          return res.send(getRemoteLoginPage())
        }
      }

      // Proxy to Vite dev server
      const viteUrl = new URL(req.originalUrl, VITE_DEV_SERVER)

      const proxyReq = httpRequest(viteUrl, {
        method: req.method,
        headers: {
          ...req.headers,
          host: new URL(VITE_DEV_SERVER).host
        }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
        proxyRes.pipe(res)
      })

      proxyReq.on('error', (err) => {
        console.error('[HTTP] Proxy error:', err)
        res.status(502).send('Vite dev server not available')
      })

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        req.pipe(proxyReq)
      } else {
        proxyReq.end()
      }
    })
  } else {
    // In production, serve built files
    const staticPath = join(__dirname, '../renderer')

    // Authentication check middleware for production
    expressApp.use((req, res, next) => {
      // Skip for API routes (handled by authMiddleware)
      if (req.path.startsWith('/api')) {
        return next()
      }

      // Skip for static assets
      if (
        req.path.startsWith('/assets') ||
        req.path.endsWith('.js') ||
        req.path.endsWith('.css') ||
        req.path.endsWith('.svg') ||
        req.path.endsWith('.png') ||
        req.path.endsWith('.ico') ||
        req.path.endsWith('.woff') ||
        req.path.endsWith('.woff2')
      ) {
        return next()
      }

      // Check if authenticated via cookie
      const cookies = req.headers.cookie || ''
      const hasToken = cookies.includes('vortex_authenticated=true')

      // If not authenticated, show login page
      if (!hasToken) {
        return res.send(getRemoteLoginPage())
      }

      next()
    })

    expressApp.use(express.static(staticPath))

    // SPA fallback - Express 5.x requires named wildcard parameters
    expressApp.get('/{*path}', (req, res) => {
      // Auth already checked by middleware above
      res.sendFile(join(staticPath, 'index.html'))
    })
  }

  // Create HTTP server
  httpServer = createServer(expressApp)

  // Initialize WebSocket (for Halo communication on /ws path)
  initWebSocket(httpServer)

  // In dev mode, proxy Vite HMR WebSocket connections
  if (is.dev) {
    httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`)

      // Don't intercept Halo's WebSocket connections
      if (url.pathname === '/ws') {
        // Let the wss server handle it (already done by initWebSocket)
        return
      }

      // Proxy other WebSocket connections to Vite dev server
      console.log(`[HTTP] Proxying WebSocket upgrade: ${url.pathname}`)

      const viteSocket = createConnection(VITE_DEV_PORT, VITE_DEV_HOST, () => {
        // Forward the upgrade request to Vite
        const upgradeRequest = [
          `GET ${req.url} HTTP/1.1`,
          `Host: ${VITE_DEV_HOST}:${VITE_DEV_PORT}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
          `Sec-WebSocket-Version: ${req.headers['sec-websocket-version']}`,
          '',
          ''
        ].join('\r\n')

        viteSocket.write(upgradeRequest)
        viteSocket.write(head)

        // Pipe data between client and Vite
        socket.pipe(viteSocket)
        viteSocket.pipe(socket)
      })

      viteSocket.on('error', (err) => {
        console.error('[HTTP] Vite WebSocket proxy error:', err.message)
        socket.end()
      })

      socket.on('error', (err) => {
        console.error('[HTTP] Client WebSocket error:', err.message)
        viteSocket.end()
      })
    })
  }

  // Restore previously persisted token when available; otherwise generate a
  // fresh PIN. Persistence of newly generated tokens is owned by the caller
  // (remote.service.ts) to keep this layer free of config concerns. The
  // raw stored value may be encoded (gmcred:v1:...) when
  // `credentialAtRestSafe` is on; restoreAccessToken decodes internally and
  // exposes the plaintext via getAccessToken so the UI keeps working.
  //
  // Fail-loud on restore failure: when an existing credential is present
  // but cannot be decoded (corrupted ciphertext, key derivation drift,
  // profile migration), we refuse to start instead of silently rotating
  // the PIN. Silent rotation would invalidate every previously paired
  // device without telling the user; the caller (remote.service) catches
  // this error, disables remote access in config, and surfaces a code so
  // the UI can prompt for a manual re-pair.
  let token: string
  if (existingToken && existingToken.length >= 4) {
    const restored = restoreAccessToken(existingToken)
    if (!restored.ok) {
      cleanupServerOnError()
      throw new CredentialRestoreError()
    }
    token = getAccessToken() as string
  } else {
    token = generateAccessToken()
  }

  // Start listening
  return new Promise((resolve, reject) => {
    httpServer!.listen(listenPort, '0.0.0.0', () => {
      serverPort = listenPort
      console.log(`[HTTP] Server started on port ${listenPort}`)
      console.log(`[HTTP] Access token: ${token}`)
      resolve({ port: listenPort, token })
    })

    httpServer!.on('error', (error: NodeJS.ErrnoException) => {
      console.error('[HTTP] Server error:', error.message)
      cleanupServerOnError()
      if (error.code === 'EADDRINUSE') {
        const nextPort = listenPort + 1
        console.log(`[HTTP] Port ${listenPort} still in use, trying ${nextPort}`)
        startHttpServer(nextPort, existingToken).then(resolve).catch(reject)
      } else {
        reject(error)
      }
    })
  })
}

/**
 * Stop the HTTP server
 */
export function stopHttpServer(): void {
  if (httpServer) {
    shutdownWebSocket()
    httpServer.close()
    httpServer = null
    expressApp = null
    serverPort = 0
    clearAccessToken()
    console.log('[HTTP] Server stopped')
  }
}

/**
 * Check if server is running
 */
export function isServerRunning(): boolean {
  return httpServer !== null
}

/**
 * Get server info
 */
export function getServerInfo(): {
  running: boolean
  port: number
  token: string | null
  clients: number
} {
  return {
    running: isServerRunning(),
    port: serverPort,
    token: getAccessToken(),
    clients: getClientCount()
  }
}

/**
 * Get main window reference (for agent controller)
 */
export function getMainWindow(): BrowserWindow | null {
  return getMainWindowFromService()
}

/**
 * Simple login page HTML for remote access
 */
function getRemoteLoginPage(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Vortex Remote Access</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow-x: hidden;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      padding: 0;
    }
    .container {
      text-align: center;
      padding: 2rem 1.5rem;
      width: 100%;
      max-width: 400px;
      min-width: 0;
    }
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      margin: 0 auto 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.8rem;
      box-shadow: 0 0 30px rgba(139, 92, 246, 0.4);
    }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; word-break: break-word; }
    .subtitle { color: #888; margin-bottom: 2rem; font-size: 0.85rem; }
    .input-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
    }
    input {
      width: 100%;
      padding: 0.9rem;
      border: 1px solid #333;
      border-radius: 12px;
      background: rgba(255,255,255,0.05);
      color: #fff;
      font-size: 1.25rem;
      text-align: center;
      letter-spacing: 0.4em;
    }
    input:focus { outline: none; border-color: #8b5cf6; }
    button {
      width: 100%;
      padding: 0.9rem 1.5rem;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: #fff;
      font-size: 0.95rem;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:active { opacity: 0.8; }
    .error { color: #ff6b6b; margin-top: 1rem; font-size: 0.85rem; }
    .success { color: #4ade80; }
    @media (max-width: 480px) {
      body { padding: 1rem; align-items: flex-start; padding-top: 20vh; }
      .container { padding: 1.5rem 1rem; max-width: 100%; }
      .logo { width: 56px; height: 56px; font-size: 1.4rem; margin-bottom: 1rem; }
      h1 { font-size: 1.15rem; }
      .subtitle { font-size: 0.75rem; margin-bottom: 1.5rem; }
      input { padding: 0.8rem; font-size: 1.1rem; letter-spacing: 0.3em; }
      button { padding: 0.8rem; font-size: 0.9rem; }
    }
    /* iOS safe area and standalone mode */
    @media all and (display-mode: standalone) {
      body { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">&#x25CB;</div>
    <h1>Vortex Remote Access</h1>
    <p class="subtitle">Enter access code to connect to your desktop</p>
    <div class="input-group">
      <input type="password" id="token" maxlength="64" placeholder="Access Code" autocomplete="off">
      <button onclick="login()">Connect</button>
    </div>
    <p id="error" class="error"></p>
  </div>
  <script>
    async function login() {
      const token = document.getElementById('token').value;
      const error = document.getElementById('error');

      if (!token || token.length < 6) {
        error.textContent = 'Please enter access code';
        return;
      }

      try {
        const res = await fetch('/api/remote/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        if (res.ok) {
          localStorage.setItem('vortex_remote_token', token);
          // Set cookie for server-side auth check
          document.cookie = 'vortex_authenticated=true; path=/';
          error.textContent = '';
          error.classList.remove('error');
          error.classList.add('success');
          error.textContent = 'Connected! Loading...';

          // Reload to get the full app (will be proxied to Vite)
          setTimeout(() => location.reload(), 500);
        } else {
          error.textContent = 'Invalid code';
        }
      } catch (e) {
        error.textContent = 'Connection failed';
      }
    }

    // Auto-focus input
    document.getElementById('token').focus();

    // Enter key to submit
    document.getElementById('token').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') login();
    });
  </script>
</body>
</html>
  `
}
