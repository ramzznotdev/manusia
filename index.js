const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// TEST: Jangan load orderkuota.js dulu
// const OrderkuotaClient = require('./orderkuota.js');
// const pakasirRoutes = require('./pakasir.js');

// Test endpoint tanpa dependency
app.get('/api/test', (req, res) => {
    res.json({ status: true, message: 'Server hidup!' });
});

app.post('/api/orderkouta/logout', (req, res) => {
    res.json({ status: true, message: 'Logout berhasil (test)', session: {} });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'docs.html')));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ status: false, message: 'Internal server error', error: err.message });
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Test server: http://localhost:${PORT}`));
}

module.exports = app;