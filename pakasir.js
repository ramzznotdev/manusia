const express = require('express');
const router = express.Router();
const axios = require('axios');

// =============================================
// KONFIG PAKASIR
// =============================================
const PAKASIR_BASE_URL = 'https://app.pakasir.com/api';

// =============================================
// POST /api/pakasir/create
// =============================================
router.post('/create', async (req, res) => {
  const { project, order_id, amount, pakasir_api_key } = req.body;

  if (!project || !order_id || !amount || !pakasir_api_key) {
    return res.status(400).json({
      status: false,
      message: 'project, order_id, amount, dan pakasir_api_key wajib diisi'
    });
  }

  try {
    const response = await axios.post(
      `${PAKASIR_BASE_URL}/transactioncreate/qris`,
      {
        project,
        order_id,
        amount: parseInt(amount),
        api_key: pakasir_api_key
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RAMZZPAY/1.0'
        },
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
    return res.status(500).json({
      status: false,
      message: 'Server Pakasir error: ' + err.message
    });
  }
});

// =============================================
// GET /api/pakasir/check
// =============================================
router.get('/check', async (req, res) => {
  const { project, order_id, amount, pakasir_api_key } = req.query;

  if (!project || !order_id || !amount || !pakasir_api_key) {
    return res.status(400).json({
      status: false,
      message: 'project, order_id, amount, dan pakasir_api_key wajib diisi'
    });
  }

  try {
    const response = await axios.get(
      `${PAKASIR_BASE_URL}/transactiondetail`,
      {
        params: {
          project,
          order_id,
          amount: parseInt(amount),
          api_key: pakasir_api_key
        },
        headers: {
          'User-Agent': 'RAMZZPAY/1.0'
        },
        timeout: 10000
      }
    );

    const data = response.data;

    return res.json({
      status: true,
      message: 'Status transaksi ditemukan',
      data
    });

  } catch (err) {
    console.error('[PAKASIR CHECK ERROR]', err.message);
    return res.status(500).json({
      status: false,
      message: 'Server Pakasir error: ' + err.message
    });
  }
});

// =============================================
// POST /api/pakasir/cancel
// =============================================
router.post('/cancel', async (req, res) => {
  const { project, order_id, amount, pakasir_api_key } = req.body;

  if (!project || !order_id || !amount || !pakasir_api_key) {
    return res.status(400).json({
      status: false,
      message: 'project, order_id, amount, dan pakasir_api_key wajib diisi'
    });
  }

  try {
    const response = await axios.post(
      `${PAKASIR_BASE_URL}/transactioncancel`,
      {
        project,
        order_id,
        amount: parseInt(amount),
        api_key: pakasir_api_key
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RAMZZPAY/1.0'
        },
        timeout: 10000
      }
    );

    const data = response.data;

    return res.json({
      status: true,
      message: 'Transaksi berhasil dibatalkan',
      data
    });

  } catch (err) {
    console.error('[PAKASIR CANCEL ERROR]', err.message);
    return res.status(500).json({
      status: false,
      message: 'Server Pakasir error: ' + err.message
    });
  }
});

// =============================================
// GET /api/pakasir/methods
// =============================================
router.get('/methods', (req, res) => {
  // List metode pembayaran yang didukung Pakasir
  const methods = [
    { id: 'qris', name: 'QRIS', description: 'Scan QR code via mobile banking/e-wallet', min: 1000, max: 5000000 },
    { id: 'va_bca', name: 'Virtual Account BCA', description: 'Transfer ke rekening BCA virtual', min: 10000, max: 100000000 },
    { id: 'va_mandiri', name: 'Virtual Account Mandiri', description: 'Transfer ke rekening Mandiri virtual', min: 10000, max: 100000000 },
    { id: 'va_bni', name: 'Virtual Account BNI', description: 'Transfer ke rekening BNI virtual', min: 10000, max: 100000000 },
    { id: 'va_bri', name: 'Virtual Account BRI', description: 'Transfer ke rekening BRI virtual', min: 10000, max: 100000000 }
  ];

  return res.json({
    status: true,
    message: 'Daftar metode pembayaran',
    data: methods
  });
});

module.exports = router;