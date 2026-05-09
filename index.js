const express = require('express');
const path = require('path');
const OrderkuotaClient = require('./orderkouta.js');
const pakasirRoutes = require('./pakasir.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(__dirname));

// =============================================
// SESSION STORE (In-Memory)
// =============================================
const sessions = new Map(); // key: sessionId, value: OrderkuotaClient instance

function getClient(req) {
    // Pakai IP + User-Agent sbg session identifier sederhana
    const sessionId = req.headers['x-session-id'] || 
                      req.ip + (req.headers['user-agent'] || '');
    
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new OrderkuotaClient());
    }
    return sessions.get(sessionId);
}

// =============================================
// ORDERKOUTA ROUTES
// =============================================
const orderkoutaRouter = express.Router();

// POST /api/orderkouta/get-otp
orderkoutaRouter.post('/get-otp', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            status: false,
            message: 'Username dan password wajib diisi'
        });
    }

    try {
        const client = getClient(req);
        const result = await client.getOTP(username, password);
        
        return res.json({
            status: result.success,
            message: result.message
        });
    } catch (err) {
        console.error('[GET-OTP ERROR]', err.message);
        return res.status(500).json({
            status: false,
            message: 'Server error: ' + err.message
        });
    }
});

// POST /api/orderkouta/verify-otp
orderkoutaRouter.post('/verify-otp', async (req, res) => {
    const { otp } = req.body;

    if (!otp) {
        return res.status(400).json({
            status: false,
            message: 'Kode OTP wajib diisi'
        });
    }

    try {
        const client = getClient(req);
        const result = await client.authenticate(otp);

        if (result.success) {
            // Generate session ID
            const sessionId = req.ip + ':' + Date.now();
            sessions.set(sessionId, client);

            // Export session data utk disimpan client-side
            const sessionData = client.exportSession();

            return res.json({
                status: true,
                message: result.message,
                data: {
                    name: result.data.name,
                    user_id: result.data.id,
                    saldo: result.data.saldo || 0,
                    session_id: sessionId,
                    session: sessionData
                },
                next: '/api/orderkouta/mutasi'
            });
        }

        return res.status(401).json({
            status: false,
            message: result.message
        });
    } catch (err) {
        console.error('[VERIFY-OTP ERROR]', err.message);
        return res.status(500).json({
            status: false,
            message: 'Server error: ' + err.message
        });
    }
});

// GET /api/orderkouta/mutasi
orderkoutaRouter.get('/mutasi', async (req, res) => {
    const { page, keterangan, dari, ke } = req.query;

    try {
        const client = getClient(req);

        if (!client.isAuthenticated) {
            return res.status(401).json({
                status: false,
                message: 'Belum login. Silakan login dulu di /api/orderkouta/get-otp dan /api/orderkouta/verify-otp'
            });
        }

        // Custom filter ke format param
        const bodyOverrides = {};
        if (keterangan) bodyOverrides['requests[qris_history][keterangan]'] = keterangan;
        if (dari) bodyOverrides['requests[qris_history][dari_tanggal]'] = dari;
        if (ke) bodyOverrides['requests[qris_history][ke_tanggal]'] = ke;

        // Override method sedikit utk support filter
        const originalRequest = client._request.bind(client);
        client._request = async function(endpoint, bodyParams = {}) {
            const merged = { ...bodyParams, ...bodyOverrides };
            return originalRequest(endpoint, merged);
        };

        const result = await client.getMutasiQris(page ? parseInt(page) : 1);

        // Restore original
        client._request = originalRequest;

        return res.json({
            status: result.success,
            message: result.success ? 'Data mutasi berhasil diambil' : result.message,
            data: {
                info: result.info,
                mutasi: result.mutasi
            }
        });
    } catch (err) {
        console.error('[MUTASI ERROR]', err.message);
        return res.status(500).json({
            status: false,
            message: 'Server error: ' + err.message
        });
    }
});

// POST /api/orderkouta/logout
orderkoutaRouter.post('/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'] || 
                      req.ip + (req.headers['user-agent'] || '');
    
    sessions.delete(sessionId);

    return res.json({
        status: true,
        message: 'Logout berhasil, session dihapus'
    });
});

// =============================================
// MOUNT ROUTERS
// =============================================
app.use('/api/orderkouta', orderkoutaRouter);
app.use('/api/pakasir', pakasirRoutes);

// =============================================
// SERVE HTML PAGES
// =============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs.html'));
});

// =============================================
// 404 HANDLER
// =============================================
app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.status(404).json({
            status: false,
            message: 'Endpoint tidak ditemukan'
        });
    }
});

// =============================================
// ERROR HANDLER
// =============================================
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({
        status: false,
        message: 'Internal server error'
    });
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
    console.log(`RAMZZPAY API running on http://localhost:${PORT}`);
    console.log(`Docs: http://localhost:${PORT}/docs`);
});

module.exports = app;