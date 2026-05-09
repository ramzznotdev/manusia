const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// =============================================
// SIMPEL JSON FILE STORE
// =============================================
const DATA_DIR = path.join(__dirname, 'data');
const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readSessions() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return {};
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch (err) {
    return {};
  }
}

function saveSessions(data) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

function getSession(apiKey) {
  const sessions = readSessions();
  return sessions[apiKey] || null;
}

function setSession(apiKey, data) {
  const sessions = readSessions();
  sessions[apiKey] = data;
  saveSessions(sessions);
}

function deleteSession(apiKey) {
  const sessions = readSessions();
  delete sessions[apiKey];
  saveSessions(sessions);
}

// =============================================
// ORDERKOUTA CLIENT
// =============================================
const OK_BASE_URL = 'https://app.orderkuota.com/api/v2';

// Headers default biar kayak request dari aplikasi asli
function getDefaultHeaders(cookies = {}) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'okhttp/5.3.2',
    'signature': 'dummy',
    'timestamp': Date.now().toString()
  };

  // Build cookie string
  const cookieParts = [];
  for (const [key, value] of Object.entries(cookies)) {
    cookieParts.push(`${key}=${value}`);
  }
  if (cookieParts.length > 0) {
    headers['Cookie'] = cookieParts.join('; ');
  }

  return headers;
}

// Body params default biar kayak request dari aplikasi
function getDefaultBody() {
  return {
    request_time: Date.now(),
    phone_android_version: '12',
    app_version_code: '260204',
    app_version_name: '26.02.04',
    phone_model: 'Xiaomi 13',
    phone_uuid: 'ramzzpay-uuid-' + Math.random().toString(36).substring(7),
    ui_mode: 'dark'
  };
}

// Convert object ke x-www-form-urlencoded
function toFormData(obj) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    params.append(key, value);
  }
  return params.toString();
}

// =============================================
// POST /api/orderkouta/get-otp
// =============================================
router.post('/get-otp', async (req, res) => {
  const { username, password } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (!username || !password) {
    return res.status(400).json({
      status: false,
      message: 'username dan password wajib diisi'
    });
  }

  // Cek apakah user ini udah punya session aktif
  const existingSession = getSession(apiKey);
  if (existingSession && existingSession.authenticated) {
    return res.status(400).json({
      status: false,
      message: 'Akun sudah login. Logout dulu sebelum request OTP baru.'
    });
  }

  try {
    const body = {
      ...getDefaultBody(),
      username,
      password
    };

    const response = await axios.post(
      `${OK_BASE_URL}/login`,
      toFormData(body),
      {
        headers: getDefaultHeaders(),
        timeout: 15000
      }
    );

    const data = response.data;

    // Parse cookies dari response header
    const cookies = {};
    const setCookie = response.headers['set-cookie'];
    if (setCookie && Array.isArray(setCookie)) {
      setCookie.forEach(cookie => {
        const match = cookie.match(/^([^=]+)=([^;]+)/);
        if (match) {
          cookies[match[1]] = match[2];
        }
      });
    }

    if (data.success) {
      // Simpan session awal (belum authenticated, tapi cookies udah disimpan)
      setSession(apiKey, {
        username,
        cookies,
        otpSent: true,
        otpMethod: data.results?.otp || 'WhatsApp',
        otpValue: data.results?.otp_value || username,
        authenticated: false,
        createdAt: new Date().toISOString()
      });

      return res.json({
        status: true,
        message: `OTP dikirim via ${data.results?.otp || 'WhatsApp'} ke ${data.results?.otp_value || username}`,
        data: {
          otp_method: data.results?.otp || 'WhatsApp',
          masked_phone: data.results?.otp_value || username
        }
      });
    }

    return res.status(400).json({
      status: false,
      message: data.message || 'Gagal request OTP. Periksa username/password.'
    });

  } catch (err) {
    console.error('[GET-OTP ERROR]', err.message);
    return res.status(502).json({
      status: false,
      message: 'Server OrderKouta tidak merespons: ' + err.message
    });
  }
});

