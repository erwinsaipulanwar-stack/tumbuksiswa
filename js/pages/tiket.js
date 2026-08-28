/**
 * ==========================================================================
 * TUMBUK SISWA — HALAMAN PESAN TIKET (tiket.js)
 * Versi Supabase — Patch Fase 2:
 *   - Validasi kumpulanNama.length === jumlah tiket (anti-manipulasi DevTools)
 *   - Bypass max 5 tiket diblokir di sisi JS (double validation)
 *   - Data asal_sekolah dibaca dari input dan dikirim ke RPC
 *   - Tidak ada .innerHTML untuk data user (XSS prevention)
 * ==========================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
    const formPesanan = document.querySelector('.main-form') || document.querySelector('form');
    if (!formPesanan) return;

    const inputNama     = document.getElementById('nama');
    const inputKontak   = document.getElementById('kontak') || document.getElementById('whatsapp') || document.getElementById('no_wa') || document.querySelector('input[type="tel"]');
    const inputJumlah   = document.getElementById('jumlah');
    const displayJumlah = document.getElementById('jumlah-display'); // [FIX] Elemen tampilan angka counter
    const btnMinus      = document.getElementById('btn-minus');       // [FIX] Tombol kurang
    const btnPlus       = document.getElementById('btn-plus');        // [FIX] Tombol tambah
    const inputSekolah  = document.getElementById('school'); // [FIX] Baca field sekolah
    const txtTotal      = document.getElementById('total');
    const radioTier     = document.querySelectorAll('input[name="tier"]');
    const waPattern     = /^[0-9]{10,14}$/;

    const MAX_TIKET = 5; // Konstanta, satu sumber kebenaran

    // [FIX URUTAN] Urutan pembukaan tier tiket. Tier berikutnya baru bisa
    // dipilih kalau tier sebelumnya di list ini sudah HABIS (sisa_kuota <= 0).
    // Kalau nambah/ubah tier baru, tinggal sesuaikan urutan id-nya di sini.
    const TIER_ORDER = ['tribun', 'ringside', 'vvip'];

    const tierGrid = document.querySelector('.ticket-options-grid');
    if (tierGrid) tierGrid.style.visibility = 'hidden';

    // Buat container input nama pengikut (tambahan selain kepala pemesan)
    let containerPengikut = document.getElementById('container-pengikut');
    if (inputNama && !containerPengikut) {
        containerPengikut = document.createElement('div');
        containerPengikut.id = 'container-pengikut';
        containerPengikut.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;gap:10px;';
        inputNama.parentNode.insertBefore(containerPengikut, inputNama.nextSibling);
    }

    // -----------------------------------------------------------------------
    // Hitung total harga berdasarkan tier & jumlah yang dipilih
    // -----------------------------------------------------------------------
    function hitungTotal() {
        const tierTerpilih = document.querySelector('input[name="tier"]:checked');
        if (!tierTerpilih || !txtTotal) return;
        const hargaSatuan = parseInt(tierTerpilih.value) || 0;
        const jumlah      = parseInt(inputJumlah.value) || 0;
        txtTotal.innerText = "Rp " + (hargaSatuan * jumlah).toLocaleString('id-ID');
    }

    // -----------------------------------------------------------------------
    // Update input nama pengikut sesuai jumlah tiket
    // -----------------------------------------------------------------------
    function updateInputNamaPengikut() {
        if (!containerPengikut || !inputJumlah) return;
        containerPengikut.innerHTML = '';
        const jumlah = parseInt(inputJumlah.value) || 1;

        // [FIX] Clamp jumlah di sisi JS juga, jangan percaya nilai HTML attr saja
        if (jumlah < 1 || jumlah > MAX_TIKET) return;

        if (jumlah > 1) {
            for (let i = 2; i <= jumlah; i++) {
                const divGroup = document.createElement('div');
                divGroup.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

                const label = document.createElement('label');
                label.innerText = `Nama Pengunjung ${i} (Pengikut)`;
                label.style.cssText = 'font-size:11px;color:#999;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;';

                const input = document.createElement('input');
                input.type        = 'text';
                input.className   = 'nama-pengikut';
                input.placeholder = `Masukkan nama rekan ke-${i}...`;
                input.required    = true;
                input.style.cssText = 'padding:14px;background-color:#161616;border:1px solid #262626;border-radius:8px;color:#fff;font-size:14px;';

                divGroup.appendChild(label);
                divGroup.appendChild(input);
                containerPengikut.appendChild(divGroup);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Cek kuota & harga real-time dari Supabase
    // -----------------------------------------------------------------------
    async function cekKuotaOtomatis() {
        try {
            const { data, error } = await sb.rpc('get_tier_availability');
            if (error) throw error;

            // Ubah jadi map biar bisa diproses SESUAI URUTAN TIER_ORDER,
            // bukan urutan balikan dari database (yang gak dijamin konsisten).
            const dataByKey = {};
            data.forEach(tier => { dataByKey[tier.tier_key] = tier; });

            // [FIX URUTAN] Tier pertama di TIER_ORDER selalu boleh dibuka.
            // Tier selanjutnya cuma kebuka kalau tier SEBELUMNYA sudah habis.
            let previousHabis = true;

            TIER_ORDER.forEach(tierKey => {
                const tier = dataByKey[tierKey];
                const inputRadio = document.getElementById(tierKey);
                if (!tier || !inputRadio) return;

                inputRadio.value = tier.harga;

                const labelCard = document.querySelector(`label[for="${tierKey}"]`);
                if (!labelCard) return;

                // [XSS FIX] Gunakan .innerText, bukan .innerHTML untuk data dari DB
                const txtHarga = labelCard.querySelector('.price');
                if (txtHarga) txtHarga.innerText = "Rp " + Number(tier.harga).toLocaleString('id-ID');

                const elNama = labelCard.querySelector('h3');
                if (elNama) elNama.innerText = tier.nama_tampil; // [XSS FIX]

                const txtStatus = labelCard.querySelector('.ticket-status');
                const sisa      = tier.sisa_kuota;
                const habis     = sisa <= 0;

                // Reset state biar gak numpuk class dari render sebelumnya
                labelCard.classList.remove('sold-out', 'locked');
                inputRadio.disabled = false;

                if (habis) {
                    inputRadio.disabled = true;
                    inputRadio.checked  = false;
                    labelCard.classList.add('sold-out');
                    if (txtStatus) { txtStatus.innerText = "HABIS"; txtStatus.style.color = ""; }
                } else if (!previousHabis) {
                    // Tier sebelumnya belum habis -> tier ini belum boleh dibuka
                    inputRadio.disabled = true;
                    inputRadio.checked  = false;
                    labelCard.classList.add('locked');
                    if (txtStatus) { txtStatus.innerText = "BELUM DIBUKA"; txtStatus.style.color = ""; }
                } else if (sisa <= 17) {
                    if (txtStatus) { txtStatus.innerText = "HAMPIR HABIS"; txtStatus.style.color = "#CD0100"; }
                } else if (sisa <= 33) {
                    if (txtStatus) { txtStatus.innerText = "SEBAGIAN HABIS"; txtStatus.style.color = "#ffcc00"; }
                } else {
                    if (txtStatus) { txtStatus.innerText = "TERSEDIA"; txtStatus.style.color = "#00ff66"; }
                }

                // Tier berikutnya boleh kebuka HANYA kalau tier ini beneran habis.
                previousHabis = habis;
            });

            // Kalau tier yang lagi ke-checked jadi disabled (habis/terkunci),
            // otomatis pindahin pilihan ke tier pertama yang masih bisa dipilih.
            const checkedNow = document.querySelector('input[name="tier"]:checked');
            if (!checkedNow || checkedNow.disabled) {
                const firstAvailable = document.querySelector('input[name="tier"]:not(:disabled)');
                if (firstAvailable) firstAvailable.checked = true;
            }

            hitungTotal();
        } catch (err) {
            console.error("Gagal ambil data tier:", err);
        } finally {
            if (tierGrid) tierGrid.style.visibility = 'visible';
        }
    }

    // -----------------------------------------------------------------------
    // [FIX] Set jumlah tiket terpusat: clamp, update hidden input, update
    // tampilan angka (#jumlah-display), lalu recalc total & form pengikut.
    // Sebelumnya cuma inputJumlah.value yang di-update, tapi #jumlah sekarang
    // type="hidden" jadi event 'input' bawaan browser gak pernah nyala saat
    // tombol +/- diklik — makanya klik +/- kelihatan gak ngefek.
    // -----------------------------------------------------------------------
    function setJumlah(nilaiBaru) {
        let val = parseInt(nilaiBaru) || 1;
        if (val < 1)         val = 1;
        if (val > MAX_TIKET) val = MAX_TIKET;
        inputJumlah.value = val;
        if (displayJumlah) displayJumlah.textContent = val;

        // Nonaktifkan tombol pas udah mentok batas atas/bawah
        if (btnMinus) btnMinus.disabled = val <= 1;
        if (btnPlus)  btnPlus.disabled  = val >= MAX_TIKET;

        hitungTotal();
        updateInputNamaPengikut();
    }

    // -----------------------------------------------------------------------
    // Event listeners
    // -----------------------------------------------------------------------
    if (btnMinus) {
        btnMinus.addEventListener('click', () => {
            setJumlah((parseInt(inputJumlah.value) || 1) - 1);
        });
    }
    if (btnPlus) {
        btnPlus.addEventListener('click', () => {
            setJumlah((parseInt(inputJumlah.value) || 1) + 1);
        });
    }
    if (inputJumlah) {
        // Tetap dipertahankan buat jaga-jaga kalau value di-set programmatic
        // lewat dispatchEvent('input') di tempat lain.
        inputJumlah.addEventListener('input', () => setJumlah(inputJumlah.value));
    }
    radioTier.forEach(radio => radio.addEventListener('change', hitungTotal));

    // -----------------------------------------------------------------------
    // [FIX ATURAN] Modal syarat & ketentuan sebelum lanjut ke pembayaran.
    // Data pesanan yang udah divalidasi ditampung dulu di pendingOrderPayload,
    // baru dikirim ke server pas user centang setuju & klik konfirmasi.
    // -----------------------------------------------------------------------
    let pendingOrderPayload = null;

    const rulesModal      = document.getElementById('rules-modal');
    const rulesCloseBtn   = document.getElementById('rules-close');
    const rulesDeclineBtn = document.getElementById('rules-decline');
    const rulesCheckbox   = document.getElementById('rules-agree-checkbox');
    const btnConfirmRules = document.getElementById('btn-confirm-rules');

    function bukaRulesModal() {
        if (!rulesModal) return;
        if (rulesCheckbox)   rulesCheckbox.checked = false;
        if (btnConfirmRules) {
            btnConfirmRules.disabled  = true;
            btnConfirmRules.innerText = "Setuju";
        }
        rulesModal.style.display = 'flex';
    }

    function tutupRulesModal() {
        if (!rulesModal) return;
        rulesModal.style.display = 'none';
    }

    if (rulesCheckbox && btnConfirmRules) {
        rulesCheckbox.addEventListener('change', () => {
            btnConfirmRules.disabled = !rulesCheckbox.checked;
        });
    }

    if (rulesCloseBtn)   rulesCloseBtn.addEventListener('click', tutupRulesModal);
    if (rulesDeclineBtn) rulesDeclineBtn.addEventListener('click', tutupRulesModal);
    if (rulesModal) {
        rulesModal.addEventListener('click', (e) => {
            if (e.target === rulesModal) tutupRulesModal();
        });
    }

    // Baru eksekusi checkout ke Supabase setelah user setuju aturan
    if (btnConfirmRules) {
        btnConfirmRules.addEventListener('click', async () => {
            if (!rulesCheckbox || !rulesCheckbox.checked || !pendingOrderPayload) return;

            btnConfirmRules.disabled  = true;
            btnConfirmRules.innerText = "Memproses...";

            try {
                const { data, error } = await sb.rpc('checkout_order', pendingOrderPayload);
                if (error) throw error;

                const result = data[0];

// [TOKEN] Simpan token akses (fallback kalau URL query hilang), lalu redirect pakai token di URL
localStorage.setItem('inv_token', result.access_token);

window.location.href = 'payment.html?token=' + result.access_token;
            } catch (err) {
                console.error(err);
                alert('Gagal membuat pesanan: ' + (err.message || 'Terjadi kesalahan, coba lagi.'));
                btnConfirmRules.disabled  = false;
                btnConfirmRules.innerText = "Setuju";
            }
        });
    }

    // -----------------------------------------------------------------------
    // Form submit handler
    // -----------------------------------------------------------------------
    formPesanan.addEventListener('submit', async function (event) {
        event.preventDefault();

        // Validasi nomor WA
        if (!inputKontak || !waPattern.test(inputKontak.value)) {
            alert('Nomor WhatsApp tidak valid! Masukkan 10-14 digit angka.');
            if (inputKontak) inputKontak.focus();
            return;
        }

        // Validasi tier dipilih
        const tierTerpilih = document.querySelector('input[name="tier"]:checked');
        if (!tierTerpilih) {
            alert('Pilih kategori tiket terlebih dahulu!');
            return;
        }

        const namaKepala = inputNama ? inputNama.value.trim() : '';
        if (!namaKepala) {
            alert('Nama lengkap wajib diisi!');
            return;
        }

        const kontakUser   = inputKontak.value.trim();
        const infoTier     = tierTerpilih.id;
        const asalSekolah  = inputSekolah ? inputSekolah.value.trim() : null; // [FIX] Baca field sekolah

        // [FIX] Ambil semua nama pengunjung termasuk kepala
        let kumpulanNama = [namaKepala];
        document.querySelectorAll('.nama-pengikut').forEach(inputan => {
            const trimmed = inputan.value.trim();
            if (trimmed !== '') kumpulanNama.push(trimmed);
        });

        const jumlahInput = parseInt(inputJumlah.value) || 1;

        // [FIX BYPASS] Blokir di level JS sebelum kirim ke RPC
        if (jumlahInput < 1 || jumlahInput > MAX_TIKET) {
            alert(`Jumlah tiket harus antara 1 hingga ${MAX_TIKET}.`);
            return;
        }

        // [FIX VALIDASI] Pastikan jumlah nama pengunjung = jumlah tiket yang dipesan
        if (kumpulanNama.length !== jumlahInput) {
            alert(`Kamu memesan ${jumlahInput} tiket tapi hanya mengisi ${kumpulanNama.length} nama pengunjung. Mohon lengkapi nama semua pengunjung.`);
            return;
        }

        // [FIX ATURAN] Jangan langsung checkout — tampung dulu payload-nya,
        // lalu wajibkan user setuju syarat & ketentuan via modal dulu.
        pendingOrderPayload = {
            p_nama_pemesan:    namaKepala,
            p_kontak_wa:       kontakUser,
            p_tier_key:        infoTier,
            p_nama_pengunjung: kumpulanNama,
            p_asal_sekolah:    asalSekolah || null // [FIX] Kirim data sekolah
        };

        bukaRulesModal();
    });

    // -----------------------------------------------------------------------
    // Realtime: kuota & harga tiket update otomatis tanpa refresh manual
    // -----------------------------------------------------------------------
    sb.channel('tiket-kuota-live')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'orders' },
            () => cekKuotaOtomatis()
        )
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'pricing_tiers' },
            () => cekKuotaOtomatis()
        )
        .subscribe();

    // Init
    cekKuotaOtomatis();
    setJumlah(inputJumlah ? inputJumlah.value : 1); // [FIX] set state awal tombol +/- & display
});