/**
 * =============================================
 *  📱 OrderkuotaClient — NATIVE NODE.JS API
 *  Lebih cepat, aman, & bebas Cloudflare
 * =============================================
 */

class OrderkuotaClient {
    constructor() {
        this.baseUrl = 'https://app.orderkuota.com';
        this.timeout = 30000; // 30 detik dalam ms
        this.cookies = {};       // PHPSESSID, user_id, user_key
        this.token = '';         // Token mutasi QRIS
        this.userId = '';        // ID User ex: 20xxxxx
        this.username = '';
        this.isAuthenticated = false;
    }

    _log(msg) {
        // console.log(`[OKC-API] ${msg}`);
    }

    _err(msg) {
        console.error(`[OKC-API ERROR] ${msg}`);
    }

    _cookieString() {
        return Object.entries(this.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    _parseCookies(setCookieHeaders) {
        for (const cookieStr of setCookieHeaders) {
            const parts = cookieStr.split(';')[0].split('=');
            if (parts.length === 2) {
                this.cookies[parts[0].trim()] = parts[1].trim();
            }
        }
    }

    /**
     * Base HTTP Request menggunakan fetch
     */
    async _request(endpoint, bodyParams = {}) {
        const url = this.baseUrl + endpoint;
        const ts = Math.round(Date.now()); // 13-digit millisecond timestamp

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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: bodyStr,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Parse set-cookie headers
            const setCookieHeaders = response.headers.getSetCookie?.() || [];
            this._parseCookies(setCookieHeaders);

            const data = await response.json();

            return {
                statusCode: response.status,
                data: data,
            };
        } catch (error) {
            clearTimeout(timeoutId);
            this._err(`Fetch Error: ${error.message}`);
            throw new Error(`API Request failed: ${error.message}`);
        }
    }

    // ============ LOGIN FLOW ============

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
            this._log(`OTP via ${otpMethod} kepanggil! (${otpVal})`);
            return { success: true, message: `OTP dikirim via ${otpMethod} ke ${otpVal}` };
        }

        this._err("Gagal dapet OTP: " + JSON.stringify(data));
        return { success: false, message: (data && data.message) || 'Unknown error' };
    }

    async authenticate(otp) {
        this._log("Submit kode OTP...");

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

            this._log(`Auth Sukses! Token: ${this.token.substring(0, 15)}...`);

            return {
                success: true,
                data: data.results,
                message: 'Login berhasil atas nama ' + data.results.name,
            };
        }

        this._err("OTP Salah atau Expired!");
        return { success: false, message: 'Kode OTP salah/kedaluwarsa' };
    }

    // ============ ACTIONS ============

    async getMutasiQris(page = 1) {
        if (!this.isAuthenticated || !this.userId) {
            throw new Error("Belum auth atau userId kosong!");
        }

        this._log(`Fetching Mutasi QRIS (Page ${page})...`);

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
            const mutasi = data.qris_history?.results || [];
            const infoAkun = data.account?.results;

            return {
                success: true,
                info: infoAkun,
                mutasi: mutasi,
            };
        }

        return { success: false, message: 'Gagal parse data mutasi' };
    }

    /**
     * Ambil menu QRIS (termasuk URL download QRIS statis)
     */
    async getQrisMenu() {
        if (!this.isAuthenticated || !this.userId) {
            throw new Error("Belum auth atau userId kosong!");
        }

        this._log("Fetching QRIS Menu...");

        const res = await this._request(`/api/v2/qris/menu/${this.userId}`, {
            'requests[0]': 'account',
            'requests[1]': 'qris_menu',
        });

        const data = res.data;
        if (data && data.success) {
            const downloadUrl = data.qris_menu?.results?.download || '';
            const infoAkun = data.account?.results;

            return {
                success: true,
                download_url: downloadUrl,
                info: infoAkun,
            };
        }

        return { success: false, message: 'Gagal ambil QRIS menu' };
    }

    // ============ SESSION MGMT ============

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