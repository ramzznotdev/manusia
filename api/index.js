const express = require('express');
const path = require('path');
const OrderkuotaClient = require('./orderkuota.js');
const pakasirRoutes = require('./pakasir.js');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..')));

// Session
function getClient(req) {
    const client = new OrderkuotaClient();
    const sessionJson = req.headers['x-session'];
    if (sessionJson) {
        try { client.importSession(JSON.parse(sessionJson)); } catch (e) {}
    }
    return client;
}

// OrderKouta Routes
const ok = express.Router();

ok.post('/get-otp', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ status: false, message: 'Username dan password wajib' });
        const client = getClient(req);
        const result = await client.getOTP(username, password);
        return res.json({ status: result.success, message: result.message, session: client.exportSession() });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

ok.post('/verify-otp', async (req, res) => {
    try {
        const { otp } = req.body;
        if (!otp) return res.status(400).json({ status: false, message: 'OTP wajib' });
        const client = getClient(req);
        const result = await client.authenticate(otp);
        if (result.success) {
            return res.json({
                status: true, message: result.message,
                data: { name: result.data.name, user_id: result.data.id, saldo: result.data.saldo || 0 },
                session: client.exportSession(), next: '/api/orderkouta/mutasi'
            });
        }
        return res.status(401).json({ status: false, message: result.message });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

ok.get('/mutasi', async (req, res) => {
    try {
        const client = getClient(req);
        if (!client.isAuthenticated) return res.status(401).json({ status: false, message: 'Belum login' });
        const { page, keterangan, dari, ke } = req.query;
        const overrides = {};
        if (keterangan) overrides['requests[qris_history][keterangan]'] = keterangan;
        if (dari) overrides['requests[qris_history][dari_tanggal]'] = dari;
        if (ke) overrides['requests[qris_history][ke_tanggal]'] = ke;
        const orig = client._request.bind(client);
        if (Object.keys(overrides).length > 0) {
            client._request = async (ep, bp = {}) => orig(ep, { ...bp, ...overrides });
        }
        const result = await client.getMutasiQris(page ? parseInt(page) : 1);
        client._request = orig;
        return res.json({
            status: result.success, message: result.success ? 'OK' : result.message,
            data: { info: result.info, mutasi: result.mutasi }, session: client.exportSession()
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

ok.get('/menu', async (req, res) => {
    try {
        const client = getClient(req);
        if (!client.isAuthenticated) return res.status(401).json({ status: false, message: 'Belum login' });
        const result = await client.getQrisMenu();
        return res.json({
            status: result.success, message: result.success ? 'OK' : result.message,
            data: { download_url: result.download_url, info: result.info }, session: client.exportSession()
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
});

ok.get('/profile', (req, res) => {
    const client = getClient(req);
    return res.json({
        status: true,
        data: { username: client.username, user_id: client.userId, is_authenticated: client.isAuthenticated },
        session: client.exportSession()
    });
});

ok.post('/logout', (req, res) => {
    return res.json({ status: true, message: 'Logout berhasil', session: new OrderkuotaClient().exportSession() });
});

// Mount
app.use('/api/orderkouta', ok);
app.use('/api/pakasir', pakasirRoutes);

// Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'docs.html')));
// 404
app.use((req, res) => res.status(404).json({ status: false, message: 'Not found' }));

// Error handler
app.use((err, req, res, next) => res.status(500).json({ status: false, message: 'Internal server error' }));

module.exports = app;
