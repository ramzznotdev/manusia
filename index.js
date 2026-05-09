require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

// Import route files
const orderkouta = require('./orderkouta');
const pakasir = require('./pakasir');

const app = express();

// =============================================
// SIMPEL STORAGE: Pake memory cache buat Vercel
// =============================================
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Memory store (buat Vercel yang gak support fs)
const memoryStore = {
  sessions: {},
  qrisCache: {}
};

// Export memory store biar bisa dipake route lain
app.set('memoryStore', memoryStore);
app.set('isVercel', isVercel);

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// =============================================
// STATIC FILES (cuma jalan di local)
// =============================================
if (!isVercel) {
  app.use(express.static(path.join(__dirname, 'public')));
}

// =============================================
// API KEY MIDDLEWARE
// =============================================
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      status: false,
      message: 'API Key wajib. Gunakan header x-api-key',
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
// API ROUTES
// =============================================
app.use('/api/orderkouta', authMiddleware, orderkouta);
app.use('/api/pakasir', authMiddleware, pakasir);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: true,
    message: 'RAMZZPAY API running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: isVercel ? 'vercel' : 'local'
  });
});

// =============================================
// LANDING PAGE (untuk Vercel, render inline)
// =============================================
app.get('/', (req, res) => {
  // Kalo di Vercel, render HTML inline karena static file kadang error
  if (isVercel) {
    return res.send(getLandingPageHTML());
  }
  // Kalo di local, pake static file
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/docs', (req, res) => {
  if (isVercel) {
    return res.send(getDocsPageHTML());
  }
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

// =============================================
// 404 HANDLER
// =============================================
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      status: false,
      message: `Endpoint ${req.method} ${req.path} tidak ditemukan`,
      code: 404
    });
  }

  res.status(404).send(`
    <html>
    <head><title>404 - RAMZZPAY</title>
    <style>body{font-family:sans-serif;background:#0a0a0f;color:#e2e8f0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;text-align:center}h1{font-size:80px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}a{color:#60a5fa}</style>
    </head>
    <body><div><h1>404</h1><p>Halaman ga ketemu.</p><p><a href="/">← Balik</a></p></div></body></html>`);
});

// =============================================
// ERROR HANDLER
// =============================================
app.use((err, req, res, next) => {
  console.error('ERROR:', err.message);

  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      status: false,
      message: 'Internal error: ' + err.message,
      code: 500
    });
  }

  res.status(500).send(`
    <html>
    <head><title>500 - RAMZZPAY</title>
    <style>body{font-family:sans-serif;background:#0a0a0f;color:#e2e8f0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;text-align:center}h1{color:#ef4444;font-size:60px}a{color:#60a5fa}</style>
    </head>
    <body><div><h1>500</h1><p>Server error.</p><p><a href="/">← Balik</a></p></div></body></html>`);
});

// =============================================
// START SERVER (cuma di local)
// =============================================
if (!isVercel) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`RAMZZPAY running on http://localhost:${PORT}`);
    console.log(`Docs: http://localhost:${PORT}/docs`);
  });
}

// Export buat Vercel
module.exports = app;

// =============================================
// INLINE HTML BUAT VERCEL
// =============================================

