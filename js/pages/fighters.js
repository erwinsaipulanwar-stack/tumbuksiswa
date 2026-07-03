/**
 * ==========================================================================
 * TUMBUK SISWA — HALAMAN ROSTER FIGHTER PUBLIK (fighters.js)
 * Versi Supabase.
 * Revisi: alert() diganti modal cyberpunk dengan foto, nama, nickname,
 *         gym, tinggi badan, dan berat (placeholder dari kolom wins).
 * ==========================================================================
 */
document.addEventListener('DOMContentLoaded', async () => {
    const rosterGrid = document.querySelector('.roster-grid');
    if (!rosterGrid) return;

    const defaultPic = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23161616"/></svg>';

    rosterGrid.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--text-gray); grid-column: 1 / -1;">Memuat roster fighter...</p>`;

    // -----------------------------------------------------------------------
    // INJECT MODAL ke body (sekali saja)
    // -----------------------------------------------------------------------
    function injectFighterModal() {
        if (document.getElementById('fighterProfileModal')) return;
        const modal = document.createElement('div');
        modal.id = 'fighterProfileModal';
        modal.style.cssText = `
            display:none; position:fixed; inset:0; z-index:9999;
            background:rgba(0,0,0,0.82); backdrop-filter:blur(6px);
            align-items:center; justify-content:center;
        `;
        modal.innerHTML = `
            <div id="fighterModalCard" style="
                position:relative; width:100%; max-width:420px; margin:16px;
                background:#0d0d0d; border:1px solid #1f1f1f;
                box-shadow:0 0 40px rgba(205,1,0,0.18); overflow:hidden;
            ">
                <!-- HUD corners -->
                <div style="position:absolute;top:10px;left:10px;width:14px;height:14px;border-top:2px solid #CD0100;border-left:2px solid #CD0100;"></div>
                <div style="position:absolute;top:10px;right:10px;width:14px;height:14px;border-top:2px solid #CD0100;border-right:2px solid #CD0100;"></div>
                <div style="position:absolute;bottom:10px;left:10px;width:14px;height:14px;border-bottom:2px solid #CD0100;border-left:2px solid #CD0100;"></div>
                <div style="position:absolute;bottom:10px;right:10px;width:14px;height:14px;border-bottom:2px solid #CD0100;border-right:2px solid #CD0100;"></div>

                <!-- Foto banner -->
                <div style="position:relative; height:220px; overflow:hidden; background:#080808;">
                    <img id="fmPhoto" src="" alt="" style="width:100%;height:100%;object-fit:cover;object-position:top;filter:grayscale(20%);opacity:0.9;">
                    <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,#0d0d0d 100%);"></div>
                    <div style="position:absolute;top:12px;left:0;background:#CD0100;padding:4px 14px 4px 12px;clip-path:polygon(0 0,100% 0,92% 100%,0 100%);">
                        <span id="fmTierTag" style="font-family:'Bebas Neue',sans-serif;font-size:11px;font-weight:400;color:#fff;letter-spacing:2px;text-transform:uppercase;"></span>
                    </div>
                    <button id="fmCloseBtn" style="
                        position:absolute;top:10px;right:10px;
                        background:rgba(0,0,0,0.6);border:1px solid #333;
                        color:#888;width:30px;height:30px;cursor:pointer;
                        font-size:14px;display:flex;align-items:center;justify-content:center;
                        border-radius:2px;transition:color 0.2s;
                    ">✕</button>
                </div>

                <!-- Info -->
                <div style="padding:20px 24px 28px;">
                    <div style="font-family:'Inter',sans-serif;font-size:9px;color:#CD0100;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px;">// FIGHTER_PROFILE</div>
                    <h2 id="fmNama" style="font-family:'Bebas Neue',sans-serif;font-size:28px;font-weight:400;color:#fff;margin:0;line-height:1.1;"></h2>
                    <p id="fmNickname" style="font-family:'Inter',sans-serif;font-size:12px;color:#CD0100;margin:4px 0 20px;letter-spacing:1px;"></p>

                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
    <div style="background:#111;border:1px solid #1f1f1f;padding:12px 14px;position:relative;">
        <div style="position:absolute;top:0;left:0;width:2px;height:100%;background:#CD0100;"></div>
        <div style="font-family:'Inter',sans-serif;font-size:9px;color:#555;letter-spacing:2px;text-transform:uppercase;">// GYM / SEKOLAH</div>
        <div id="fmGym" style="font-size:13px;font-weight:700;color:#fff;margin-top:4px;"></div>
    </div>
    <div style="background:#111;border:1px solid #1f1f1f;padding:12px 14px;position:relative;">
        <div style="position:absolute;top:0;left:0;width:2px;height:100%;background:#CD0100;"></div>
        <div style="font-family:'Inter',sans-serif;font-size:9px;color:#555;letter-spacing:2px;text-transform:uppercase;">// TINGGI BADAN</div>
        <div id="fmHeight" style="font-size:13px;font-weight:700;color:#fff;margin-top:4px;"></div>
    </div>
    <div style="background:#111;border:1px solid #1f1f1f;padding:12px 14px;position:relative;">
        <div style="position:absolute;top:0;left:0;width:2px;height:100%;background:#CD0100;"></div>
        <div style="font-family:'Inter',sans-serif;font-size:9px;color:#555;letter-spacing:2px;text-transform:uppercase;">// BERAT BADAN</div>
        <div id="fmWeight" style="font-size:13px;font-weight:700;color:#fff;margin-top:4px;"></div>
    </div>
</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Tutup modal
        document.getElementById('fmCloseBtn').addEventListener('click', closeFighterModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeFighterModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFighterModal(); });
    }

    function openFighterModal(fighter) {
        const modal = document.getElementById('fighterProfileModal');
        if (!modal) return;

        const tierTagFromHeight = (height) => {
            const h = parseInt(height) || 0;
            if (h >= 175) return 'KELAS AKSELERASI';
            if (h >= 165) return 'KELAS KKM';
            return 'KELAS REMEDIAL';
        };

        document.getElementById('fmPhoto').src         = fighter.photo_url || defaultPic;
        document.getElementById('fmPhoto').alt         = fighter.nama;
        document.getElementById('fmTierTag').innerText = tierTagFromHeight(fighter.height);
        document.getElementById('fmNama').innerText    = fighter.nama || '-';
        document.getElementById('fmNickname').innerText = fighter.nickname ? `"${fighter.nickname}"` : '';
        document.getElementById('fmGym').innerText     = fighter.gym || '-';
document.getElementById('fmHeight').innerText  = fighter.height ? `${fighter.height} cm` : '-';
document.getElementById('fmWeight').innerText  = fighter.weight ? `${fighter.weight} kg` : '-'; // Tambahkan ini
        // fmRecord dihapus: kolom wins/losses/draws tidak ada di database

        modal.style.display = 'flex';
        // Animasi masuk
        const card = document.getElementById('fighterModalCard');
        card.style.opacity   = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        requestAnimationFrame(() => {
            card.style.opacity   = '1';
            card.style.transform = 'translateY(0)';
        });
    }

    function closeFighterModal() {
        const modal = document.getElementById('fighterProfileModal');
        if (!modal) return;
        const card = document.getElementById('fighterModalCard');
        card.style.opacity   = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => { modal.style.display = 'none'; }, 220);
    }

    // -----------------------------------------------------------------------
    // TIER TAG (untuk card roster)
    // -----------------------------------------------------------------------
    function tierTagFromHeight(height) {
        const h = parseInt(height) || 0;
        if (h >= 175) return { cls: 'acceleration', label: 'Kelas Akselerasi' };
        if (h >= 165) return { cls: 'kkm', label: 'Kelas KKM' };
        return { cls: 'remedial', label: 'Kelas Remedial' };
    }

    // -----------------------------------------------------------------------
    // RENDER ROSTER
    // -----------------------------------------------------------------------
    // Simpan data fighters di closure agar bisa diakses saat klik
    let fightersData = [];

    function renderRoster(fighters) {
        fightersData = fighters;
        if (fighters.length === 0) {
            rosterGrid.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--text-gray); grid-column: 1 / -1;">Belum ada fighter yang terdaftar.</p>`;
            return;
        }

        let html = "";
        fighters.forEach((f, idx) => {
            const tier = tierTagFromHeight(f.height);
            html += `
            <div class="fighter-card" data-fighter-idx="${idx}" style="cursor:pointer;">
                <div class="fighter-photo">
                    <img src="${f.photo_url || defaultPic}" alt="${f.nama}">
                    <div class="record-badge">${tierTagFromHeight(f.height).label}</div>
                </div>
                <div class="fighter-details">
                    <span class="tier-tag ${tier.cls}">${tier.label}</span>
                    <h2>${f.nama}</h2>
                    <p class="school">${f.gym || '-'}</p>
                </div>
            </div>
            `;
        });
        rosterGrid.innerHTML = html;
        attachCardClickHandlers();
    }

    function attachCardClickHandlers() {
        document.querySelectorAll('.fighter-card[data-fighter-idx]').forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.getAttribute('data-fighter-idx'));
                const fighter = fightersData[idx];
                if (fighter) openFighterModal(fighter);
            });
        });
    }

    // -----------------------------------------------------------------------
    // INIT
    // -----------------------------------------------------------------------
    injectFighterModal();

    const { data, error } = await sb
        .from('fighters')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Gagal memuat roster:", error);
        rosterGrid.innerHTML = `<p style="text-align:center; padding: 40px; color: var(--accent); grid-column: 1 / -1;">Gagal memuat roster dari arena.</p>`;
        return;
    }

    renderRoster(data);
});
