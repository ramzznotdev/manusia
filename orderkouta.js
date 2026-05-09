const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// =============================================
// STORAGE
// =============================================
let store;
let isVercel;

router.use((req, res, next) => {
  if (!store) {
    isVercel = req.app.get('isVercel');
    if (isVercel) {
      store = req.app.get('memoryStore');
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
  }
  next();
});

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
// HELPER
// =============================================
const OK_URL = 'https://app.orderkuota.com/api/v2';

function getHeaders(cookies = {}) {
  const h = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'okhttp/5.3.2'
  };
  const c = Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join('; ');
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

// Ambil param dari body (POST) atau query (GET)
function getParams(req) {
  return {
    username: req.body?.username || req.query?.username || '',
    password: req.body?.password || req.query?.password || '',
    otp: req.body?.otp || req.query?.otp || ''
  };
}

// =============================================
// GET/POST /api/orderkouta/get-otp
// Bisa lewat URL langsung atau form
// =============================================
router.all('/get-otp', async (req, res) => {
  const { username, password } = getParams(req);
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!username || !password) {
    return res.status(400).json({
      status: false,
      message: 'Parameter wajib: username, password'
    });
  }

  const session = getSession(apiKey);
  if (session?.authenticated) {
    return res.json({
      status: false,
      message: 'Sudah login. Buka /logout dulu kalo mau login ulang.'
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
        username, cookies,
        otpSent: true,
        authenticated: false,
        createdAt: new Date().toISOString()
      });

      return res.json({
        status: true,
        message: `OTP terkirim ke ${data.results?.otp_value || username}`,
        next_step: `/api/orderkouta/verify-otp?otp=KODE_OTP_KAMU`
      });
    }

    return res.status(400).json({
      status: false,
      message: data.message || 'Gagal kirim OTP'
    });

  } catch (err) {
    return res.status(502).json({
      status: false,
      message: 'Server OrderKouta error: ' + err.message
    });
  }
});

// =============================================
// GET/POST /api/orderkouta/verify-otp
// =============================================
router.all('/verify-otp', async (req, res) => {
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
      message: 'Sudah login. Buka /logout dulu kalo mau login ulang.'
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
        userId: data.results.id,
        name: data.results.name || session.username,
        saldo: data.results.saldo || 0
      });

      return res.json({
        status: true,
        message: `Login berhasil! Selamat datang ${data.results.name || session.username}`,
        data: {
          name: data.results.name,
          user_id: data.results.id,
          saldo: data.results.saldo || 0
        },
        next_step: '/api/orderkouta/mutasi'
      });
    }

    return res.status(400).json({
      status: false,
      message: data.message || 'OTP salah atau expired'
    });

  } catch (err) {
    return res.status(502).json({
      status: false,
      message: 'Error: ' + err.message
    });
  }
});

// =============================================
// GET /api/orderkouta/profile
// =============================================
router.get('/profile', (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const session = getSession(apiKey);

  if (!session?.authenticated) {
    return res.json({
      status: false,
      message: 'Belum login. Buka /get-otp dulu.'
    });
  }

  return res.json({
    status: true,
    data: {
      name: session.name,
      user_id: session.userId,
      saldo: session.saldo,
      username: session.username
    }
  });
});

// =============================================
// GET /api/orderkouta/mutasi
// =============================================
router.get('/mutasi', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const page = parseInt(req.query.page) || 1;

  const session = getSession(apiKey);
  if (!session?.authenticated) {
    return res.json({
      status: false,
      message: 'Belum login. Buka /get-otp dulu.'
    });
  }

  try {
    const body = getBody({
      auth_token: session.token,
      auth_username: session.username,
      'requests[0]': 'account',
      'requests[qris_history][page]': page,
      'requests[qris_history][keterangan]': '',
      'requests[qris_history][jumlah]': ''
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
        data: {
          account: data.account?.results || {},
          mutasi: data.qris_history?.results || [],
          page: page
        }
      });
    }

    return res.status(400).json({
      status: false,
      message: 'Gagal ambil mutasi'
    });

  } catch (err) {
    return res.status(502).json({
      status: false,
      message: 'Error: ' + err.message
    });
  }
});

// =============================================
// GET/POST /api/orderkouta/logout
// =============================================
router.all('/logout', (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  deleteSession(apiKey);

  res.json({
    status: true,
    message: 'Logout berhasil. Silakan login ulang.',
    next_step: '/api/orderkouta/get-otp?username=NOMOR&password=PASS'
  });
});

module.exports = router;
