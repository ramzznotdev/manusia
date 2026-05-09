require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Import route files
const orderkouta = require('./orderkouta');
const pakasir = require('./pakasir');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// FOLDER DATA (buat sessions.json)
// =============================================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// =============================================
// STATIC FILES (Frontend HTML, CSS)
// =============================================
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

// =============================================
// API KEY MIDDLEWARE
// =============================================
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      status: false,
      message: 'API Key wajib disertakan. Gunakan header x-api-key atau parameter ?api_key=',
      code: 401
    });
  }

  if (apiKey !== process.env.RAMZZPAY_API_KEY) {
    return res.status(403).json({
      status: false,
      message: 'API Key tidak valid',
      code: 403
    });
  }

  next();
};

// =============================================
// ROUTES
// =============================================

// API Routes
app.use('/api/orderkouta', authMiddleware, orderkouta);
app.use('/api/pakasir', authMiddleware, pakasir);

// Land

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: true,
    message: 'RAMZZPAY API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    developer: 'RAMZZGANTENGBANGET'
  });
});

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dokumentasi
app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

// =============================================
// 404 HANDLER
// =============================================
app.use((req, res, next) => {
  // Kalau requestnya API, return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      status: false,
      message: `Endpoint ${req.method} ${req.path} tidak ditemukan`,
      code: 404
    });
  }

  // Kalau requestnya halaman web, return HTML 404
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>404 - RAMZZPAY</title>
      <style>
        body {
          font-family: system-ui, sans-serif;
          background: #0a0a0f;
          color: #e2e8f0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          text-align: center;
        }
        h1 { font-size: 80px; margin: 0; background: linear-gradient(135deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        a { color: #60a5fa; }
      </style>
    </head>
    <body>
      <div>
        <h1>404</h1>
        <p>Halaman ga ketemu, bree.</p>
        <p><a href="/">← Balik ke Beranda</a></p>
      </div>
    </body>
    </html>
  `);
});

// =============================================
// ERROR HANDLER (GLOBAL)
// =============================================
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err);

  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      status: false,
      message: 'Internal server error: ' + err.message,
      code: 500
    });
  }

  res.status(500).send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>500 - RAMZZPAY</title>
      <style>
        body {
          font-family: system-ui, sans-serif;
          background: #0a0a0f;
          color: #e2e8f0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          text-align: center;
        }
        h1 { color: #ef4444; font-size: 60px; }
        a { color: #60a5fa; }
      </style>
    </head>
    <body>
      <div>
        <h1>500</h1>
        <p>Server error, coba lagi nanti.</p>
        <p><a href="/">← Balik ke Beranda</a></p>
      </div>
    </body>
    </html>
  `);
});

// =============================================
// START SERVER
// =============================================
// Cek environment
const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  // Running di local / VPS
  app.listen(PORT, () => {
    console.log('╔══════════════════════════════════════╗');
    console.log('║        ⚡ RAMZZPAY API v1.0.0        ║');
    console.log('║       by RAMZZGANTENGBANGET         ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  Server  : http://localhost:${PORT}     ║`);
    console.log(`║  Docs    : http://localhost:${PORT}/docs ║`);
    console.log(`║  Health  : http://localhost:${PORT}/api/health ║`);
    console.log('╚══════════════════════════════════════╝');
  });
} else {
  console.log('RAMZZPAY running on Vercel');
}

// Export buat Vercel serverless
module.exports = app;