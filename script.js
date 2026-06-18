const inputJumlah = document.getElementById('jumlah');
const txtTotal = document.getElementById('total');
const radioTier = document.querySelectorAll('input[name="tier"]');
const formPesanan = document.querySelector('form');
const inputKontak = document.getElementById('kontak');

const galleryImages = document.querySelectorAll('.gallery-grid img');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const closeBtn = document.querySelector('.lightbox-close');
const prevBtn = document.querySelector('.lightbox-prev');
const nextBtn = document.querySelector('.lightbox-next');
let activeImageIndex = 0;

const slides = document.querySelectorAll('.hero-slider .slide');
let currentSlide = 0;

const scriptUrl = "https://script.google.com/macros/s/AKfycbzSHFpF2lG20vElXU11zeUMmSWZ5YN5yDKln4QPPQB-Ydxd76qJQOmn31SyypSBSouaEw/exec";

function hitungTotal() {
    const tierTerpilih = document.querySelector('input[name="tier"]:checked');
    if (!tierTerpilih) return;

    const hargaSatuan = parseInt(tierTerpilih.value);
    const jumlah = parseInt(inputJumlah.value) || 0;
    const totalHarga = hargaSatuan * jumlah;

    txtTotal.innerText = "Rp " + totalHarga.toLocaleString('id-ID');
}

function cekKuotaOtomatis() {
    radioTier.forEach(radio => {
        radio.disabled = false;
        const labelCard = document.querySelector(`label[for="${radio.id}"]`);
        if (labelCard) {
            labelCard.classList.remove('sold-out');
            const txtStatus = labelCard.querySelector('.ticket-status');
            if (txtStatus) txtStatus.innerText = "TERSEDIA";
        }
    });

    fetch(scriptUrl)
    .then(response => response.json())
    .then(data => {
        if (data.status === "success") {
            const kuota = data.kuota;
            console.log("Data Kuota Riil dari Sheets:", kuota);

            for (let tierId in kuota) {
                const inputRadio = document.getElementById(tierId);
                if (!inputRadio) continue;
                
                const labelCard = document.querySelector(`label[for="${tierId}"]`);
                const txtStatus = labelCard.querySelector('.ticket-status');
                
                if (kuota[tierId] <= 0) {
                    inputRadio.disabled = true;
                    inputRadio.checked = false; 
                    labelCard.classList.add('sold-out');
                    if (txtStatus) txtStatus.innerText = "HABIS";
                } else {
                    if (txtStatus) txtStatus.innerText = `TERSEDIA (${kuota[tierId]})`;
                }
            }
            hitungTotal();
        }
    })
    .catch(error => console.error("Gagal memuat kuota tiket:", error));
}

function nextSlide() {
    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('active');
}

function bukaLightbox(index) {
    activeImageIndex = index;
    lightboxImg.src = galleryImages[activeImageIndex].src;
    lightbox.style.display = 'flex';
}

function geserFoto(arah) {
    activeImageIndex += arah;
    if (activeImageIndex >= galleryImages.length) {
        activeImageIndex = 0;
    }
    if (activeImageIndex < 0) {
        activeImageIndex = galleryImages.length - 1;
    }
    lightboxImg.src = galleryImages[activeImageIndex].src;
}

inputJumlah.addEventListener('input', hitungTotal);

radioTier.forEach(radio => {
    radio.addEventListener('change', hitungTotal);
});

