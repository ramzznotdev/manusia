const axios = require('axios');

class OrderkuotaClient {
    constructor() {
        this.baseUrl = 'https://app.orderkuota.com';
        this.timeout = 30000;
        this.cookies = {};
        this.token = '';
        this.userId = '';
        this.username = '';
        this.isAuthenticated = false;
    }

    _log(msg) {}
    
    _err(msg) {
        console.error(`[OKC-API ERROR] ${msg}`);
    }

    _cookieString() {
        return Object.entries(this.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    _parseCookies(setCookieHeaders) {
        if (!setCookieHeaders) return;
        for (const cookieStr of setCookieHeaders) {
            const parts = cookieStr.split(';')[0].split('=');
            if (parts.length === 2) {
                this.cookies[parts[0].trim()] = parts[1].trim();
            }
        }
    }

    async _request(endpoint, bodyParams = {}) {
        const url = this.baseUrl + endpoint;
        const ts = Date.now();

        const defaultBody = {
            request_time: ts,
            app_reg_id: 'dummy_reg_id_kalo_ada',
            phone_android_version: '12',
            app_version_code: '260204',
            phone_uuid: 'dummy_uuid_karena_ga_di_cek',
            app_version_name: '26.02.04',
            ui_mode: 'light',
            phone_model: 'vivo 1920',
        };

        const mergedBody = { ...defaultBody, ...bodyParams };

        if (this.token && this.username) {
            mergedBody.auth_token = this.token;
            mergedBody.auth_username = this.username;
        }

        const bodyStr = new URLSearchParams(mergedBody).toString();

        const headers = {
            'User-Agent': 'okhttp/5.3.2',
            'Content-Type': 'application/x-www-form-urlencoded',
            'signature': 'dummy',
            'timestamp': ts.toString(),
        };

        const cookieHeader = this._cookieString();
        if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
        }

        try {
            const response = await axios.post(url, bodyStr, {
                headers: headers,
                timeout: this.timeout,
                responseType: 'json'
            });

            // Parse cookies
            const setCookie = response.headers['set-cookie'];
            this._parseCookies(setCookie);

            return {
                statusCode: response.status,
                data: response.data,
            };
        } catch (error) {
            this._err(`Fetch Error: ${error.message}`);
            if (error.response) {
                this._parseCookies(error.response.headers['set-cookie']);
            }
            throw new Error(`API Request failed: ${error.message}`);
        }
    }

    async getOTP(username, password) {
        this._log(`Request OTP buat: ${username}`);
        this.username = username;

        const res = await this._request('/api/v2/login', {
            username: username,
            password: password,
        });

        const data = res.data;
        if (data && data.success) {
            const otpMethod = data.results.otp;
            const otpVal = data.results.otp_value;
            return { success: true, message: `OTP dikirim via ${otpMethod} ke ${otpVal}` };
        }

        return { success: false, message: (data && data.message) || 'Unknown error' };
    }

    async authenticate(otp) {
        if (!this.username) {
            return { success: false, message: 'Username belum di set (panggil getOTP dulu)' };
        }

        const res = await this._request('/api/v2/login', {
            username: this.username,
            password: otp,
        });

        const data = res.data;
        if (data && data.success && data.results && data.results.token) {
            this.isAuthenticated = true;
            this.token = data.results.token;
            this.userId = data.results.id;

            return {
                success: true,
                data: data.results,
                message: 'Login berhasil atas nama ' + data.results.name,
            };
        }

        return { success: false, message: 'Kode OTP salah/kedaluwarsa' };
    }

    async getMutasiQris(page = 1) {
        if (!this.isAuthenticated || !this.userId) {
            throw new Error("Belum auth atau userId kosong!");
        }

        const res = await this._request(`/api/v2/qris/mutasi/${this.userId}`, {
            'requests[0]': 'account',
            'requests[qris_history][page]': page,
            'requests[qris_history][keterangan]': '',
            'requests[qris_history][jumlah]': '',
            'requests[qris_history][dari_tanggal]': '',
            'requests[qris_history][ke_tanggal]': '',
        });

        const data = res.data;
        if (data && data.success) {
            return {
                success: true,
                info: data.account?.results,
                mutasi: data.qris_history?.results || [],
            };
        }

        return { success: false, message: 'Gagal parse data mutasi' };
    }

    async getQrisMenu() {
        if (!this.isAuthenticated || !this.userId) {
            throw new Error("Belum auth atau userId kosong!");
        }

        const res = await this._request(`/api/v2/qris/menu/${this.userId}`, {
            'requests[0]': 'account',
            'requests[1]': 'qris_menu',
        });

        const data = res.data;
        if (data && data.success) {
            return {
                success: true,
                download_url: data.qris_menu?.results?.download || '',
                info: data.account?.results,
            };
        }

        return { success: false, message: 'Gagal ambil QRIS menu' };
    }

    exportSession() {
        return {
            cookies: this.cookies,
            token: this.token,
            userId: this.userId,
            username: this.username,
            isAuthenticated: this.isAuthenticated,
            savedAt: new Date().toISOString(),
        };
    }

    importSession(session) {
        this.cookies = session.cookies || {};
        this.token = session.token || '';
        this.userId = session.userId || '';
        this.username = session.username || '';
        this.isAuthenticated = session.isAuthenticated || false;
    }
}

module.exports = OrderkuotaClient;