function getLandingPageHTML() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RAMZZPAY — Payment Gateway API</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e2e8f0;line-height:1.6}
    .container{max-width:1000px;margin:0 auto;padding:20px}
    header{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid #1e293b;margin-bottom:40px}
    .logo{font-size:22px;font-weight:900}
    .logo .hl{background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    nav a{color:#94a3b8;text-decoration:none;margin-left:20px}
    nav a:hover{color:#fff}
    .hero{padding:40px 0;text-align:center}
    .badge{display:inline-block;background:rgba(59,130,246,.1);color:#60a5fa;padding:6px 14px;border-radius:20px;font-size:12px;margin-bottom:16px}
    .hero h1{font-size:36px;margin-bottom:12px}
    .gr{background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .hero p{color:#94a3b8;max-width:600px;margin:0 auto 24px}
    .btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:0 6px}
    .btn-p{background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff}
    .btn-o{border:1px solid #3b82f6;color:#3b82f6}
    .stats{display:flex;justify-content:center;gap:32px;margin-top:32px}
    .stat-val{font-size:24px;font-weight:900;background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:block}
    .stat-lbl{font-size:12px;color:#64748b}
    .features{padding:40px 0}
    .features h2{text-align:center;margin-bottom:24px}
    .fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
    .fcard{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155}
    .fcard h3{font-size:16px;margin-bottom:8px}
    .fcard p{color:#94a3b8;font-size:14px}
    .endpoints{padding:40px 0}
    .endpoints h2{text-align:center;margin-bottom:24px}
    .egroup{background:#1e293b;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid #334155}
    .eitem{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0f172a;border-radius:6px;margin-bottom:6px}
    .method{padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700}
    .post{background:rgba(16,185,129,.2);color:#10b981}
    .get{background:rgba(59,130,246,.2);color:#3b82f6}
    .path{font-family:monospace;font-size:13px}
    .desc{color:#64748b;margin-left:auto;font-size:12px}
    .cta{text-align:center;padding:40px;background:#1e293b;border-radius:12px;margin:30px 0}
    footer{text-align:center;padding:20px;border-top:1px solid #1e293b;color:#64748b;margin-top:30px}
    footer a{color:#60a5fa;text-decoration:none}
    @media(max-width:600px){.hero h1{font-size:24px}.stats{flex-direction:column;gap:16px}.eitem{flex-direction:column;align-items:flex-start}}
  </style>
</head>
<body>
<div class="container">
<header>
  <div class="logo">⚡ RAMZZ<span class="hl">PAY</span></div>
  <nav>
    <a href="/docs">Dokumentasi</a>
    <a href="/api/health">API</a>
  </nav>
</header>

<section class="hero">
  <div class="badge">v1.0.0 • Production Ready</div>
  <h1>Payment Gateway API<br><span class="gr">Tanpa Ribet. Tanpa Biaya.</span></h1>
  <p>Integrasi OrderKouta & Pakasir dalam satu API. Untuk reseller, developer, dan pebisnis yang butuh solusi pembayaran QRIS cepat.</p>
  <div>
    <a href="/docs" class="btn btn-p">Mulai Sekarang →</a>
    <a href="#endpoints" class="btn btn-o">Lihat Endpoint</a>
  </div>
  <div class="stats">
    <div><span class="stat-val">2</span><span class="stat-lbl">Platform</span></div>
    <div><span class="stat-val">7+</span><span class="stat-lbl">Endpoint</span></div>
    <div><span class="stat-val"><100ms</span><span class="stat-lbl">Response</span></div>
  </div>
</section>

<section class="features">
  <h2>Kenapa RAMZZPAY?</h2>
  <div class="fgrid">
    <div class="fcard"><h3>🔄 Auto Sync Mutasi</h3><p>Pantau pembayaran QRIS real-time tanpa buka aplikasi manual.</p></div>
    <div class="fcard"><h3>⚡ QRIS Dinamis</h3><p>Generate QR code dengan nominal custom otomatis.</p></div>
    <div class="fcard"><h3>🛡️ Rate Limiting</h3><p>Keamanan built-in. Ga perlu takut spam.</p></div>
    <div class="fcard"><h3>📦 Serverless Ready</h3><p>Deploy ke Vercel gratis. Ga perlu server mahal.</p></div>
  </div>
</section>

<section id="endpoints" class="endpoints">
  <h2>Endpoint Tersedia</h2>
  <div class="egroup">
    <h3>📱 OrderKouta</h3>
    <div class="eitem"><span class="method post">POST</span><span class="path">/api/orderkouta/get-otp</span><span class="desc">Request OTP</span></div>
    <div class="eitem"><span class="method post">POST</span><span class="path">/api/orderkouta/verify-otp</span><span class="desc">Verifikasi OTP</span></div>
    <div class="eitem"><span class="method get">GET</span><span class="path">/api/orderkouta/mutasi</span><span class="desc">Riwayat mutasi</span></div>
    <div class="eitem"><span class="method get">GET</span><span class="path">/api/orderkouta/profile</span><span class="desc">Info akun</span></div>
    <div class="eitem"><span class="method post">POST</span><span class="path">/api/orderkouta/logout</span><span class="desc">Logout</span></div>
  </div>
  <div class="egroup">
    <h3>💳 Pakasir</h3>
    <div class="eitem"><span class="method post">POST</span><span class="path">/api/pakasir/create</span><span class="desc">Buat transaksi</span></div>
    <div class="eitem"><span class="method get">GET</span><span class="path">/api/pakasir/check</span><span class="desc">Cek status</span></div>
    <div class="eitem"><span class="method post">POST</span><span class="path">/api/pakasir/cancel</span><span class="desc">Batalkan</span></div>
    <div class="eitem"><span class="method get">GET</span><span class="path">/api/pakasir/methods</span><span class="desc">Metode bayar</span></div>
  </div>
</section>

<section class="cta">
  <h2>Siap Integrasi?</h2>
  <p style="color:#94a3b8;margin-bottom:16px">Mulai sekarang, gratis selamanya.</p>
  <a href="/docs" class="btn btn-p">Lihat Dokumentasi →</a>
</section>

<footer>
  <p>© 2024 <strong>RAMZZPAY</strong> • Dibuat oleh RAMZZGANTENGBANGET</p>
</footer>
</div>
</body>
</html>`;
}

function getDocsPageHTML() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dokumentasi API — RAMZZPAY</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e2e8f0;line-height:1.6}
    .container{max-width:900px;margin:0 auto;padding:20px}
    header{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid #1e293b;margin-bottom:30px}
    .logo{font-size:20px;font-weight:900}
    .hl{background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    nav a{color:#94a3b8;text-decoration:none;margin-left:16px}
    h1{font-size:28px;margin-bottom:12px}
    h2{font-size:22px;margin:32px 0 12px;padding-bottom:8px;border-bottom:2px solid #3b82f6}
    h3{font-size:17px;margin-bottom:8px}
    p{color:#94a3b8;margin-bottom:12px}
    code{background:#1e293b;padding:2px 8px;border-radius:4px;color:#60a5fa;font-family:monospace}
    pre{background:#0f172a;padding:14px;border-radius:8px;overflow-x:auto;font-size:13px;margin:10px 0}
    .doc-card{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155;margin-bottom:16px}
    .meta{display:flex;align-items:center;gap:10px;margin-bottom:12px}
    .method{padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700}
    .post{background:rgba(16,185,129,.2);color:#10b981}
    .get{background:rgba(59,130,246,.2);color:#3b82f6}
    footer{text-align:center;padding:20px;border-top:1px solid #1e293b;color:#64748b;margin-top:30px}
    footer a{color:#60a5fa;text-decoration:none}
  </style>
</head>
<body>
<div class="container">
<header>
  <div class="logo">⚡ RAMZZ<span class="hl">PAY</span></div>
  <nav><a href="/">Beranda</a><a href="/docs">Dokumentasi</a></nav>
</header>

<h1>📖 Dokumentasi API</h1>
<p>Base URL: <code>https://ramzzpay.vercel.app</code></p>

<h2>🔑 Autentikasi</h2>
<p>Semua request wajib menyertakan API Key:</p>
<pre>x-api-key: rahasia_super_aman_123</pre>

<h2>📱 OrderKouta</h2>

<div class="doc-card">
  <h3>Request OTP</h3>
  <div class="meta"><span class="method post">POST</span><code>/api/orderkouta/get-otp</code></div>
  <p>Body (JSON):</p>
  <pre>{"username":"0821xxxxxx","password":"password_akun"}</pre>
</div>

<div class="doc-card">
  <h3>Verifikasi OTP</h3>
  <div class="meta"><span class="method post">POST</span><code>/api/orderkouta/verify-otp</code></div>
  <p>Body (JSON):</p>
  <pre>{"otp":"123456"}</pre>
</div>

<div class="doc-card">
  <h3>Mutasi QRIS</h3>
  <div class="meta"><span class="method get">GET</span><code>/api/orderkouta/mutasi?page=1</code></div>
</div>

<div class="doc-card">
  <h3>Profile</h3>
  <div class="meta"><span class="method get">GET</span><code>/api/orderkouta/profile</code></div>
</div>

<div class="doc-card">
  <h3>Logout</h3>
  <div class="meta"><span class="method post">POST</span><code>/api/orderkouta/logout</code></div>
</div>

<h2>💳 Pakasir</h2>

<div class="doc-card">
  <h3>Buat Transaksi</h3>
  <div class="meta"><span class="method post">POST</span><code>/api/pakasir/create</code></div>
  <p>Body (JSON):</p>
  <pre>{"project":"slug_proyek","order_id":"INV-001","amount":10000,"pakasir_api_key":"key_pakasir"}</pre>
</div>

<div class="doc-card">
  <h3>Cek Status</h3>
  <div class="meta"><span class="method get">GET</span><code>/api/pakasir/check?project=...&order_id=...&amount=...&pakasir_api_key=...</code></div>
</div>

<div class="doc-card">
  <h3>Batalkan</h3>
  <div class="meta"><span class="method post">POST</span><code>/api/pakasir/cancel</code></div>
  <p>Body (JSON):</p>
  <pre>{"project":"slug_proyek","order_id":"INV-001","amount":10000,"pakasir_api_key":"key_pakasir"}</pre>
</div>

<div class="doc-card">
  <h3>Metode Pembayaran</h3>
  <div class="meta"><span class="method get">GET</span><code>/api/pakasir/methods</code></div>
</div>

<footer>
  <p>© 2024 <strong>RAMZZPAY</strong> • <a href="/">← Kembali ke Beranda</a></p>
</footer>
</div>
</body>
</html>`;
}
