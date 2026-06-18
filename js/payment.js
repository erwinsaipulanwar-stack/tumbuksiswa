document.addEventListener('DOMContentLoaded', () => {
    const idInvoice = localStorage.getItem('inv_id') || "#XXXXXX";
    const namaUser = localStorage.getItem('inv_nama') || "Penonton Tumbuk Siswa";
    const kontakUser = localStorage.getItem('inv_kontak') || "-";
    const tierUser = localStorage.getItem('inv_tier') || "-";
    const jumlahUser = localStorage.getItem('inv_jumlah') || "0";
    const totalUser = localStorage.getItem('inv_total') || "Rp 0";
    const qrisBase64 = localStorage.getItem('inv_qris');

    // Taruh URL Apps Script Baru Lu Di Sini Win!
    const scriptUrl = "https://script.google.com/macros/s/AKfycbzSHFpF2lG20vElXU11zeUMmSWZ5YN5yDKln4QPPQB-Ydxd76qJQOmn31SyypSBSouaEw/exec";

    let namaHtmlPakePengikut = "";
    let templateNamaBuatWa = namaUser;

    if (namaUser.includes('|')) {
        const pecahNama = namaUser.split('|');
        const kepala = pecahNama[0];
        const pengikut = pecahNama.slice(1);

        namaHtmlPakePengikut = `<span style="font-size:15px; font-weight:700; color:#ffffff;">${kepala}</span>`;
        pengikut.forEach(namaAsisten => {
            namaHtmlPakePengikut += `<div style="font-size:11px; color:#999999; font-weight:400; margin-top:3px; padding-left:4px;">└ • ${namaAsisten}</div>`;
        });
        templateNamaBuatWa = `${kepala} (+ Rekan: ${pengikut.join(', ')})`;
    } else {
        namaHtmlPakePengikut = `<span style="font-size:15px; font-weight:700; color:#ffffff;">${namaUser}</span>`;
    }

    if(document.getElementById('pay-nama')) document.getElementById('pay-nama').innerHTML = namaHtmlPakePengikut;
    if(document.getElementById('pay-kontak')) document.getElementById('pay-kontak').innerText = kontakUser;
    if(document.getElementById('pay-tier')) document.getElementById('pay-tier').innerText = tierUser;
    if(document.getElementById('pay-jumlah')) document.getElementById('pay-jumlah').innerText = `${jumlahUser} Tiket`;
    if(document.getElementById('pay-total')) document.getElementById('pay-total').innerText = totalUser;
    
    const dateEl = document.querySelector('.invoice-date');
    if (dateEl) { dateEl.innerHTML = `ID Invoice: <strong style="color: #CD0100; letter-spacing:1px;">${idInvoice}</strong>`; }

    const qrisImgEl = document.getElementById('qris-image');
    const qrisLoaderEl = document.getElementById('qris-loader');

    if (qrisBase64) {
        if (qrisImgEl) { qrisImgEl.src = qrisBase64; qrisImgEl.style.display = "block"; }
        if (qrisLoaderEl) qrisLoaderEl.style.display = "none";
    }

    // ENGINE REAL-TIME AUTO POLLING
    const statusIntervalId = setInterval(() => {
        if (idInvoice === "#XXXXXX") return;

        fetch(`${scriptUrl}?action=cek_status&id_invoice=${encodeURIComponent(idInvoice)}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === "success" && data.payment_status === "y") {
                const badgeStatus = document.getElementById('pay-status');
                if (badgeStatus) {
                    badgeStatus.innerText = "✓ BERHASIL DIVERIFIKASI";
                    badgeStatus.style.backgroundColor = "rgba(0, 255, 102, 0.1)";
                    badgeStatus.style.borderColor = "#00ff66";
                    badgeStatus.style.color = "#00ff66";
                }

                const qrisBoxWrapper = document.getElementById('qris-area-wrapper');
                if (qrisBoxWrapper) {
                    qrisBoxWrapper.innerHTML = `
                        <div style="padding: 30px 0; text-align: center;">
                            <div style="font-size: 60px; margin-bottom: 15px;">🎟️</div>
                            <h3 style="font-family: 'Oswald', sans-serif; font-size: 24px; color: #00ff66; text-transform: uppercase;">Aman, Tiket Valid!</h3>
                            <p style="font-size: 13px; color: #999999; margin-top: 8px; line-height: 1.6; padding: 0 10px;">
                                Pembayaran Anda telah terverifikasi oleh panitia. Slot kuota bangku Anda sudah aman dan terdaftar resmi.
                            </p>
                            <div style="background-color: #161616; border: 1px dashed #CD0100; border-radius: 12px; padding: 14px; margin: 24px auto 0 auto; max-width: 260px; font-family: monospace; font-size: 15px; color: #ffffff;">
                                CODE ID: ${idInvoice}
                            </div>
                            <p style="font-size: 11px; color: #666666; margin-top: 15px;">Silakan screenshot layar ini sebagai bukti masuk pintu gate.</p>
                        </div>
                    `;
                }
                clearInterval(statusIntervalId);
            }
        })
        .catch(err => console.error(err));
    }, 5000);

    const btnWa = document.getElementById('btn-wa-confirm');
    if (btnWa) {
        btnWa.addEventListener('click', () => {
            const NO_ADMIN_WA = "6281234567890"; // Ganti pake nomor WA lu Win
            const teksPesan = `Halo Panitia Tumbuk Siswa!\n\nSaya ingin konfirmasi pembayaran tiket.\n\n*DATA TRANSAKSI:*\n• *ID Invoice: ${idInvoice}*\n• Nama: ${templateNamaBuatWa}\n• No. WA: ${kontakUser}\n• Kategori: ${tierUser.toUpperCase()}\n• Jumlah: ${jumlahUser} Tiket\n• Total: ${totalUser}\n\nMohon segera divalidasi sistem. Terima kasih! 🥊`;
            window.open(`https://wa.me/${NO_ADMIN_WA}?text=${encodeURIComponent(teksPesan)}`, '_blank');
        });
    }
});