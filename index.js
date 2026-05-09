// =============================================
// RAMZZPAY API - Node.js + Express Server
// =============================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// MIDDLEWARE
// =============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - allow all origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// =============================================
// STORAGE - Memory / File
// =============================================
const isVercel = process.env.VERCEL === '1';

let store;
if (isVercel) {
  store = { sessions: {} };
} else {
  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');

  store = {
    getSession(apiKey) {
      try {
        if (!fs.existsSync(SESSION_FILE)) return null;
        return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))[apiKey] || null;
      } catch { return null; }
    },
    setSession(apiKey, data) {
      try {
        let sessions = {};
        if (fs.existsSync(SESSION_FILE)) sessions = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        sessions[apiKey] = data;
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
      } catch {}
    },
    deleteSession(apiKey) {
      try {
        if (!fs.existsSync(SESSION_FILE)) return;
        const sessions = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        delete sessions[apiKey];
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
      } catch {}
    }
  };
}

// Session helpers
function getSession(apiKey) {
  return isVercel ? store.sessions[apiKey] || null : store.getSession(apiKey);
}

function setSession(apiKey, data) {
  isVercel ? store.sessions[apiKey] = data : store.setSession(apiKey, data);
}

function deleteSession(apiKey) {
  isVercel ? delete store.sessions[apiKey] : store.deleteSession(apiKey);
}

// =============================================
// HELPERS
// =============================================
function getParams(req) {
  const q = req.query || {};
  const b = req.body || {};
  return { ...q, ...b };
}

// =============================================
// ORDERKOUTA CONFIG
// =============================================
const OK_URL = 'https://app.orderkuota.com/api/v2';

function getHeaders(cookies = {}) {
  const h = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'okhttp/5.3.2'
  };
  const c = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (c) h['Cookie'] = c;
  return h;
}

function getBody(extra = {}) {
  return new URLSearchParams({
    request_time: Date.now(),
    phone_android_version: '12',
    app_version_code: '260204',
    app_version_name: '26.02.04',
    phone_model: 'Xiaomi 13',
    ui_mode: 'dark',
    ...extra
  }).toString();
}

// =============================================
// ORDERKOUTA ENDPOINTS
// =============================================

// GET/POST /api/orderkouta/get-otp
app.all('/api/orderkouta/get-otp', async (req, res) => {
  const { username, password } = getParams(req);
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!username || !password) {
    return res.status(400).json({
      status: false,
      message: 'Parameter wajib: username & password'
    });
  }

  const session = getSession(apiKey);
  if (session?.authenticated) {
    return res.json({
      status: false,
      message: 'Sudah login. Gunakan /logout dulu untuk login ulang.'
    });
  }

  try {
    const response = await axios.post(`${OK_URL}/login`, getBody({ username, password }), {
      headers: getHeaders(),
      timeout: 15000
    });

    const cookies = {};
    const sc = response.headers['set-cookie'];
    if (Array.isArray(sc)) {
      sc.forEach(c => {
        const m = c.match(/^([^=]+)=([^;]+)/);
        if (m) cookies[m[1]] = m[2];
      });
    }

    const data = response.data;

    if (data.success) {
      setSession(apiKey, {
        username,
        cookies,
        otpSent: true,
        authenticated: false,
        createdAt: new Date().toISOString()
      });

      return res.json({
        status: true,
        message: `OTP terkirim ke ${data.results?.otp_value || username}`,
        data: {
          otp_method: data.results?.otp || 'WhatsApp',
          masked_phone: data.results?.otp_value || username
        },
        next: '/api/orderkouta/verify-otp?otp=KODE_OTP'
      });
    }

    return res.status(400).json({
      status: false,
      message: data.message || 'Gagal mengirim OTP'
    });

  } catch (err) {
    console.error('[GET-OTP ERROR]', err.message);
    return res.status(502).json({
      status: false,
      message: 'Server OrderKouta tidak merespons: ' + err.message
    });
  }
});

