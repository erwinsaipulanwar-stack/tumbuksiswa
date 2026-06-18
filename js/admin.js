document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('admin-login-overlay');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('btn-login-submit');
    const errorMsg = document.getElementById('login-error-msg');
    
    // Taruh URL Apps Script Baru Lu Di Sini Win!
    const scriptUrl = "https://script.google.com/macros/s/AKfycbzSHFpF2lG20vElXU11zeUMmSWZ5YN5yDKln4QPPQB-Ydxd76qJQOmn31SyypSBSouaEw/exec";

    if (sessionStorage.getItem('admin_authenticated') === 'true') {
        if (loginOverlay) loginOverlay.style.display = 'none';
        loadDataDashboard(sessionStorage.getItem('admin_key'));
    }

    if (loginBtn) loginBtn.addEventListener('click', prosesLogin);
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') prosesLogin(); });
    }

    function prosesLogin() {
        const passTarget = passwordInput.value;
        if(loginBtn) { loginBtn.innerText = "Authorizing..."; loginBtn.disabled = true; }

        fetch(`${scriptUrl}?p=${encodeURIComponent(passTarget)}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
                sessionStorage.setItem('admin_authenticated', 'true');
                sessionStorage.setItem('admin_key', passTarget);
                if (loginOverlay) loginOverlay.style.display = 'none';
                renderTable(data.pesanan);
                hitungStatistik(data.pesanan, data.kuota);
            } else {
                errorMsg.style.display = 'block';
                passwordInput.value = ""; passwordInput.focus();
            }
        })
        .finally(() => { if(loginBtn) { loginBtn.innerText = "Authorize →"; loginBtn.disabled = false; } });
    }

    function loadDataDashboard(pass) {
        fetch(`${scriptUrl}?p=${encodeURIComponent(pass)}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
                renderTable(data.pesanan);
                hitungStatistik(data.pesanan, data.kuota);
            }
        });
    }

    function renderTable(orders) {
        const tableBody = document.getElementById('table-body');
        if (!tableBody) return;
        tableBody.innerHTML = "";
        
        if (!orders || orders.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center">Belum ada tiket terpesan.</td></tr>`;
            return;
        }

        orders.forEach(order => {
            const isVerified = order.status && order.status.trim().toLowerCase() === 'y';
            
            let actionBtn = "";
            if (isVerified) {
                actionBtn = `
                    <div style="display:flex; flex-direction:column; gap:5px; align-items:center;">
                        <span style="color: #25d366; font-weight: 700; font-size: 11px;">✓ VERIFIED</span>
                        <button class="print-btn-action" data-id="${order.id_invoice}" data-nama="${order.nama}" data-tier="${order.tier}" style="background-color:#ffffff; color:#000000; border:1px solid #ffffff; padding:4px 10px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; text-transform:uppercase;">Cetak PDF</button>
                    </div>
                `;
            } else {
                actionBtn = `<button class="verify-btn-action" data-id="${order.id_invoice}" data-nama="${order.nama}">Verifikasi</button>`;
            }

            let namaFormatHtml = "";
            const stringNamaMentah = order.nama || "";
            
            if (stringNamaMentah.includes('|')) {
                const arrayNama = stringNamaMentah.split('|');
                const kepalaSuku = arrayNama[0];
                const balaBantuan = arrayNama.slice(1);

                namaFormatHtml = `<strong>${kepalaSuku}</strong>`;
                balaBantuan.forEach(pengikut => {
                    namaFormatHtml += `<div style="font-size: 11px; color: var(--text-gray); font-weight: normal; margin-top: 3px; opacity: 0.8; padding-left: 2px;">└ • ${pengikut}</div>`;
                });
            } else {
                namaFormatHtml = `<strong>${stringNamaMentah || '-'}</strong>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: var(--accent); font-weight:700; font-family:monospace;">${order.id_invoice || '-'}</td>
                <td>${order.waktu || '-'}</td>
                <td>${namaFormatHtml}</td>
                <td><a href="https://wa.me/${order.kontak}" target="_blank" style="color:#25d366;">${order.kontak}</a></td>
                <td><span class="tier-badge badge-${order.tier}">${order.tier}</span></td>
                <td class="text-center" style="font-weight:700;">${order.jumlah}</td>
                <td style="color: var(--accent); font-weight:700;">${order.total}</td>
                <td class="text-center">${actionBtn}</td>
            `;
            tableBody.appendChild(tr);
        });

        document.querySelectorAll('.verify-btn-action').forEach(btn => {
            btn.addEventListener('click', function() {
                const namaFull = this.getAttribute('data-nama');
                const namaKepalaSaja = namaFull.includes('|') ? namaFull.split('|')[0] : namaFull;
                eksekusiVerifikasi(this.getAttribute('data-id'), namaKepalaSaja, this);
            });
        });

        document.querySelectorAll('.print-btn-action').forEach(btn => {
            btn.addEventListener('click', function() {
                generatePdfTiketKolektif(this.getAttribute('data-id'), this.getAttribute('data-nama'), this.getAttribute('data-tier'));
            });
        });
    }

    function eksekusiVerifikasi(idInvoice, nama, buttonEl) {
        if (!confirm(`Verifikasi pesanan dengan ID ${idInvoice} atas nama ${nama}?`)) return;

        buttonEl.innerText = "Loading..."; buttonEl.disabled = true;
        const savedPass = sessionStorage.getItem('admin_key');
        
        fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `action=verifikasi&id_invoice=${encodeURIComponent(idInvoice)}&p=${encodeURIComponent(savedPass)}`
        })
        .then(res => res.json())
        .then(res => {
            if (res.status === "success") {
                alert(`Sukses memvalidasi Invoice ${idInvoice}!`);
                window.location.reload();
            } else {
                alert("Gagal: " + res.message);
                buttonEl.innerText = "Verifikasi"; buttonEl.disabled = false;
            }
        });
    }

    function generatePdfTiketKolektif(idInvoice, namaFull, tier) {
        const daftarNama = namaFull.includes('|') ? namaFull.split('|') : [namaFull];
        const kodeClean = idInvoice.replace('#', ''); 

        const printWindow = window.open('', '_blank');
        
        let htmlContent = `
        <html>
        <head>
            <title>E-Ticket System - ${idInvoice}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=Space+Grotesk:wght@400;700&display=swap');
                body { margin: 0; padding: 0; font-family: 'Space Grotesk', sans-serif; background-color: #ffffff; color: #000000; }
                .ticket-page { width: 100%; max-width: 500px; margin: 40px auto; padding: 30px; box-sizing: border-box; border: 4px solid #000000; position: relative; page-break-after: always; box-shadow: 8px 8px 0px #000000; }
                .header { border-bottom: 4px solid #000000; padding-bottom: 12px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
                .logo { font-family: 'Oswald', sans-serif; font-size: 28px; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; }
                .logo span { color: #CD0100; } 
                .event-sub { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #666666; text-transform: uppercase; }
                .info-row { margin-bottom: 18px; }
                .label { font-size: 10px; color: #666666; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; }
                .value { font-size: 18px; font-weight: 700; text-transform: uppercase; margin-top: 2px; }
                .value-name { font-size: 24px; font-family: 'Oswald', sans-serif; letter-spacing: 0.5px; }
                .value-tier { color: #CD0100; font-family: 'Oswald', sans-serif; font-size: 26px; border-bottom: 2px solid #000000; display: inline-block; padding-bottom: 2px; }
                .qrcode-container { margin-top: 30px; padding: 20px; border: 3px solid #000000; text-align: center; background-color: #ffffff; box-shadow: 4px 4px 0px #CD0100; }
                .qrcode-img { width: 180px; height: 180px; display: block; margin: 0 auto; }
                .ticket-id-text { font-family: monospace; font-size: 14px; font-weight: 700; margin-top: 12px; letter-spacing: 2px; text-transform: uppercase; }
                .footer-notice { margin-top: 30px; font-size: 9px; color: #666666; line-height: 1.5; border-top: 1px solid #000000; padding-top: 12px; text-transform: uppercase; font-weight: 700; }
            </style>
        </head>
        <body>
        `;

        daftarNama.forEach((namaOrang, index) => {
            const nomorUrut = String(index + 1).padStart(2, '0');
            const dataQrUnik = `TS4-${kodeClean}-${nomorUrut}`;
            const urlApiQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(dataQrUnik)}`;

            htmlContent += `
            <div class="ticket-page">
                <div class="header">
                    <div class="logo">TUMBUK<span>SISWA.</span></div>
                    <div class="event-sub">VOL. 4 / 2026</div>
                </div>
                <div class="info-row">
                    <div class="label">NAMA PEMEGANG TIKET</div>
                    <div class="value value-name">${namaOrang.trim().toUpperCase()}</div>
                </div>
                <div class="info-row">
                    <div class="label">KATEGORI KELAS RING</div>
                    <div class="value value-tier">${tier.toUpperCase()}</div>
                </div>
                <div class="info-row" style="display: flex; gap: 40px;">
                    <div>
                        <div class="label">KODE INVOICE</div>
                        <div class="value" style="font-size:15px; font-family:monospace;">${idInvoice}</div>
                    </div>
                    <div>
                        <div class="label">JENIS TIKET</div>
                        <div class="value" style="font-size:15px; color:#666666;">${daftarNama.length > 1 ? 'KOLEKTIF' : 'INDIVIDU'}</div>
                    </div>
                </div>
                <div class="qrcode-container">
                    <img class="qrcode-img" src="${urlApiQrCode}" alt="QR Code ${dataQrUnik}">
                    <div class="ticket-id-text">${dataQrUnik}</div>
                </div>
                <div class="footer-notice">
                    ⚠️ TIKET VALID & RESMI: Jangan melipat atau mencoret area QR Code. Satu kode QR hanya berlaku untuk satu kali pemindaian masuk di pintu gate turnamen. Segala bentuk penggandaan e-ticket tidak akan ditoleransi oleh panitia!
                </div>
            </div>
            `;
        });

        htmlContent += `
        <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 400); };
        </script>
        </body>
        </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    }

    function hitungStatistik(orders, kuotaSisa) {
        let totalRevenue = 0;
        let totalTickets = 0;

        if (orders && orders.length > 0) {
            orders.forEach(order => {
                if (order.status && order.status.trim().toLowerCase() === 'y') {
                    const jumlah = parseInt(order.jumlah) || 0;       
                    const harga = parseInt(order.harga_satuan) || 0;  
                    const rowTotal = jumlah * harga; 
                    totalTickets += jumlah;
                    totalRevenue += rowTotal;
                }
            });
        }

        if (document.getElementById('stat-revenue')) document.getElementById('stat-revenue').innerText = "Rp " + totalRevenue.toLocaleString('id-ID');
        if (document.getElementById('stat-sold')) document.getElementById('stat-sold').innerHTML = `${totalTickets} <small>Biji</small>`;
        
        if (kuotaSisa) {
            if(document.getElementById('q-tribun')) document.getElementById('q-tribun').innerText = kuotaSisa.tribun;
            if(document.getElementById('q-ringside')) document.getElementById('q-ringside').innerText = kuotaSisa.ringside;
            if(document.getElementById('q-vvip')) document.getElementById('q-vvip').innerText = kuotaSisa.vvip;
        }
    }
});