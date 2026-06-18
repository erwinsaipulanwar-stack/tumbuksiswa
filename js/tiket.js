document.addEventListener('DOMContentLoaded', () => {
    const formPesanan = document.querySelector('.main-form') || document.querySelector('form');
    if (!formPesanan) return;

    const inputNama = document.getElementById('nama');
    const inputKontak = document.getElementById('kontak') || document.getElementById('whatsapp') || document.getElementById('no_wa') || document.querySelector('input[type="tel"]');
    const inputJumlah = document.getElementById('jumlah');
    const txtTotal = document.getElementById('total');
    const radioTier = document.querySelectorAll('input[name="tier"]');

    // Taruh URL Apps Script Baru Lu Di Sini Win!
    const scriptUrl = "https://script.google.com/macros/s/AKfycbzSHFpF2lG20vElXU11zeUMmSWZ5YN5yDKln4QPPQB-Ydxd76qJQOmn31SyypSBSouaEw/exec";

    let containerPengikut = document.getElementById('container-pengikut');
    if (inputNama && !containerPengikut) {
        containerPengikut = document.createElement('div');
        containerPengikut.id = 'container-pengikut';
        containerPengikut.style.marginTop = '12px';
        containerPengikut.style.display = 'flex';
        containerPengikut.style.flexDirection = 'column';
        containerPengikut.style.gap = '10px';
        inputNama.parentNode.insertBefore(containerPengikut, inputNama.nextSibling);
    }

    function generateRandomInvoice() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '#';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function hitungTotal() {
        const tierTerpilih = document.querySelector('input[name="tier"]:checked');
        if (!tierTerpilih || !txtTotal) return;

        const hargaSatuan = parseInt(tierTerpilih.value) || 0;
        const jumlah = parseInt(inputJumlah.value) || 0;
        const totalHarga = hargaSatuan * jumlah;

        txtTotal.innerText = "Rp " + totalHarga.toLocaleString('id-ID');
    }

    function updateInputNamaPengikut() {
        if (!containerPengikut || !inputJumlah) return;
        containerPengikut.innerHTML = ''; 
        
        const jumlah = parseInt(inputJumlah.value) || 1;
        if (jumlah > 1) {
            for (let i = 2; i <= jumlah; i++) {
                const divGroup = document.createElement('div');
                divGroup.style.display = 'flex';
                divGroup.style.flexDirection = 'column';
                divGroup.style.gap = '6px';

                const label = document.createElement('label');
                label.innerText = `Nama Pengunjung ${i} (Pengikut)`;
                label.style.fontSize = '11px';
                label.style.color = '#999999';
                label.style.fontWeight = '700';
                label.style.textTransform = 'uppercase';
                label.style.letterSpacing = '0.5px';

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'nama-pengikut';
                input.placeholder = `Masukkan nama rekan ke-${i}...`;
                input.required = true;
                
                input.style.padding = '14px';
                input.style.backgroundColor = '#161616';
                input.style.border = '1px solid #262626';
                input.style.borderRadius = '8px';
                input.style.color = '#ffffff';
                input.style.fontSize = '14px';

                divGroup.appendChild(label);
                divGroup.appendChild(input);
                containerPengikut.appendChild(divGroup);
            }
        }
    }

    function cekKuotaOtomatis() {
        fetch(scriptUrl)
        .then(response => response.json())
        .then(data => {
            if (data.status === "success") {
                const kuota = data.kuota;
                for (let tierId in kuota) {
                    const inputRadio = document.getElementById(tierId);
                    if (!inputRadio) continue;
                    
                    const labelCard = document.querySelector(`label[for="${tierId}"]`);
                    if (!labelCard) continue;
                    const txtStatus = labelCard.querySelector('.ticket-status');
                    
                    const sisaAngka = parseInt(kuota[tierId]) || 0;

                    if (sisaAngka <= 0) {
                        inputRadio.disabled = true;
                        inputRadio.checked = false; 
                        labelCard.classList.add('sold-out');
                        if (txtStatus) txtStatus.innerText = "HABIS";
                    } else if (sisaAngka >= 1 && sisaAngka <= 17) {
                        if (txtStatus) { txtStatus.innerText = "HAMPIR HABIS"; txtStatus.style.color = "#CD0100"; }
                    } else if (sisaAngka >= 18 && sisaAngka <= 33) {
                        if (txtStatus) { txtStatus.innerText = "SEBAGIAN HABIS"; txtStatus.style.color = "#ffcc00"; }
                    } else {
                        if (txtStatus) { txtStatus.innerText = "TERSEDIA"; txtStatus.style.color = "#00ff66"; }
                    }
                }
                hitungTotal();
            }
        });
    }

    if (inputJumlah) {
        inputJumlah.addEventListener('input', () => {
            hitungTotal();
            updateInputNamaPengikut();
        });
    }
    radioTier.forEach(radio => radio.addEventListener('change', hitungTotal));

    formPesanan.addEventListener('submit', function(event) {
        event.preventDefault(); 

        if (!inputKontak || !waPattern.test(inputKontak.value)) {
            alert('Nomor WhatsApp tidak valid!');
            if(inputKontak) inputKontak.focus();
            return;
        }

        const btnSubmit = formPesanan.querySelector('button[type="submit"]');
        btnSubmit.innerText = "Memproses Invoice...";
        btnSubmit.disabled = true;

        const tierTerpilih = document.querySelector('input[name="tier"]:checked');
        const totalHargaTeks = txtTotal.innerText;
        const namaKepala = inputNama.value.trim();
        const kontakUser = inputKontak.value;
        const infoTier = tierTerpilih.id;
        const jumlahTiket = inputJumlah.value;
        const hargaSatuanMurni = tierTerpilih.value;
        const invoiceIdBaru = generateRandomInvoice();

        let kumpulanNama = [namaKepala];
        const inputsPengikut = document.querySelectorAll('.nama-pengikut');
        inputsPengikut.forEach(inputan => {
            if (inputan.value.trim() !== '') { kumpulanNama.push(inputan.value.trim()); }
        });
        const namaUserCombined = kumpulanNama.join('|');

        const formData = new URLSearchParams();
        formData.append('id_invoice', invoiceIdBaru);
        formData.append('nama', namaUserCombined); 
        formData.append('kontak', kontakUser);
        formData.append('tier', infoTier);
        formData.append('jumlah', jumlahTiket);
        formData.append('harga_satuan', hargaSatuanMurni); 
        formData.append('total', totalHargaTeks);

        fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString()
        })
        .then(res => res.json())
        .then(responsGoogle => {
            let finalQrisUrl = "";
            if (responsGoogle.status === "success" && responsGoogle.qris_base64) {
                finalQrisUrl = "data:image/png;base64," + responsGoogle.qris_base64;
            } else {
                finalQrisUrl = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent("00020101021126570011ID.DANA.WWW011893600915302440156402090244015640303UMI51440014ID.CO.QRIS.WWW0215ID10265173474270303UMI5204581353033605802ID5917Erwin berkah jaya6011Kab. Bekasi6105177116304BE03");
            }

            localStorage.setItem('inv_id', invoiceIdBaru);
            localStorage.setItem('inv_nama', namaUserCombined);
            localStorage.setItem('inv_kontak', kontakUser);
            localStorage.setItem('inv_tier', infoTier);
            localStorage.setItem('inv_jumlah', jumlahTiket);
            localStorage.setItem('inv_total', totalHargaTeks);
            localStorage.setItem('inv_qris', finalQrisUrl);

            window.location.href = 'payment.html';
        })
        .catch(error => {
            console.error(error);
            localStorage.setItem('inv_id', invoiceIdBaru);
            localStorage.setItem('inv_nama', namaUserCombined);
            localStorage.setItem('inv_kontak', kontakUser);
            localStorage.setItem('inv_tier', infoTier);
            localStorage.setItem('inv_jumlah', jumlahTiket);
            localStorage.setItem('inv_total', totalHargaTeks);
            localStorage.setItem('inv_qris', "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=ERR");
            window.location.href = 'payment.html';
        });
    });

    const waPattern = /^[0-9]{10,14}$/;
    cekKuotaOtomatis();
});