// GET/POST /api/orderkouta/verify-otp
app.all('/api/orderkouta/verify-otp', async (req, res) => {
  const { otp } = getParams(req);
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!otp) {
    return res.status(400).json({
      status: false,
      message: 'Parameter wajib: otp'
    });
  }

  const session = getSession(apiKey);
  if (!session?.otpSent) {
    return res.status(400).json({
      status: false,
      message: 'Belum request OTP. Buka /get-otp dulu.'
    });
  }

  if (session.authenticated) {
    return res.json({
      status: false,
      message: 'Sudah login. Gunakan /logout dulu.'
    });
  }

  try {
    const response = await axios.post(
      `${OK_URL}/login`,
      getBody({ username: session.username, password: otp }),
      { headers: getHeaders(session.cookies), timeout: 15000 }
    );

    const data = response.data;

    if (data.success && data.results?.token) {
      setSession(apiKey, {
        ...session,
        authenticated: true,
        token: data.results.token,
        userId: data.results.id || '',
        name: data.results.name || session.username,
        saldo: data.results.saldo || 0,
        verifiedAt: new Date().toISOString()
      });

      return res.json({
        status: true,
        message: `Login berhasil! Selamat datang, ${data.results.name || session.username}`,
        data: {
          token: data.results.token,
          name: data.results.name || session.username,
          user_id: data.results.id || '',
          saldo: data.results.saldo || 0
        },
        next: '/api/orderkouta/mutasi'
      });
    }

    return res.status(400).json({
      status: false,
      message: data.message || 'OTP salah atau expired'
    });

  } catch (err) {
    console.error('[VERIFY-OTP ERROR]', err.message);
    return res.status(502).json({
      status: false,
      message: 'Server OrderKouta tidak merespons: ' + err.message
    });
  }
});

// GET /api/orderkouta/profile
app.get('/api/orderkouta/profile', (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const session = getSession(apiKey);

  if (!session?.authenticated) {
    return res.json({
      status: false,
      message: 'Belum login. Buka /get-otp dulu.',
      authenticated: false
    });
  }

  return res.json({
    status: true,
    authenticated: true,
    data: {
      name: session.name,
      user_id: session.userId,
      saldo: session.saldo || 0,
      username: session.username,
      login_at: session.verifiedAt || '-'
    }
  });
});

// GET /api/orderkouta/mutasi
app.get('/api/orderkouta/mutasi', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const page = parseInt(req.query.page) || 1;

  const session = getSession(apiKey);
  if (!session?.authenticated) {
    return res.json({
      status: false,
      message: 'Belum login. Buka /get-otp dulu.',
      authenticated: false
    });
  }

  try {
    const body = getBody({
      auth_token: session.token,
      auth_username: session.username,
      'requests[0]': 'account',
      'requests[qris_history][page]': page,
      'requests[qris_history][keterangan]': req.query.keterangan || '',
      'requests[qris_history][jumlah]': req.query.jumlah || '',
      'requests[qris_history][dari_tanggal]': req.query.dari || '',
      'requests[qris_history][ke_tanggal]': req.query.ke || ''
    });

    const response = await axios.post(
      `${OK_URL}/qris/mutasi/${session.userId}`,
      body,
      { headers: getHeaders(session.cookies), timeout: 15000 }
    );

    const data = response.data;

    if (data.success) {
      return res.json({
        status: true,
        authenticated: true,
        data: {
          account: data.account?.results || {},
          mutasi: data.qris_history?.results || [],
          page: page,
          total: data.qris_history?.total || 0
        }
      });
    }

    return res.status(400).json({
      status: false,
      message: data.message || 'Gagal mengambil mutasi'
    });

  } catch (err) {
    console.error('[MUTASI ERROR]', err.message);
    return res.status(502).json({
      status: false,
      message: 'Server OrderKouta tidak merespons: ' + err.message
    });
  }
});

// GET/POST /api/orderkouta/logout
app.all('/api/orderkouta/logout', (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  deleteSession(apiKey);

  return res.json({
    status: true,
    message: 'Logout berhasil. Sesi telah dihapus.',
    next: '/api/orderkouta/get-otp'
  });
});

// =============================================
// PAKASIR CONFIG
// =============================================
const PAKASIR_URL = 'https://app.pakasir.com/api';

// =============================================
// PAKASIR ENDPOINTS
// =============================================

// ALL /api/pakasir/create
app.all('/api/pakasir/create', async (req, res) => {
  const { project, order_id, amount, pakasir_api_key } = getParams(req);

  if (!project || !order_id || !amount || !pakasir_api_key) {
    return res.status(400).json({
      status: false,
      message: 'Parameter wajib: project, order_id, amount, pakasir_api_key'
    });
  }

  try {
    const response = await axios.post(
      `${PAKASIR_URL}/transactioncreate/qris`,
      { project, order_id, amount: parseInt(amount), api_key: pakasir_api_key },
      {
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'RAMZZPAY/1.0' },
        timeout: 15000
      }
    );

    const data = response.data;

    if (data.payment) {
      return res.json({
        status: true,
        message: 'Transaksi berhasil dibuat',
        data: {
          payment_method: data.payment.payment_method || 'qris',
          payment_number: data.payment.payment_number,
          total_payment: data.payment.total_payment,
          fee: data.payment.fee || 0,
          expired_at: data.payment.expired_at,
          project: data.payment.project,
          order_id: data.payment.order_id
        }
      });
    }

    return res.status(400).json({
      status: false,
      message: data.message || 'Gagal membuat transaksi'
    });

  } catch (err) {
    console.error('[PAKASIR CREATE ERROR]', err.message);
    return res.status(502).json({
      status: false,
      message: 'Server Pakasir error: ' + err.message
    });
  }
});