// =============================================
// POST /api/orderkouta/verify-otp
// =============================================
router.post('/verify-otp', async (req, res) => {
  const { otp } = req.body;
  const apiKey = req.headers['x-api-key'];

  if (!otp) {
    return res.status(400).json({
      status: false,
      message: 'Kode OTP wajib diisi'
    });
  }

  const session = getSession(apiKey);
  if (!session || !session.otpSent) {
    return res.status(400).json({
      status: false,
      message: 'Session tidak ditemukan. Request OTP dulu.'
    });
  }

  if (session.authenticated) {
    return res.status(400).json({
      status: false,
      message: 'Akun sudah login. Logout dulu jika ingin login ulang.'
    });
  }

  try {
    const body = {
      ...getDefaultBody(),
      username: session.username,
      password: otp
    };

    const response = await axios.post(
      `${OK_BASE_URL}/login`,
      toFormData(body),
      {
        headers: getDefaultHeaders(session.cookies),
        timeout: 15000
      }
    );

    const data = response.data;

    if (data.success && data.results?.token) {
      // Update session dengan token & user info
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
        message: 'Login berhasil! Selamat datang, ' + (data.results.name || session.username),
        data: {
          name: data.results.name || session.username,
          user_id: data.results.id || '',
          saldo: data.results.saldo || 0,
          token: data.results.token.substring(0, 15) + '...' // Masked token
        }
      });
    }

    return res.status(400).json({
      status: false,
      message: data.message || 'OTP salah atau expired. Coba lagi.'
    });

  } catch (err) {
    console.error('[VERIFY-OTP ERROR]', err.message);
    return res.status(502).json({
      status: false,
      message: 'Server OrderKouta tidak merespons: ' + err.message
    });
  }
});

// =============================================
// GET /api/orderkouta/profile
// =============================================
router.get('/profile', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const session = getSession(apiKey);

  if (!session || !session.authenticated) {
    return res.status(401).json({
      status: false,
      message: 'Belum login. Request OTP & verifikasi dulu.'
    });
  }

  return res.json({
    status: true,
    message: 'Profile berhasil diambil',
    data: {
      name: session.name,
      user_id: session.userId,
      saldo: session.saldo || 0,
      username: session.username,
      authenticated: session.authenticated,
      login_at: session.verifiedAt
    }
  });
});

// =============================================
// GET /api/orderkouta/mutasi
// =============================================
router.get('/mutasi', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const page = parseInt(req.query.page) || 1;

  const session = getSession(apiKey);
  if (!session || !session.authenticated) {
    return res.status(401).json({
      status: false,
      message: 'Belum login. Request OTP & verifikasi dulu.'
    });
  }

  try {
    // Body buat request mutasi
    const body = {
      ...getDefaultBody(),
      auth_token: session.token,
      auth_username: session.username,
      'requests[0]': 'account',
      'requests[qris_history][page]': page,
      'requests[qris_history][keterangan]': '',
      'requests[qris_history][jumlah]': '',
      'requests[qris_history][dari_tanggal]': '',
      'requests[qris_history][ke_tanggal]': ''
    };

    const response = await axios.post(
      `${OK_BASE_URL}/qris/mutasi/${session.userId}`,
      toFormData(body),
      {
        headers: getDefaultHeaders(session.cookies),
        timeout: 15000
      }
    );

    const data = response.data;

    if (data.success) {
      return res.json({
        status: true,
        message: 'Mutasi berhasil diambil',
        data: {
          account: data.account?.results || {},
          mutasi: data.qris_history?.results || [],
          page: page
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

// =============================================
// POST /api/orderkouta/logout
// =============================================
router.post('/logout', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  
  const session = getSession(apiKey);
  if (!session) {
    return res.status(400).json({
      status: false,
      message: 'Tidak ada session aktif'
    });
  }

  deleteSession(apiKey);

  return res.json({
    status: true,
    message: 'Logout berhasil. Sesi telah dihapus.'
  });
});

module.exports = router;