formPesanan.addEventListener('submit', function(event) {
    event.preventDefault(); 

    const waPattern = /^[0-9]{10,14}$/;
    if (!waPattern.test(inputKontak.value)) {
        alert('Nomor WhatsApp tidak valid! Masukkan 10-14 digit angka saja.');
        inputKontak.focus();
        return;
    }

    if (parseInt(inputJumlah.value) < 1 || inputJumlah.value === '') {
        alert('Jumlah tiket minimal adalah 1!');
        inputJumlah.focus();
        return;
    }

    const btnSubmit = formPesanan.querySelector('button[type="submit"]');
    btnSubmit.innerText = "Mengirim...";
    btnSubmit.disabled = true;
    const tierTerpilih = document.querySelector('input[name="tier"]:checked');
    const totalHargaTeks = document.getElementById('total').innerText;
    const namaUser = document.getElementById('nama').value;
    const kontakUser = inputKontak.value;
    const infoTier = tierTerpilih.id;
    const jumlahTiket = inputJumlah.value;
    const sekarang = new Date();
    const jamPesan = sekarang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " WIB";

    const dataPesanan = {
        nama: namaUser,
        kontak: kontakUser,
        tier: infoTier,
        jumlah: parseInt(jumlahTiket),
        total: totalHargaTeks
    };

    const payModal = document.getElementById('payment-modal');
    const payImg = payModal.querySelector('.payment-img');
    const closePayBtn = document.querySelector('.payment-close');
    const modalP = payModal.querySelector('.payment-content > p');

    if (payImg) {
        payImg.removeAttribute('src');
    }
    if (modalP) {
        modalP.innerHTML = `Memuat QRIS, mohon tunggu sebentar...`;
    }
    if (payModal) {
        payModal.style.display = 'flex';
    }

    // Dikirim sebagai form-urlencoded (bukan JSON) supaya:
    // 1. Terbaca sebagai e.parameter di Apps Script
    // 2. Request tetap "simple request" sehingga tidak kena CORS preflight
    const formBody = new URLSearchParams(dataPesanan).toString();

    fetch(scriptUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formBody
    })
    .then(response => response.json())
    .then(qrisResult => {
        if (qrisResult.status !== "success" || !qrisResult.qris_base64) {
            throw new Error(qrisResult.message || "Gagal membuat QRIS dinamis");
        }

        if (payImg) {
            payImg.src = `data:image/png;base64,${qrisResult.qris_base64}`;
        }
        if (modalP) {
            modalP.innerHTML = `Silakan melakukan pembayaran tepat sebesar: <br><strong style="font-size: 1.6rem; color: #e63946; display: block; margin-top: 10px; letter-spacing: 1px;">${totalHargaTeks}</strong>`;
        }

        const nomorAdminWA = "6283890435689";

        const teksWA = `Halo Admin, saya ingin konfirmasi pembayaran tiket TUMBUK SISWA.
        
Berikut data pesanan saya:
• *Nama*: ${namaUser}
• *No. WhatsApp*: ${kontakUser}
• *Tier Tiket*: ${infoTier}
• *Jumlah Tiket*: ${jumlahTiket} Biji
• *Total Tagihan*: ${totalHargaTeks}
• *Waktu Pesan*: ${jamPesan}

Saya akan segera mengirimkan bukti transfer setelah ini. Terima kasih!`;
        const btnWaDinamis = document.getElementById('btn-wa-dinamis');
        if (btnWaDinamis) {
            btnWaDinamis.href = `https://wa.me/${nomorAdminWA}?text=${encodeURIComponent(teksWA)}`;
            btnWaDinamis.target = "_blank";
        }

        formPesanan.reset();
        cekKuotaOtomatis();

        closePayBtn.onclick = function() {
            payModal.style.display = 'none';
        }

        window.onclick = function(e) {
            if (e.target === payModal) {
                payModal.style.display = 'none';
            }
        }
    })
    .catch(error => {
        if (modalP) {
            modalP.innerHTML = `Gagal membuat QRIS otomatis. Silakan hubungi admin untuk metode pembayaran via WhatsApp.<br><span style="color:#e63946;">${error.message}</span>`;
        }
    })
    .finally(() => {
        btnSubmit.innerText = "Kirim Pesanan";
        btnSubmit.disabled = false;
    });
});

galleryImages.forEach((img, index) => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => {
        bukaLightbox(index);
    });
});

nextBtn.addEventListener('click', () => geserFoto(1));
prevBtn.addEventListener('click', () => geserFoto(-1));
closeBtn.addEventListener('click', () => {
    lightbox.style.display = 'none';
});
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
        lightbox.style.display = 'none';
    }
});

if (slides.length > 0) {
    setInterval(nextSlide, 4000);
}

cekKuotaOtomatis();
