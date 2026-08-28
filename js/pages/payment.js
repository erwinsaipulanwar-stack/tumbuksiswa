/**
 * ==========================================================================
 * TUMBUK SISWA — HALAMAN PAYMENT/INVOICE (payment.js)
 * Versi Supabase — Patch Fase 2:
 *   - Polling di-pause saat tab tidak aktif (visibilitychange) — no memory leak
 *   - Polling auto-stop setelah 30 menit (timeout)
 *   - Badge #pay-status di-update ke PAID/LUNAS setelah verifikasi
 *   - Timestamp last-checked pada status menunggu
 *   - IDOR fix: loadOrderData pakai p_kontak_wa dari localStorage
 *   - Tombol "Kembali & Ubah Pesanan" diganti tombol bantuan WA
 *   - XSS fix: elDate pakai DOM aman (bukan raw innerHTML string injection)
 * ==========================================================================
 */
document.addEventListener('DOMContentLoaded', async () => {
    // [TOKEN] Ambil dari URL dulu (?token=...), fallback ke localStorage kalau user refresh/buka lagi tanpa query string
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token') || localStorage.getItem('inv_token');

    if (!token) {
        document.body.innerHTML = '<p style="text-align:center;padding:60px;color:#999;">Invoice tidak ditemukan. Silakan pesan tiket terlebih dahulu.</p>';
        return;
    }
    localStorage.setItem('inv_token', token); // simpan lagi biar reload tanpa query tetap jalan

    // -----------------------------------------------------------------------
    // [FIX QRIS DINAMIS] Generate QR via Edge Function "generate-qris"
    // (pengganti handleGeneralOrder() di utils.gs lama yang manggil QRISKU).
    // Amount baru bisa dikirim setelah order data ke-load, makanya dipanggil
    // di bawah—bukan langsung di awal seperti versi statis sebelumnya.
    // Fallback otomatis ke QRIS statis kalau edge function gagal/timeout,
    // supaya halaman payment tetap bisa dipakai meski QRISKU down.
    // -----------------------------------------------------------------------
    async function renderQris(totalHarga) {
        const qrisImgEl    = document.getElementById('qris-image');
        const qrisLoaderEl = document.getElementById('qris-loader');

        try {
            const { data, error } = await sb.functions.invoke('generate-qris', {
                body: { amount: totalHarga }
            });

            if (error || !data || data.status !== 'success' || !data.qris_base64) {
                throw new Error('generate-qris gagal/kosong');
            }

            if (qrisImgEl) {
                qrisImgEl.src           = `data:image/png;base64,${data.qris_base64}`;
                qrisImgEl.style.display = "block";
            }
        } catch (err) {
            console.error("QRIS dinamis gagal, fallback ke statis:", err);
            // [FALLBACK] QRIS statis — user tetap bisa scan, tapi nominal harus diisi manual
            const QRIS_STATIC_PAYLOAD = "00020101021126570011ID.DANA.WWW011893600915302440156402090244015640303UMI51440014ID.CO.QRIS.WWW0215ID10265173474270303UMI5204581353033605802ID5917Erwin berkah jaya6011Kab. Bekasi6105177116304BE03";
            if (qrisImgEl) {
                qrisImgEl.src           = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(QRIS_STATIC_PAYLOAD)}`;
                qrisImgEl.style.display = "block";
            }
        } finally {
            if (qrisLoaderEl) qrisLoaderEl.style.display = "none";
        }
    }

    // -----------------------------------------------------------------------
    // Load order data dari Supabase (dengan IDOR second-factor via kontak WA)
    // -----------------------------------------------------------------------
    async function loadOrderData() {
    const { data, error } = await sb.rpc('get_order_status_by_token', { p_token: token });
    if (error || !data || data.length === 0) {
        console.error("Gagal ambil data order:", error);
        return null;
    }
    return data[0];
}

    // -----------------------------------------------------------------------
    // Render header invoice (info pemesan, total, dll)
    // -----------------------------------------------------------------------
    function renderInvoiceHeader(order) {
        const elNama   = document.getElementById('pay-nama');
        const elKontak = document.getElementById('pay-kontak');
        const elTier   = document.getElementById('pay-tier');
        const elJumlah = document.getElementById('pay-jumlah');
        const elTotal  = document.getElementById('pay-total');
        const elDate   = document.querySelector('.invoice-date');

        // [XSS FIX] Bangun nama dengan DOM, bukan template string langsung ke innerHTML
        if (elNama) {
            elNama.innerHTML = ''; // clear dulu
            const daftarNama = (order.qr_data || []).map(t => t.nama_pengunjung);
            const namaKepala = document.createElement('span');
            namaKepala.style.cssText = 'font-size:15px;font-weight:700;color:#ffffff;';
            namaKepala.textContent = daftarNama[0] || order.nama_pemesan; // [XSS FIX] .textContent
            elNama.appendChild(namaKepala);
            daftarNama.slice(1).forEach(nama => {
                const div = document.createElement('div');
                div.style.cssText = 'font-size:11px;color:#999999;font-weight:400;margin-top:3px;padding-left:4px;';
                div.textContent = `└ • ${nama}`; // [XSS FIX] .textContent
                elNama.appendChild(div);
            });
        }

        // [XSS FIX] Semua data dari DB pakai .textContent / .innerText
        if (elKontak) elKontak.textContent = order.kontak_wa;
        if (elTier)   elTier.textContent   = String(order.tier_key).toUpperCase();
        if (elJumlah) elJumlah.textContent = `${order.jumlah_tiket} Tiket`;
        if (elTotal)  elTotal.textContent  = "Rp " + Number(order.total_harga).toLocaleString('id-ID');

        // [XSS FIX] Bangun invoice date dengan DOM
        if (elDate) {
            elDate.textContent = 'ID Invoice: ';
            const kodeEl = document.createElement('strong');
            kodeEl.style.cssText = 'color:#CD0100;letter-spacing:1px;';
            kodeEl.textContent = order.invoice_code; // [XSS FIX] .textContent
            elDate.appendChild(kodeEl);
        }
    }

    // -----------------------------------------------------------------------
    // Render tiket landscape setelah pembayaran LUNAS
    // -----------------------------------------------------------------------
    function renderTiketLandscape(order) {
        const invoiceGridWrapper = document.querySelector('.invoice-grid');
        if (!invoiceGridWrapper) return;

        // [FIX BUG] Sebelumnya #pay-status di-update di sini, TAPI 3 baris di bawah
        // (invoiceGridWrapper.parentNode.innerHTML = ...) langsung menghapus total
        // seluruh isi <main>, termasuk elemen #pay-status ini — jadi update di atas
        // sia-sia dan gak pernah kelihatan user. Badge "LUNAS" sekarang di-render
        // langsung di dalam template tiketHtml di bawah.

        // Font Bebas Neue + Inter sudah dimuat lewat <head> halaman ini,
        // jadi gak perlu lagi inject font Orbitron/Share Tech Mono terpisah.

        let tiketHtml = "";
        (order.qr_data || []).forEach((tiket) => {
            const urlQr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=5&data=${encodeURIComponent(tiket.qr_code)}`;
            // [XSS NOTE] Nama pengunjung dan data lain dari DB di-escape secara manual
            // karena dipakai di dalam template literal innerHTML tiket card
            const safeNama    = escapeHtml(tiket.nama_pengunjung.trim().toUpperCase());
            const safeTier    = escapeHtml(String(order.tier_key).toUpperCase());
            const safeInvoice = escapeHtml(order.invoice_code);
            const safeQrCode  = escapeHtml(tiket.qr_code);

            tiketHtml += `
            <div class="h-ticket-card">
                <div class="h-hud-corner h-tl"></div>
                <div class="h-hud-corner h-tr"></div>
                <div class="h-hud-corner h-bl"></div>
                <div class="h-hud-corner h-br"></div>
                <div class="h-left-panel">
                    <div class="h-brand-row">
                        <div class="h-logo-txt">TUMBUK<span style="color:#CD0100;">SISWA</span></div>
                        <div class="h-event-tag">VOL. 4 / 2026</div>
                    </div>
                    <div class="h-info-box">
                        <div class="h-mini-lbl">// COMPETITOR_NAME</div>
                        <div class="h-main-val h-name-txt">${safeNama}</div>
                    </div>
                    <div class="h-flex-row">
                        <div class="h-info-box">
                            <div class="h-mini-lbl">// ARENA_ZONE</div>
                            <div class="h-main-val h-tier-txt">${safeTier} RING</div>
                        </div>
                        <div class="h-info-box">
                            <div class="h-mini-lbl">// INVOICE_REF</div>
                            <div class="h-main-val" style="font-family:'Inter', sans-serif; color:#888888; font-size:14px;">${safeInvoice}</div>
                        </div>
                    </div>
                    <div class="h-footer-lbl">
                        [SECURITY NOTE] ACCESS PASS ACTIVE. UNIQUE ID MATRIX ALLOWS FOR SINGLE SCAN ENTRY VALIDATION AT THE MAIN GATE.
                    </div>
                </div>
                <div class="h-right-panel">
                    <div class="h-vertical-tag">GATE PASS</div>
                    <div class="h-qr-border">
                        <img class="h-qr-img" src="${urlQr}" alt="Secure QR">
                    </div>
                    <div class="h-qr-code-str">${safeQrCode}</div>
                </div>
            </div>
            `;
        });

        invoiceGridWrapper.parentNode.innerHTML = `
            <style>
                .success-title-zone { text-align: center; margin-bottom: 30px; animation: fadeIn 0.5s ease-out; }
                .success-title-zone h2 { font-family: 'Bebas Neue', sans-serif; font-size: 32px; color: #00ff66; text-transform: uppercase; margin: 0; letter-spacing: 1px; }
                .success-title-zone p  { font-size: 13px; color: #999999; margin: 6px 0 0 0; }
                .action-download-area  { text-align: center; margin-bottom: 40px; }
                .btn-save-ticket-pdf {
                    background-color: #CD0100; color: #ffffff; border: none;
                    font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 700;
                    padding: 14px 32px; cursor: pointer; letter-spacing: 2px;
                    box-shadow: 0 0 20px rgba(205, 1, 0, 0.5); border-radius: 6px;
                    text-transform: uppercase; transition: all 0.2s;
                }
                .btn-save-ticket-pdf:hover { background-color: #ff002a; transform: translateY(-1px); }
                .h-ticket-card {
                    width: 100%; max-width: 700px; height: 310px; margin: 0 auto 30px auto;
                    background-color: #0a0a0a; border: 2px solid #1c1c1c; position: relative;
                    display: flex; overflow: hidden; box-shadow: 0px 10px 30px rgba(0,0,0,0.5);
                    animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .h-ticket-card::before {
                    content: ''; position: absolute; top: -15px; left: -15px;
                    width: 30px; height: 30px; background-color: #060606;
                    transform: rotate(45deg); border-right: 2px solid #1c1c1c; z-index: 2;
                }
                .h-hud-corner { position: absolute; width: 12px; height: 12px; border-color: #CD0100; border-style: solid; z-index: 5; }
                .h-tl { top: 12px; left: 12px;   border-width: 3px 0 0 3px; }
                .h-tr { top: 12px; right: 12px;  border-width: 3px 3px 0 0; }
                .h-bl { bottom: 12px; left: 12px;  border-width: 0 0 3px 3px; }
                .h-br { bottom: 12px; right: 12px; border-width: 0 3px 3px 0; }
                .h-left-panel  { flex: 1; padding: 25px 30px; display: flex; flex-direction: column; justify-content: space-between; border-right: 2px dashed #1f1f1f; position: relative; }
                .h-brand-row   { display: flex; justify-content: space-between; align-items: center; }
                .h-logo-txt    { font-family: 'Bebas Neue', sans-serif; font-size: 26px; font-weight: 400; letter-spacing: 0.5px; color: #fff; }
                .h-event-tag   { font-family: 'Inter', sans-serif; font-size: 11px; color: #ff002a; letter-spacing: 2px; font-weight: bold; }
                .h-flex-row    { display: flex; gap: 15px; }
                .h-info-box    { background: #111111; border: 1px solid #1f1f1f; padding: 10px 14px; flex: 1; position: relative; margin-top: 10px; }
                .h-info-box::after { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: #CD0100; }
                .h-mini-lbl    { font-family: 'Inter', sans-serif; font-size: 9px; color: #555555; text-transform: uppercase; letter-spacing: 2px; font-weight: bold; }
                .h-main-val    { font-size: 14px; font-weight: 700; text-transform: uppercase; margin-top: 2px; color: #ffffff; }
                .h-name-txt    { font-family: 'Bebas Neue', sans-serif; font-size: 24px; font-weight: 400; letter-spacing: 0.5px; }
                .h-tier-txt    { font-family: 'Bebas Neue', sans-serif; font-size: 24px; font-weight: 400; color: #CD0100; text-shadow: 0 0 8px rgba(205, 1, 0, 0.4); }
                .h-footer-lbl  { font-family: 'Inter', sans-serif; font-size: 8px; color: #333333; line-height: 1.3; border-top: 1px dashed #262626; padding-top: 8px; text-transform: uppercase; }
                .h-right-panel { width: 190px; background-color: #0d0d0d; padding: 25px 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
                .h-qr-border   { padding: 10px; border: 2px solid #CD0100; background-color: #050505; box-shadow: 0 0 15px rgba(205, 1, 0, 0.2); margin-bottom: 8px; }
                .h-qr-img      { width: 125px; height: 125px; display: block; border: 3px solid #ffffff; background: #ffffff; }
                .h-qr-code-str { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: bold; letter-spacing: 2px; color: #ffffff; text-align: center; }
                .h-vertical-tag { font-family: 'Inter', sans-serif; font-size: 8px; font-weight: 700; color: #222; letter-spacing: 4px; transform: rotate(90deg); position: absolute; right: -28px; top: 45%; text-transform: uppercase; }
                @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                @media print {
                    body { background-color: #030303 !important; padding: 0 !important; }
                    .navbar, .secure-tag, .success-title-zone, .action-download-area, .footer-mini { display: none !important; }
                    .payment-container { padding-top: 0 !important; padding-bottom: 0 !important; }
                    .h-ticket-card { margin: 40px auto !important; page-break-after: always !important; box-shadow: none !important; border: 2px solid #1c1c1c !important; }
                    @page { size: landscape; margin: 0; }
                }
                    @media (max-width: 640px) {
    .h-ticket-card {
        flex-direction: column;
        height: auto;
        max-width: 100%;
    }
    .h-left-panel {
        border-right: none;
        border-bottom: 2px dashed #1f1f1f;
        padding: 20px;
    }
    .h-flex-row {
        flex-wrap: wrap;
    }
    .h-right-panel {
        width: 100%;
        padding: 20px 15px 25px;
    }
    .h-vertical-tag {
        display: none;
    }
}
            </style>
            <div class="success-title-zone">
                <span style="display:inline-block;color:#00ff66;font-weight:700;font-size:12px;letter-spacing:1px;margin-bottom:10px;">LUNAS ✓</span>
                <h2>✓ PEMBAYARAN VALID</h2>
                <p>Tiket resmi kamu sudah aktif. Screenshot atau cetak kartu akses di bawah ini sebelum hari H.</p>
            </div>
            <div class="action-download-area">
                <button class="btn-save-ticket-pdf" onclick="window.print()">// CETAK_ATAU_SAVE_PDF</button>
            </div>
            ${tiketHtml}
        `;
    }

    // -----------------------------------------------------------------------
    // Helper: escape HTML untuk data yang masuk ke innerHTML tiket card
    // -----------------------------------------------------------------------
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // -----------------------------------------------------------------------
    // Render status menunggu + last checked timestamp
    // -----------------------------------------------------------------------
    function renderStatusMenunggu() {
        const now = new Date().toLocaleTimeString('id-ID');
        const elLastCheck = document.getElementById('last-checked');
        if (elLastCheck) elLastCheck.textContent = `Terakhir dicek: ${now}`;
    }

    // -----------------------------------------------------------------------
    // Load awal
    // -----------------------------------------------------------------------
    const initialOrder = await loadOrderData();
    if (!initialOrder) {
        document.body.innerHTML = '<p style="text-align:center;padding:60px;color:#999;">Invoice tidak ditemukan atau nomor WA tidak cocok. Silakan pesan ulang tiket.</p>';
        return;
    }
    renderInvoiceHeader(initialOrder);

    if (initialOrder.payment_status === 'PAID') {
        // Langsung render tiket
        renderTiketLandscape(initialOrder);
    } else {
        // [FIX QRIS DINAMIS] Baru sekarang amount-nya ketahuan, generate QR-nya
        renderQris(initialOrder.total_harga);

        // ----------------------------------------------------------------
        // POLLING dengan visibilitychange interrupsi + timeout 30 menit
        // ----------------------------------------------------------------
        const POLL_INTERVAL_MS  = 5000;          // 5 detik
        const MAX_POLL_DURATION = 30 * 60 * 1000; // 30 menit
        const pollStartTime     = Date.now();
        let   pollingIntervalId = null;

        renderStatusMenunggu(); // render timestamp awal

        // Tombol WA bantuan (ganti tombol "Kembali & Ubah" yang berbahaya)
        const btnUbah = document.getElementById('btn-ubah-pesanan');
        if (btnUbah) {
            btnUbah.textContent = '💬 Butuh Bantuan? Hubungi Admin';
            btnUbah.style.cssText = 'background:#1a1a1a;border:1px solid #333;color:#999;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;';
            btnUbah.onclick = (e) => {
                e.preventDefault();
                const NO_ADMIN_WA = "6283890435689";
                const teks = `Halo Kak, saya butuh bantuan terkait order tiket Tumbuk Siswa.\n\nNo. Invoice: *${initialOrder.invoice_code}*\n\nMohon bantuannya. Terima kasih!`;
                window.open(`https://wa.me/${NO_ADMIN_WA}?text=${encodeURIComponent(teks)}`, '_blank');
            };
        }

        function mulaiPolling() {
            if (pollingIntervalId) return; // sudah berjalan, skip
            pollingIntervalId = setInterval(async () => {
                // [FIX] Stop polling setelah 30 menit
                if (Date.now() - pollStartTime > MAX_POLL_DURATION) {
                    clearInterval(pollingIntervalId);
                    pollingIntervalId = null;
                    const elLastCheck = document.getElementById('last-checked');
                    if (elLastCheck) elLastCheck.textContent = 'Polling otomatis berakhir (30 menit). Refresh halaman jika sudah bayar.';
                    return;
                }

                const order = await loadOrderData();
                renderStatusMenunggu(); // update timestamp

                if (order && order.payment_status === 'PAID') {
                    clearInterval(pollingIntervalId);
                    pollingIntervalId = null;
                    renderTiketLandscape(order);
                }
            }, POLL_INTERVAL_MS);
        }

        function hentikanPolling() {
            if (pollingIntervalId) {
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
            }
        }

        // [FIX] Pause polling saat tab tidak aktif, resume saat aktif kembali
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                hentikanPolling();
            } else {
                mulaiPolling();
            }
        });

        // Start polling awal
        mulaiPolling();
    }

    // -----------------------------------------------------------------------
    // Tombol konfirmasi WA (tombol utama kirim bukti transfer)
    // -----------------------------------------------------------------------
    const btnWa = document.getElementById('btn-wa-confirm');
    if (btnWa) {
        btnWa.addEventListener('click', () => {
            const NO_ADMIN_WA = "62895330829033";

            const daftarNama  = (initialOrder.qr_data || []).map(t => t.nama_pengunjung);
            const namaDisplay = daftarNama.length > 1
                ? `${daftarNama[0]} (+ ${daftarNama.length - 1} rekan: ${daftarNama.slice(1).join(', ')})`
                : (daftarNama[0] || initialOrder.nama_pemesan);

            const totalFormatted = "Rp " + Number(initialOrder.total_harga).toLocaleString('id-ID');

            const teksPesan = [
                `Halo Kak, saya mau konfirmasi pembayaran tiket *Tumbuk Siswa Vol. 4* 🥊`,
                ``,
                `*📋 DETAIL TRANSAKSI:*`,
                `• No. Invoice : *${initialOrder.invoice_code}*`,
                `• Nama        : ${namaDisplay}`,
                `• No. WA      : ${initialOrder.kontak_wa}`,
                `• Kategori    : ${String(initialOrder.tier_key).toUpperCase()}`,
                `• Jumlah      : ${initialOrder.jumlah_tiket} Tiket`,
                `• Total Bayar : *${totalFormatted}*`,
                ``,
                `Bukti transfer sudah saya kirimkan. Mohon segera dikonfirmasi ya, Kak. Terima kasih! 🙏`
            ].join('\n');

            window.open(`https://wa.me/${NO_ADMIN_WA}?text=${encodeURIComponent(teksPesan)}`, '_blank');
        });
    }
});