// ALL /api/pakasir/check
app.all('/api/pakasir/check', async (req, res) => {
  const { project, order_id, amount, pakasir_api_key } = getParams(req);

  if (!project || !order_id || !amount || !pakasir_api_key) {
    return res.status(400).json({
      status: false,
      message: 'Parameter wajib: project, order_id, amount, pakasir_api_key'
    });
  }

  try {
    const response = await axios.get(`${PAKASIR_URL}/transactiondetail`, {
      params: { project, order_id, amount: parseInt(amount), api_key: pakasir_api_key },
      headers: { 'User-Agent': 'RAMZZPAY/1.0' },
      timeout: 10000
    });

    return res.json({
      status: true,
      message: 'Status transaksi ditemukan',
      data: response.data
    });

  } catch (err) {
    console.error('[PAKASIR CHECK ERROR]', err.message);
    return res.status(502).json({
      status: false,
      message: 'Server Pakasir error: ' + err.message
    });
  }
});

// ALL /api/pakasir/cancel
app.all('/api/pakasir/cancel', async (req, res) => {
  const { project, order_id, amount, pakasir_api_key } = getParams(req);

  if (!project || !order_id || !amount || !pakasir_api_key) {
    return res.status(400).json({
      status: false,
      message: 'Parameter wajib: project, order_id, amount, pakasir_api_key'
    });
  }

  try {
    const response = await axios.post(
      `${PAKASIR_URL}/transactioncancel`,
      { project, order_id, amount: parseInt(amount), api_key: pakasir_api_key },
      {
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'RAMZZPAY/1.0' },
        timeout: 10000
      }
    );

    return res.json({
      status: true,
      message: 'Transaksi berhasil dibatalkan',
      data: response.data
    });

  } catch (err) {
    console.error('[PAKASIR CANCEL ERROR]', err.message);
    return res.status(502).json({
      status: false,
      message: 'Server Pakasir error: ' + err.message
    });
  }
});

// GET /api/pakasir/methods
app.get('/api/pakasir/methods', (req, res) => {
  return res.json({
    status: true,
    message: 'Daftar metode pembayaran',
    data: [
      { id: 'qris', name: 'QRIS', min: 1000, max: 5000000 },
      { id: 'va_bca', name: 'Virtual Account BCA', min: 10000, max: 100000000 },
      { id: 'va_mandiri', name: 'Virtual Account Mandiri', min: 10000, max: 100000000 },
      { id: 'va_bni', name: 'Virtual Account BNI', min: 10000, max: 100000000 },
      { id: 'va_bri', name: 'Virtual Account BRI', min: 10000, max: 100000000 }
    ]
  });
});

// =============================================
// HTML PAGES
// =============================================

// Landing Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Docs Page
app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

// =============================================
// 404 HANDLER
// =============================================
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>404 - RAMZZPAY</title>
        <style>
          body {
            font-family: 'Inter', sans-serif;
            background: #080c14;
            color: #e8edf5;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          h1 { font-size: 6rem; margin: 0; background: linear-gradient(135deg, #60a5fa, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          p { color: #9aafc9; margin: 16px 0 32px; }
          a { color: #3b82f6; text-decoration: none; font-weight: 600; border: 1px solid #1e3a5f; padding: 10px 24px; border-radius: 50px; transition: 0.3s; }
          a:hover { background: rgba(59,130,246,0.1); border-color: #3b82f6; }
        </style>
      </head>
      <body>
        <div>
          <h1>404</h1>
          <p>Halaman tidak ditemukan</p>
          <a href="/">Kembali ke Beranda</a>
        </div>
      </body>
      </html>
    `);
  }
  res.status(404).json({ status: false, message: 'Route tidak ditemukan' });
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
  console.log(`RAMZZPAY running at http://localhost:${PORT}`);
  console.log(`Landing Page: http://localhost:${PORT}/`);
  console.log(`API Docs: http://localhost:${PORT}/docs`);
});

module.exports = app;