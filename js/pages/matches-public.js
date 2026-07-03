/**
 * ==========================================================================
 * TUMBUK SISWA — HALAMAN FIGHT CARD PUBLIK (matches-public.js)
 * Versi Supabase. Pakai join langsung ke tabel fighters lewat foreign key.
 * ==========================================================================
 */
document.addEventListener("DOMContentLoaded", async () => {
    const wrapper = document.getElementById("fight-cards-wrapper");
    if (!wrapper) return;

    const defaultPic = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="%23161616"/></svg>';

    function renderFightCards(matches) {
        if (!matches || matches.length === 0) {
            wrapper.innerHTML = `<p style="text-align:center; color: var(--text-gray);">Belum ada Fight Card yang diumumkan.</p>`;
            return;
        }

        let html = "";
        matches.forEach(match => {
            const redFighter = match.red || { nama: '-', gym: 'Unknown Gym', photo_url: '' };
            const blueFighter = match.blue || { nama: '-', gym: 'Unknown Gym', photo_url: '' };

            html += `
            <div class="fight-card-poster">
                <div class="poster-side red-side">
                    <div class="poster-img-wrap">
                        <img src="${redFighter.photo_url || defaultPic}" alt="${redFighter.nama}">
                        <div class="poster-fade"></div>
                    </div>
                </div>

                <div class="poster-center">
                    <span class="poster-status">${(match.status || '').toUpperCase()}</span>
                    <div class="poster-names">
                        <h3 class="name-red">${redFighter.nama}</h3>
                        <div class="vs-mark">VS</div>
                        <h3 class="name-blue">${blueFighter.nama}</h3>
                    </div>
                    <span class="poster-weight">${match.weight_class || ''}</span>
                    <div class="poster-gyms">
                        <span class="gym-red">${redFighter.gym || '-'}</span>
                        <span class="gym-blue">${blueFighter.gym || '-'}</span>
                    </div>
                </div>

                <div class="poster-side blue-side">
                    <div class="poster-img-wrap">
                        <img src="${blueFighter.photo_url || defaultPic}" alt="${blueFighter.nama}">
                        <div class="poster-fade"></div>
                    </div>
                </div>
            </div>
            `;
        });
        wrapper.innerHTML = html;
    }

    // Join langsung ke fighters lewat foreign key fighter_red & fighter_blue
    const { data, error } = await sb
        .from('matches')
        .select(`
            id, title, weight_class, status, match_order,
            red:fighter_red ( nama, gym, photo_url ),
            blue:fighter_blue ( nama, gym, photo_url )
        `)
        .order('match_order', { ascending: true });

    if (error) {
        console.error("Gagal memuat fight card:", error);
        wrapper.innerHTML = `<p style="text-align:center; color: var(--accent);">Gagal memuat jadwal dari arena.</p>`;
        return;
    }

    renderFightCards(data);
});
