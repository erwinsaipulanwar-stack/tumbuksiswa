/**
 * ==========================================================================
 * TUMBUK SISWA — ADMIN DASHBOARD ENGINE (admin-v2.js)
 * Full Supabase. Semua revisi per Juni 2026:
 *  - Stats tiket terjual & terverifikasi dipisah dengan benar
 *  - Notif bell diisi dari pesanan WAITING real
 *  - Tabel Pesanan: expand row tiket holder + filter status PAID/WAITING
 *  - Print tiket pakai desain cyberpunk landscape (sama dengan payment.html)
 *  - fighters.js alert() diganti modal
 * ==========================================================================
 */

let html5QrcodeScanner = null;
let isScanningActive   = false;
let verifiedSessionCount = 0;

let appState = {
    pesanan:     [],
    fighters:    [],
    matches:     [],
    logs:        [],
    pricing:     [],
    total_hadir: 0,
    notifications: []
};

let globalTargetType  = null;
let globalTargetId    = null;
let globalTargetIndex = null;
let globalTargetExtra = null;

// ==========================================================================
// AUTH
// ==========================================================================
async function initAuthGate() {
    const { data: { session } } = await sb.auth.getSession();
    const loginScreen     = document.getElementById('loginScreen');
    const dashboardLayout = document.querySelector('.admin-layout');

    if (!session) {
        if (loginScreen)     loginScreen.style.display     = 'flex';
        if (dashboardLayout) dashboardLayout.style.display = 'none';
        return false;
    }
    if (loginScreen)     loginScreen.style.display     = 'none';
    if (dashboardLayout) dashboardLayout.style.display = '';
    return true;
}

async function handleLogin(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { showToast("Login gagal: " + error.message, "danger"); return false; }
    showToast("Login berhasil! Selamat datang.", "success");
    return true;
}

async function handleLogout() {
    await sb.auth.signOut();
    window.location.reload();
}

function initLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email    = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const btn      = loginForm.querySelector('button[type="submit"]');
        btn.disabled   = true;
        btn.innerText  = "Memproses...";
        const success = await handleLogin(email, password);
        if (success) {
            document.getElementById('loginScreen').style.display     = 'none';
            document.querySelector('.admin-layout').style.display    = '';
            await launchDashboardUtilities();
        } else {
            btn.disabled  = false;
            btn.innerHTML = '<span>ESTABLISH CONNECTION</span><i class="fa-solid fa-terminal"></i>';
        }
    });
}

// ==========================================================================
// LAUNCHER
// ==========================================================================
async function launchDashboardUtilities() {
    initNavigation();
    initDropdowns();
    initSearchEngines();
    initModalSystem();
    initFormHandlers();
    initScannerUIHandlers();
    await fetchDataFromSupabase();
    subscribeRealtimeAdmin();
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
}

document.addEventListener("DOMContentLoaded", async () => {
    initLoginForm();
    const isLoggedIn = await initAuthGate();
    if (!isLoggedIn) return;
    await launchDashboardUtilities();
});

// ==========================================================================
// SKELETON
// ==========================================================================
function toggleSkeleton(show) {
    const loader  = document.getElementById('skeletonLoader');
    const content = document.getElementById('realContent');
    if (!loader || !content) return;
    if (show) { loader.classList.remove('hidden'); content.classList.add('hidden'); }
    else      { loader.classList.add('hidden');    content.classList.remove('hidden'); }
}

// ==========================================================================
// DATA FETCHING
// ==========================================================================
async function fetchDataFromSupabase(silent = false) {
    if (!silent) toggleSkeleton(true);
    try {
        const [fightersRes, matchesRes, ordersRes, pricingRes, logsRes] = await Promise.all([
            sb.from('fighters').select('*').order('created_at', { ascending: false }),
            sb.from('matches').select(`
                id, title, weight_class, status, result, match_order,
                fighter_blue, fighter_red,
                blue:fighter_blue ( id, nama, gym, photo_url ),
                red:fighter_red  ( id, nama, gym, photo_url )
            `).order('match_order', { ascending: true }),
            sb.from('orders').select(`
                id, invoice_code, nama_pemesan, kontak_wa, tier_key,
                jumlah_tiket, harga_satuan, total_harga, payment_status, created_at,
                ticket_holders ( id, nama_pengunjung, qr_code, checked_in, checked_in_at )
            `).order('created_at', { ascending: false }),
            sb.rpc('get_tier_availability'),
            sb.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(50)
        ]);

        if (fightersRes.error) throw fightersRes.error;
        if (matchesRes.error)  throw matchesRes.error;
        if (ordersRes.error)   throw ordersRes.error;
        if (pricingRes.error)  throw pricingRes.error;
        if (logsRes.error)     throw logsRes.error;

        appState.fighters = fightersRes.data || [];
        appState.matches  = matchesRes.data  || [];
        appState.pesanan  = ordersRes.data   || [];
        appState.pricing  = pricingRes.data  || [];
        appState.logs     = (logsRes.data || []).map(l => ({
            teks:  l.log_text,
            type:  l.log_type,
            waktu: new Date(l.created_at).toLocaleString('id-ID')
        }));

        appState.total_hadir = appState.pesanan.reduce((sum, o) => {
            return sum + (o.ticket_holders || []).filter(t => t.checked_in).length;
        }, 0);

        renderAllModules();
    } catch (err) {
        console.error(err);
        showToast("Gagal memuat data dari Supabase!", "danger");
    } finally {
        if (!silent) toggleSkeleton(false);
    }
}

// ==========================================================================
// REALTIME SYNC — auto refresh dashboard tanpa reload manual
// ==========================================================================
let realtimeDebounceTimer = null;
function triggerRealtimeRefresh() {
    clearTimeout(realtimeDebounceTimer);
    realtimeDebounceTimer = setTimeout(() => {
        fetchDataFromSupabase(true); // silent, gak nge-flash skeleton loader
        silentFetchStats();
    }, 800);
}

function subscribeRealtimeAdmin() {
    sb.channel('admin-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },         triggerRealtimeRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_holders' },  triggerRealtimeRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' },         triggerRealtimeRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fighters' },        triggerRealtimeRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' },   triggerRealtimeRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_tiers' },   triggerRealtimeRefresh)
        .subscribe();
}

async function silentFetchStats() {
    const { data, error } = await sb.rpc('get_dashboard_stats');
    if (error) {
        console.error("Gagal load stats:", error);
        return;
    }
    
    // Render langsung ke UI
    document.getElementById('statRevenue').innerText = `Rp ${parseInt(data.totalRevenue).toLocaleString('id-ID')}`;
    document.getElementById('statTickets').innerText = `${data.ticketsSold} Terjual`;
    document.getElementById('statVerifiedTickets').innerText = `${data.ticketsVerified} Terverif`;
    document.getElementById('statFighters').innerText = data.totalFighters;
}

// ==========================================================================
// [FIX SECURITY] ESCAPE HTML — cegah stored XSS dari data user (nama_pemesan,
// nama_pengunjung, kontak_wa) yang sebelumnya ditembak mentah ke .innerHTML
// di renderNotifications, renderOrdersTable, dan printTicketCyberpunk.
// Data ini asalnya dari form publik tiket.html yang bisa diisi siapa aja,
// jadi kalau nama diisi payload script, admin yang lihat/print tiketnya
// yang kena eksekusi (session admin bisa dibajak).
// ==========================================================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==========================================================================
// TOAST
// ==========================================================================
function showToast(message, type = "success") {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    let icon = "fa-check-circle";
    if (type === "danger")  icon = "fa-exclamation-triangle";
    if (type === "warning") icon = "fa-bell";
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity   = "0";
        toast.style.transform = "translateX(50px)";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

async function logActivity(text, type = "info") {
    try {
        // Sekarang kita tembak lewat RPC agar lolos RLS, bukan insert langsung
        const { error } = await sb.rpc('log_admin_activity', { p_action: text });
        if (error) throw error;
    } catch (e) { 
        console.warn("Gagal mencatat log aktivitas:", e); 
    }
}

// ==========================================================================
// RENDER: SEMUA MODULE
// ==========================================================================
function renderAllModules() {
    renderDashboardStats();
    renderNotifications();
    renderFightCardPreview();
    renderActivityLogs();
    renderFightersTable();
    renderMatchesTable();
    renderOrdersTable();
    renderPricingCards();
}

// ==========================================================================
// RENDER: DASHBOARD STATS  (TIKET TERJUAL ≠ TIKET TERVERIFIKASI)
// ==========================================================================
function renderDashboardStats() {
    const statRevenue         = document.getElementById('statRevenue');
    const statTickets         = document.getElementById('statTickets');
    const statVerifiedTickets = document.getElementById('statVerifiedTickets');
    const statFighters        = document.getElementById('statFighters');

    if (statRevenue) {
        const totalRevenue = appState.pesanan
            .filter(o => o.payment_status === "PAID")
            .reduce((sum, o) => sum + (o.total_harga || 0), 0);
        statRevenue.innerText = `Rp ${totalRevenue.toLocaleString('id-ID')}`;
    }

    // Tiket Terjual = total lembar tiket dari order PAID
    if (statTickets) {
        const totalTiketTerjual = appState.pesanan
            .filter(o => o.payment_status === "PAID")
            .reduce((sum, o) => sum + (o.jumlah_tiket || 0), 0);
        statTickets.innerText = `${totalTiketTerjual} Terjual`;
    }

    // Tiket Terverifikasi = yang sudah scan masuk gate (checked_in)
    if (statVerifiedTickets) {
        statVerifiedTickets.innerText = `${appState.total_hadir} Terverif`;
    }

    if (statFighters) {
        statFighters.innerText = appState.fighters.length;
    }
}

// ==========================================================================
// RENDER: NOTIFIKASI BELL — pesanan WAITING terbaru
// ==========================================================================
function renderNotifications() {
    const container  = document.getElementById('notifContainer');
    const badge      = document.getElementById('notifBadgeCount');
    if (!container)  return;

    const waiting = appState.pesanan.filter(o => o.payment_status !== "PAID");

    if (badge) {
        if (waiting.length > 0) {
            badge.style.display  = 'flex';
            badge.innerText      = waiting.length > 9 ? '9+' : waiting.length;
        } else {
            badge.style.display  = 'none';
        }
    }

    if (waiting.length === 0) {
        container.innerHTML = `<p style="font-size:12px; color:#555; padding:12px 16px;">Tidak ada pesanan yang menunggu konfirmasi.</p>`;
        return;
    }

    container.innerHTML = "";
    // Tampilkan maksimal 8 entri di dropdown
    waiting.slice(0, 8).forEach(o => {
        const item = document.createElement('div');
        item.className = "notif-item";
        item.style.cssText = "padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; transition:background 0.2s;";
        item.onmouseenter = () => item.style.background = "rgba(255,0,60,0.06)";
        item.onmouseleave = () => item.style.background = "transparent";
        item.innerHTML = `
            <div style="font-size:13px; font-weight:600; color:#fff;">${escapeHtml(o.nama_pemesan)}</div>
            <div style="font-size:11px; color:#666; margin-top:2px;">
                <code style="color:#ff003c;">${escapeHtml(o.invoice_code)}</code> &bull; ${o.jumlah_tiket} tiket &bull; ${escapeHtml(String(o.tier_key).toUpperCase())}
            </div>
        `;
        item.addEventListener('click', () => {
            openEditOrder(o.id, o.nama_pemesan, o.kontak_wa);
            document.getElementById('notifDropdown').classList.remove('show');
        });
        container.appendChild(item);
    });

    if (waiting.length > 8) {
        const more = document.createElement('div');
        more.style.cssText = "padding:10px 16px; font-size:11px; color:#666; text-align:center;";
        more.innerText = `+${waiting.length - 8} pesanan lainnya`;
        container.appendChild(more);
    }
}

// ==========================================================================
// RENDER: FIGHT CARD PREVIEW
// ==========================================================================
function renderFightCardPreview() {
    const container = document.getElementById('fightCardPreview');
    if (!container) return;
    container.innerHTML = "";
    if (appState.matches.length === 0) {
        container.innerHTML = "<p class='text-muted text-center' style='padding:20px;'>Belum ada agenda pertandingan.</p>";
        return;
    }
    appState.matches.forEach(m => {
        const fBlue = m.blue || {};
        const fRed  = m.red  || {};
        let badgeClass = m.status === "LIVE" ? "badge-danger" : (m.status === "FINISHED" ? "badge-success" : "badge-warning");
        const row = document.createElement('div');
        row.className = "preview-match-row";
        row.innerHTML = `
            <div class="fighter-mini-profile">
                <img src="${fBlue.photo_url || 'https://via.placeholder.com/100'}" class="avatar-mini">
                <div>
                    <div class="name-mini">${fBlue.nama || '-'}</div>
                    <div class="school-mini">${fBlue.gym || 'Corner Biru'}</div>
                </div>
            </div>
            <div class="vs-badge-box">
                <span class="vs-text">VS</span>
                <div class="match-meta-info">${m.weight_class || 'Catchweight'}</div>
                <span class="badge ${badgeClass}" style="margin-top:6px;">${m.status || 'PENDING'}</span>
            </div>
            <div class="fighter-mini-profile text-right">
                <img src="${fRed.photo_url || 'https://via.placeholder.com/100'}" class="avatar-mini">
                <div>
                    <div class="name-mini">${fRed.nama || '-'}</div>
                    <div class="school-mini">${fRed.gym || 'Corner Merah'}</div>
                </div>
            </div>
        `;
        container.appendChild(row);
    });
}

// ==========================================================================
// RENDER: ACTIVITY LOGS
// ==========================================================================
function renderActivityLogs() {
    const container = document.getElementById('activityLogList');
    if (!container) return;
    container.innerHTML = "";
    if (appState.logs.length === 0) {
        container.innerHTML = "<p class='text-muted' style='font-size:12px;'>Log riwayat kosong.</p>";
        return;
    }
    appState.logs.forEach(log => {
        const item = document.createElement('div');
        item.className = `log-item ${log.type === 'error' ? 'warning' : 'info'}`;
        item.innerHTML = `<div class="log-bullet"></div><p class="log-text">${log.teks}</p><span class="log-time">${log.waktu}</span>`;
        container.appendChild(item);
    });
}

// ==========================================================================
// RENDER: FIGHTERS TABLE
// ==========================================================================
function renderFightersTable(filterQuery = "") {
    const tbody = document.querySelector('#fighterTable tbody');
    if (!tbody) return;
    tbody.innerHTML = "";
    const filtered = appState.fighters.filter(f => f.nama.toLowerCase().includes(filterQuery.toLowerCase()));
    filtered.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
    <td>
        <div class="identity-cell">
            <img src="${f.photo_url || 'https://via.placeholder.com/100'}">
            <div class="identity-meta">
                <h4>${f.nama}</h4>
                <p>"${f.nickname || 'No Nickname'}"</p>
            </div>
        </div>
    </td>
    <td>${f.gym || '-'}</td>
    <td><strong>${f.height || '-'} cm</strong></td>
    <td><strong>${f.weight || '-'} kg</strong></td> <td>
        <button class="btn-action-icon edit-trigger" onclick="openEditFighter('${f.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="btn-action-icon delete-trigger" onclick="triggerDeleteConfirm('fighter', '${f.id}')"><i class="fa-solid fa-trash-can"></i></button>
    </td>
`;
        tbody.appendChild(tr);
    });
    updateMatchFormSelectOptions();
}

// ==========================================================================
// RENDER: MATCHES TABLE
// ==========================================================================
function renderMatchesTable(filterQuery = "") {
    const tbody = document.querySelector('#matchTable tbody');
    if (!tbody) return;
    tbody.innerHTML = "";
    appState.matches.forEach(m => {
        const namaBlue = m.blue ? m.blue.nama : '-';
        const namaRed  = m.red  ? m.red.nama  : '-';
        if (filterQuery && !namaRed.toLowerCase().includes(filterQuery.toLowerCase()) && !namaBlue.toLowerCase().includes(filterQuery.toLowerCase())) return;
        let statusBadge = m.status === "LIVE"
            ? `<span class="badge badge-danger">LIVE</span>`
            : (m.status === "FINISHED"
                ? `<span class="badge badge-success">SELESAI</span>`
                : `<span class="badge badge-warning">PENDING</span>`);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${m.title || 'Regular Fight'}</strong></td>
            <td class="text-info">${namaBlue}</td>
            <td class="text-danger">${namaRed}</td>
            <td>${m.weight_class || '-'}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-action-icon edit-trigger" onclick="openEditMatch('${m.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-action-icon delete-trigger" onclick="triggerDeleteConfirm('match', '${m.id}')"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================================================
// RENDER: ORDERS TABLE — expand row tiket holder + filter status
// ==========================================================================
function renderOrdersTable(filterQuery = "", statusFilter = "ALL") {
    const tbody = document.querySelector('#orderTable tbody');
    if (!tbody) return;
    tbody.innerHTML = "";

    const filtered = appState.pesanan.filter(o => {
        const matchText = String(o.invoice_code).toLowerCase().includes(filterQuery.toLowerCase())
            || String(o.nama_pemesan).toLowerCase().includes(filterQuery.toLowerCase());
        const matchStatus = statusFilter === "ALL"
            || (statusFilter === "PAID"    && o.payment_status === "PAID")
            || (statusFilter === "WAITING" && o.payment_status !== "PAID");
        return matchText && matchStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#555;">Tidak ada data ditemukan.</td></tr>`;
        return;
    }

    filtered.forEach(o => {
        const isLunas    = o.payment_status === "PAID";
        const holders    = o.ticket_holders || [];
        const statusBadge = isLunas
            ? `<span class="badge badge-success">LUNAS / PAID</span>`
            : `<span class="badge badge-warning">WAITING</span>`;

        // Baris utama
        const trMain = document.createElement('tr');
        trMain.className = "order-main-row";
        trMain.innerHTML = `
            <td>
                <button class="btn-expand-row" data-order-id="${o.id}" title="Lihat tiket holder" style="background:none;border:none;cursor:pointer;color:#666;font-size:14px;padding:4px 8px;border-radius:4px;transition:color 0.2s;">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </td>
            <td><code>${escapeHtml(o.invoice_code)}</code></td>
            <td><strong>${escapeHtml(o.nama_pemesan)}</strong> <small class="text-muted">(${o.jumlah_tiket} Tiket)</small></td>
            <td><a href="https://wa.me/${encodeURIComponent(o.kontak_wa)}" target="_blank" class="text-info" style="text-decoration:none;"><i class="fa-brands fa-whatsapp"></i> +${escapeHtml(o.kontak_wa)}</a></td>
            <td><span class="badge badge-info">${escapeHtml(String(o.tier_key).toUpperCase())}</span></td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-action-icon" style="color:var(--success);" data-order-id="${o.id}" data-nama="${escapeHtml(o.nama_pemesan)}" data-wa="${escapeHtml(o.kontak_wa)}" onclick="openEditOrder(this.dataset.orderId, this.dataset.nama, this.dataset.wa)"><i class="fa-solid fa-user-pen"></i></button>
                <button class="btn-action-icon" style="color:#fff;" onclick="printTicketCyberpunk('${o.id}')"><i class="fa-solid fa-print"></i></button>
            </td>
        `;
        tbody.appendChild(trMain);

        // Baris expand (hidden by default)
        const trExpand = document.createElement('tr');
        trExpand.className   = "order-expand-row";
        trExpand.id          = `expand-${o.id}`;
        trExpand.style.display = "none";

        let holdersHtml = "";
        if (holders.length === 0) {
            holdersHtml = `<td colspan="7" style="padding:12px 24px; color:#555; font-size:12px; font-style:italic;">Belum ada tiket holder terdaftar (order belum di-set LUNAS).</td>`;
        } else {
            const listItems = holders.map((t, idx) => {
                const checkinBadge = t.checked_in
                    ? `<span style="color:#00ff66; font-size:11px; font-weight:700;">✓ MASUK ${t.checked_in_at ? new Date(t.checked_in_at).toLocaleTimeString('id-ID') : ''}</span>`
                    : `<span style="color:#666; font-size:11px;">Belum Check-In</span>`;
                return `
                    <div style="display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:11px; color:#444; width:20px; text-align:center;">${idx + 1}</span>
                        <code style="font-size:11px; color:#888; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.qr_code)}</code>
                        <span style="font-size:13px; color:#ccc; flex:1.5;">${escapeHtml(t.nama_pengunjung)}</span>
                        ${checkinBadge}
                    </div>
                `;
            }).join('');
            holdersHtml = `
                <td colspan="7" style="padding:12px 24px 16px; background:rgba(0,0,0,0.2);">
                    <div style="font-size:10px; color:#555; font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">// TIKET HOLDER LIST</div>
                    ${listItems}
                </td>
            `;
        }
        trExpand.innerHTML = holdersHtml;
        tbody.appendChild(trExpand);
    });

    // Pasang event expand/collapse
    tbody.querySelectorAll('.btn-expand-row').forEach(btn => {
        btn.addEventListener('click', () => {
            const orderId    = btn.getAttribute('data-order-id');
            const expandRow  = document.getElementById(`expand-${orderId}`);
            const icon       = btn.querySelector('i');
            if (!expandRow) return;
            if (expandRow.style.display === "none") {
                expandRow.style.display = "";
                icon.className          = "fa-solid fa-chevron-down";
                btn.style.color         = "#ff003c";
            } else {
                expandRow.style.display = "none";
                icon.className          = "fa-solid fa-chevron-right";
                btn.style.color         = "#666";
            }
        });
    });
}

// ==========================================================================
// RENDER: PRICING CARDS
// ==========================================================================
function renderPricingCards() {
    const container = document.getElementById('pricingTierContainer');
    if (!container) return;
    container.innerHTML = "";
    appState.pricing.forEach(tier => {
        const card = document.createElement('div');
        card.className = `tier-card ${tier.tier_key === 'vvip' ? 'VIP' : ''}`;
        card.innerHTML = `
            <div class="tier-name">${tier.nama_tampil.toUpperCase()}</div>
            <div class="tier-price">Rp ${Number(tier.harga).toLocaleString('id-ID')}</div>
            <ul class="tier-meta-list">
                <li>Sisa Kuota Terbuka <span>${tier.sisa_kuota} / ${tier.kapasitas} Kursi</span></li>
            </ul>
            <form class="modern-form pricing-edit-form" data-tier="${tier.tier_key}">
                <div class="form-group">
                    <label for="namaInput-${tier.tier_key}">Nama Tier</label>
                    <input type="text" id="namaInput-${tier.tier_key}" value="${tier.nama_tampil}" required>
                </div>
                <div class="form-group">
                    <label for="hargaInput-${tier.tier_key}">Harga Tiket (Rp)</label>
                    <input type="number" id="hargaInput-${tier.tier_key}" min="0" step="1000" value="${tier.harga}" required>
                </div>
                <div class="form-group">
                    <label for="kapInput-${tier.tier_key}">Total Kapasitas Kursi</label>
                    <input type="number" id="kapInput-${tier.tier_key}" min="1" step="1" value="${tier.kapasitas}" required>
                </div>
                <button type="submit" class="btn btn-primary btn-full">
                    <i class="fa-solid fa-floppy-disk"></i> Simpan ${tier.tier_key.toUpperCase()}
                </button>
            </form>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.pricing-edit-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const tierKey  = form.getAttribute('data-tier');
            const hargaBaru = parseInt(document.getElementById(`hargaInput-${tierKey}`).value) || 0;
            const namaBaru  = document.getElementById(`namaInput-${tierKey}`).value.trim();
            const kapBaru   = parseInt(document.getElementById(`kapInput-${tierKey}`).value) || 50;
            toggleSkeleton(true);
            const { error } = await sb.from('pricing_tiers')
                .update({ nama_tampil: namaBaru, harga: hargaBaru, kapasitas: kapBaru })
                .eq('tier_key', tierKey);
            if (error) {
                showToast(`Gagal update tier: ${error.message}`, "danger");
            } else {
                showToast(`Konfigurasi tier ${tierKey.toUpperCase()} berhasil diupdate!`, "success");
                await logActivity(`Update pricing tier ${tierKey}`);
                await fetchDataFromSupabase();
            }
            toggleSkeleton(false);
        });
    });
}

// ==========================================================================
// PRINT TIKET — desain cyberpunk landscape (sama dengan payment.html)
// ==========================================================================
function printTicketCyberpunk(orderId) {
    const order = appState.pesanan.find(o => o.id === orderId);
    if (!order) return;

    const holders = order.ticket_holders || [];
    if (holders.length === 0) {
        showToast("Tiket belum digenerate. Set order ke LUNAS terlebih dahulu.", "warning");
        return;
    }

    let tiketHtml = "";
    holders.forEach((tiket, idx) => {
        const urlQr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=5&data=${encodeURIComponent(tiket.qr_code)}`;
        // [FIX SECURITY] Escape semua field yang asalnya dari input publik
        const safeNama    = escapeHtml(tiket.nama_pengunjung.trim().toUpperCase());
        const safeTier    = escapeHtml(String(order.tier_key).toUpperCase());
        const safeInvoice = escapeHtml(order.invoice_code);
        const safeQrCode  = escapeHtml(tiket.qr_code);
        tiketHtml += `
        <div class="h-ticket-card" style="page-break-after: always;">
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
                        <div class="h-main-val" style="font-family:'Share Tech Mono',monospace; color:#888; font-size:14px;">${safeInvoice}</div>
                    </div>
                </div>
                <div class="h-footer-lbl">
                    [SECURITY NOTE] ACCESS PASS ACTIVE. UNIQUE ID MATRIX ALLOWS FOR SINGLE SCAN ENTRY VALIDATION AT THE MAIN GATE.
                </div>
            </div>
            <div class="h-right-panel">
                <div class="h-vertical-tag">GATE PASS</div>
                <div class="h-qr-border">
                    <img class="h-qr-img" src="${urlQr}" alt="QR">
                </div>
                <div class="h-qr-code-str">${safeQrCode}</div>
            </div>
        </div>`;
    });

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`<!DOCTYPE html><html><head>
        <title>Tiket — ${escapeHtml(order.invoice_code)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { background:#030303; color:#fff; font-family:'Share Tech Mono',monospace; padding:24px; }
            .print-header { text-align:center; margin-bottom:28px; }
            .print-header h2 { font-family:'Orbitron',sans-serif; font-size:20px; color:#00ff66; letter-spacing:1px; }
            .print-header p  { font-size:12px; color:#666; margin-top:6px; }
            .print-btn { display:block; margin: 0 auto 28px; background:#CD0100; color:#fff; border:none; font-family:'Orbitron',sans-serif; font-size:11px; font-weight:900; padding:12px 28px; cursor:pointer; letter-spacing:2px; border-radius:6px; }
            .h-ticket-card {
                width:100%; max-width:700px; height:310px; margin:0 auto 28px;
                background:#0a0a0a; border:2px solid #1c1c1c; position:relative;
                display:flex; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5);
            }
            .h-hud-corner { position:absolute; width:12px; height:12px; border-color:#CD0100; border-style:solid; z-index:5; }
            .h-tl { top:12px; left:12px;   border-width:3px 0 0 3px; }
            .h-tr { top:12px; right:12px;  border-width:3px 3px 0 0; }
            .h-bl { bottom:12px; left:12px;  border-width:0 0 3px 3px; }
            .h-br { bottom:12px; right:12px; border-width:0 3px 3px 0; }
            .h-left-panel  { flex:1; padding:25px 30px; display:flex; flex-direction:column; justify-content:space-between; border-right:2px dashed #1f1f1f; }
            .h-brand-row   { display:flex; justify-content:space-between; align-items:center; }
            .h-logo-txt    { font-family:'Orbitron',sans-serif; font-size:22px; font-weight:900; letter-spacing:-1.5px; }
            .h-event-tag   { font-family:'Share Tech Mono',monospace; font-size:11px; color:#ff002a; letter-spacing:2px; font-weight:bold; }
            .h-flex-row    { display:flex; gap:15px; }
            .h-info-box    { background:#111; border:1px solid #1f1f1f; padding:10px 14px; flex:1; position:relative; margin-top:10px; }
            .h-info-box::after { content:''; position:absolute; top:0; left:0; width:3px; height:100%; background:#CD0100; }
            .h-mini-lbl    { font-family:'Share Tech Mono',monospace; font-size:9px; color:#555; text-transform:uppercase; letter-spacing:2px; }
            .h-main-val    { font-size:14px; font-weight:700; text-transform:uppercase; margin-top:2px; color:#fff; }
            .h-name-txt    { font-family:'Orbitron',sans-serif; font-size:20px; font-weight:900; }
            .h-tier-txt    { font-family:'Orbitron',sans-serif; font-size:20px; font-weight:900; color:#CD0100; }
            .h-footer-lbl  { font-family:'Share Tech Mono',monospace; font-size:8px; color:#333; line-height:1.3; border-top:1px dashed #262626; padding-top:8px; text-transform:uppercase; }
            .h-right-panel { width:190px; background:#0d0d0d; padding:25px 15px; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; }
            .h-qr-border   { padding:10px; border:2px solid #CD0100; background:#050505; box-shadow:0 0 15px rgba(205,1,0,0.2); margin-bottom:8px; }
            .h-qr-img      { width:125px; height:125px; display:block; border:3px solid #fff; background:#fff; }
            .h-qr-code-str { font-family:'Share Tech Mono',monospace; font-size:11px; font-weight:bold; letter-spacing:2px; color:#fff; text-align:center; }
            .h-vertical-tag { font-family:'Orbitron',sans-serif; font-size:8px; color:#222; letter-spacing:4px; transform:rotate(90deg); position:absolute; right:-28px; top:45%; text-transform:uppercase; }
            @media print {
                body { padding:0; }
                .print-header, .print-btn { display:none; }
                .h-ticket-card { margin:30px auto; page-break-after:always; box-shadow:none; border:2px solid #1c1c1c; }
                @page { size:landscape; margin:0; }
            }
        </style>
    </head><body>
        <div class="print-header">
            <h2>✓ CETAK TIKET — ${escapeHtml(order.invoice_code)}</h2>
            <p>${escapeHtml(order.nama_pemesan)} &bull; ${escapeHtml(String(order.tier_key).toUpperCase())} &bull; ${order.jumlah_tiket} Tiket &bull; Rp ${Number(order.total_harga).toLocaleString('id-ID')}</p>
        </div>
        <button class="print-btn" onclick="window.print()">// CETAK / SAVE PDF</button>
        ${tiketHtml}
    </body></html>`);
    printWindow.document.close();
}

// ==========================================================================
// SEARCH ENGINES
// ==========================================================================
function initSearchEngines() {
    const sf = document.getElementById('searchFighter');
    const sm = document.getElementById('searchMatch');
    const so = document.getElementById('searchOrder');
    const fs = document.getElementById('filterOrderStatus');

    if (sf) sf.addEventListener('input', (e) => renderFightersTable(e.target.value));
    if (sm) sm.addEventListener('input', (e) => renderMatchesTable(e.target.value));

    function triggerOrderFilter() {
        const q      = so ? so.value : "";
        const status = fs ? fs.value : "ALL";
        renderOrdersTable(q, status);
    }
    if (so) so.addEventListener('input', triggerOrderFilter);
    if (fs) fs.addEventListener('change', triggerOrderFilter);
}

// ==========================================================================
// MODAL SYSTEM
// ==========================================================================
function initModalSystem() {
    document.querySelectorAll('.close-modal-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
            document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('show'));
        });
    });

    const addFighterBtn = document.getElementById('addFighterBtn');
    if (addFighterBtn) {
        addFighterBtn.addEventListener('click', () => {
            document.getElementById('fighterForm').reset();
            document.getElementById('fighterId').value = "";
            document.getElementById('fighterModalTitle').innerText = "Tambah Fighter Baru";
            openModal('fighterModal');
        });
    }

    const addMatchBtn = document.getElementById('addMatchBtn');
    if (addMatchBtn) {
        addMatchBtn.addEventListener('click', () => {
            document.getElementById('matchForm').reset();
            document.getElementById('matchId').value = "";
            document.getElementById('matchModalTitle').innerText = "Buat Jadwal Match Arena Baru";
            openModal('matchModal');
        });
    }

    const btnExecuteDelete = document.getElementById('btnExecuteDelete');
    if (btnExecuteDelete) btnExecuteDelete.addEventListener('click', () => executeDeleteItem());

    // Notif "Lihat Semua" → navigasi ke tab tiket + auto-filter WAITING
    const notifGoToTickets = document.getElementById('notifGoToTickets');
    if (notifGoToTickets) {
        notifGoToTickets.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('notifDropdown').classList.remove('show');
            // Navigasi dulu, baru set filter setelah section aktif (hindari race condition)
            const menuItem = document.querySelector('.menu-item[data-section="tickets"]');
            if (menuItem) menuItem.click();
            requestAnimationFrame(() => {
                const filterSelect = document.getElementById('filterOrderStatus');
                if (filterSelect) {
                    filterSelect.value = 'WAITING';
                    filterSelect.dispatchEvent(new Event('change'));
                }
            });
        });
    }
}

function openModal(id)  { const el = document.getElementById(id); if (el) el.classList.add('show');    }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }

function updateMatchFormSelectOptions() {
    const blueSelect = document.getElementById('matchBlue');
    const redSelect  = document.getElementById('matchRed');
    if (!blueSelect || !redSelect) return;
    let optionsHtml = `<option value="" disabled selected>Pilih nama petarung...</option>`;
    appState.fighters.forEach(f => { optionsHtml += `<option value="${f.id}">${f.nama}</option>`; });
    blueSelect.innerHTML = optionsHtml;
    redSelect.innerHTML  = optionsHtml;
}

// ==========================================================================
// OPEN EDIT FUNCTIONS (global scope untuk onclick inline)
// ==========================================================================
window.openEditFighter = function(fighterId) {
    const f = appState.fighters.find(item => item.id === fighterId);
    if (!f) return;
    globalTargetId = fighterId;
    document.getElementById('fighterId').value      = "EDIT_MODE";
    document.getElementById('fighterName').value    = f.nama;
    document.getElementById('fighterNickname').value = f.nickname || "";
   document.getElementById('fighterSchool').value = f.gym || "";
document.getElementById('fighterHeight').value = f.height || 170; // Mengisi tinggi badan
document.getElementById('fighterWeight').value = f.weight || 0;   // Mengisi berat badan baru
    document.getElementById('fighterModalTitle').innerText = "Edit Data Profile Fighter";
    openModal('fighterModal');
};

window.openEditMatch = function(matchId) {
    const m = appState.matches.find(item => item.id === matchId);
    if (!m) return;
    globalTargetId = matchId;
    updateMatchFormSelectOptions();
    document.getElementById('matchId').value     = "EDIT_MODE";
    document.getElementById('matchPart').value   = m.title || "";
    document.getElementById('matchBlue').value   = m.fighter_blue || "";
    document.getElementById('matchRed').value    = m.fighter_red  || "";
    document.getElementById('matchTime').value   = m.weight_class || "";
    document.getElementById('matchStatus').value = m.status || "PENDING";
    document.getElementById('matchModalTitle').innerText = "Edit Susunan Match Card";
    openModal('matchModal');
};

window.openEditOrder = function(orderId, nama, kontak) {
    globalTargetId = orderId;
    document.getElementById('orderId').value           = orderId;
    document.getElementById('orderNamaInput').value    = nama;
    document.getElementById('orderWaInput').value      = kontak;
    document.getElementById('orderStatusSelect').value = "KEEP";
    openModal('orderModal');
};

window.triggerDeleteConfirm = function(type, id) {
    globalTargetType = type;
    globalTargetId   = id;
    openModal('deleteConfirmModal');
};

window.printTicketCyberpunk = printTicketCyberpunk;

// ==========================================================================
// DELETE
// ==========================================================================
async function executeDeleteItem() {
    toggleSkeleton(true);
    try {
        if (globalTargetType === 'match' && globalTargetId) {
            const { error } = await sb.from('matches').delete().eq('id', globalTargetId);
            if (error) throw error;
            showToast("Match Card berhasil dihapus!", "success");
            await logActivity(`Hapus match ${globalTargetId}`);
        } else if (globalTargetType === 'fighter' && globalTargetId) {
            const { error } = await sb.from('fighters').delete().eq('id', globalTargetId);
            if (error) throw error;
            showToast("Roster Fighter berhasil dihapus!", "success");
            await logActivity(`Hapus fighter ${globalTargetId}`);
        }
        await fetchDataFromSupabase();
    } catch (err) {
        console.error(err);
        showToast(`Gagal menghapus: ${err.message}`, "danger");
    } finally {
        toggleSkeleton(false);
        closeModal('deleteConfirmModal');
    }
}

// ==========================================================================
// UPLOAD FOTO FIGHTER
// ==========================================================================
async function uploadFighterPhoto(file) {
    const filePath = `fighters/${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
    const { data, error } = await sb.storage
        .from('fighter-photos')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error("Upload foto gagal: " + error.message);
    const { data: urlData } = sb.storage.from('fighter-photos').getPublicUrl(data.path);
    return urlData.publicUrl;
}

// ==========================================================================
// FORM HANDLERS
// ==========================================================================
function initFormHandlers() {
    // Fighter form
    const fighterForm = document.getElementById('fighterForm');
    if (fighterForm) {
        fighterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const isEdit    = document.getElementById('fighterId').value === "EDIT_MODE";
            const fileInput = document.getElementById('fighterAvatarFile');
            const submitBtn = fighterForm.querySelector('button[type="submit"]');

            let photoUrl = "";
            const currentFighter = appState.fighters.find(f => f.id === globalTargetId);
            if (currentFighter) photoUrl = currentFighter.photo_url || "";

            if (submitBtn) submitBtn.disabled = true;
            toggleSkeleton(true);
            try {
                if (fileInput && fileInput.files.length > 0) {
                    photoUrl = await uploadFighterPhoto(fileInput.files[0]);
                }
                const payload = {
    nama:      document.getElementById('fighterName').value,
    nickname:  document.getElementById('fighterNickname').value,
    height:    parseInt(document.getElementById('fighterHeight').value) || 170,
    weight:    parseInt(document.getElementById('fighterWeight').value) || 0, // Ambil nilai berat badan
    stance:    "Orthodox",
    gym:       document.getElementById('fighterSchool').value,
    photo_url: photoUrl
};
                if (isEdit) {
                    const { error } = await sb.from('fighters').update(payload).eq('id', globalTargetId);
                    if (error) throw error;
                    showToast("Profile Fighter berhasil diupdate!", "success");
                    await logActivity(`Edit fighter: ${payload.nama}`);
                } else {
                    const { error } = await sb.from('fighters').insert(payload);
                    if (error) throw error;
                    showToast("Fighter baru berhasil didaftarkan!", "success");
                    await logActivity(`Tambah fighter baru: ${payload.nama}`);
                }
                closeModal('fighterModal');
                await fetchDataFromSupabase();
            } catch (err) {
                console.error(err);
                showToast(`Gagal: ${err.message}`, "danger");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
                toggleSkeleton(false);
            }
        });
    }

    // Match form
    const matchForm = document.getElementById('matchForm');
    if (matchForm) {
        matchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const isEdit = document.getElementById('matchId').value === "EDIT_MODE";
            const payload = {
                fighter_red:  document.getElementById('matchRed').value,
                fighter_blue: document.getElementById('matchBlue').value,
                weight_class: document.getElementById('matchTime').value,
                title:        document.getElementById('matchPart').value,
                status:       document.getElementById('matchStatus').value
            };
            // [FIX BUG] Match baru sebelumnya gak pernah kirim match_order sama
            // sekali, jadi urutan fight card gak bisa diatur/gak konsisten pas
            // ditampilin di matches.html & preview admin (keduanya sort by
            // match_order ascending). Auto-assign ke urutan paling akhir.
            if (!isEdit) {
                const maxOrder = appState.matches.reduce((max, m) => Math.max(max, m.match_order || 0), 0);
                payload.match_order = maxOrder + 1;
            }
            toggleSkeleton(true);
            try {
                if (isEdit) {
                    const { error } = await sb.from('matches').update(payload).eq('id', globalTargetId);
                    if (error) throw error;
                    showToast("Match Card sukses dimodifikasi!", "success");
                    await logActivity(`Edit match: ${payload.title || 'Untitled'}`);
                } else {
                    const { error } = await sb.from('matches').insert(payload);
                    if (error) throw error;
                    showToast("Match Card baru sukses dibuat!", "success");
                    await logActivity(`Tambah match baru: ${payload.title || 'Untitled'}`);
                }
                closeModal('matchModal');
                await fetchDataFromSupabase();
            } catch (err) {
                console.error(err);
                showToast(`Gagal: ${err.message}`, "danger");
            } finally {
                toggleSkeleton(false);
            }
        });
    }

    // Order form
    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const namaBaru    = document.getElementById('orderNamaInput').value;
            const waBaru      = document.getElementById('orderWaInput').value;
            const statusAction = document.getElementById('orderStatusSelect').value;
            toggleSkeleton(true);
            try {
                const { error: updateErr } = await sb.from('orders')
                    .update({ nama_pemesan: namaBaru, kontak_wa: waBaru })
                    .eq('id', globalTargetId);
                if (updateErr) throw updateErr;

                if (statusAction === "PAID") {
                    const { error: payErr } = await sb.from('orders')
                        .update({ payment_status: 'PAID' })
                        .eq('id', globalTargetId);
                    if (payErr) throw payErr;
                    await logActivity(`Invoice di-set LUNAS (order ${globalTargetId})`);
                    showToast("Invoice berhasil diset LUNAS!", "success");
                } else {
                    showToast("Data penonton berhasil diperbarui.", "success");
                }
                closeModal('orderModal');
                await fetchDataFromSupabase();
            } catch (err) {
                console.error(err);
                showToast(`Gagal: ${err.message}`, "danger");
            } finally {
                toggleSkeleton(false);
            }
        });
    }
}

// ==========================================================================
// SCANNER — AUDIO, VERIFIKASI, KAMERA, FILE
// ==========================================================================
function playAudioFeedback(isSuccess) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx      = new AudioContext();
        const osc      = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        if (isSuccess) {
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start(); osc.stop(ctx.currentTime + 0.12);
        } else {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(130, ctx.currentTime);
            gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
            osc.start(); osc.stop(ctx.currentTime + 0.28);
        }
    } catch (e) { console.error("Audio feedback error:", e); }
}

async function eksekusiVerifikasiDatabase(decodedText) {
    const cameraBox    = document.getElementById('camera-box-interface');
    const uploadBox    = document.getElementById('upload-box-interface');
    const monitorResult = document.getElementById('monitor-result');
    const resTitle     = document.getElementById('res-title');
    const resName      = document.getElementById('res-name');
    const resDetail    = document.getElementById('res-detail');
    const countEl      = document.getElementById('session-counter');

    if (cameraBox)     cameraBox.style.display     = 'none';
    if (uploadBox)     uploadBox.style.display     = 'none';
    if (monitorResult) {
        monitorResult.style.display = 'block';
        monitorResult.className     = "result-panel";
        resTitle.innerText = "PROCESSING...";
        resName.innerText  = "VERIFYING MATRIX DATA...";
        resDetail.innerText = `ID: ${decodedText}`;
    }

    try {
        const { data, error } = await sb.rpc('checkin_ticket', { p_qr_code: decodedText });
        if (error) throw error;
        const res = data[0];
        if (monitorResult) monitorResult.className = "result-panel";

        if (res.result === "success") {
            if (monitorResult) {
                monitorResult.classList.add("state-success");
                resTitle.innerText  = "ACCESS GRANTED";
                resName.innerText   = `NAME: ${res.nama_pengunjung}`;
                resDetail.innerText = `STATUS: CHECK-IN BERHASIL (Invoice ${res.invoice_code})`;
            }
            playAudioFeedback(true);
            verifiedSessionCount++;
            if (countEl) countEl.innerText = `SESSION VERIFIED: ${verifiedSessionCount} TIKET`;
            showToast("Check-In Berhasil!", "success");

        } else if (res.result === "already_checked_in") {
            const jam = res.checked_in_at ? new Date(res.checked_in_at).toLocaleTimeString('id-ID') : '-';
            if (monitorResult) {
                monitorResult.classList.add("state-bocor");
                resTitle.innerText  = "ACCESS DENIED";
                resName.innerText   = `NAME: ${res.nama_pengunjung}`;
                resDetail.innerText = `⚠️ WARNING: TIKET SUDAH PERNAH MASUK JAM ${jam}`;
            }
            playAudioFeedback(false);
            showToast("Warning! Tiket sudah terpakai.", "warning");

        } else if (res.result === "not_paid") {
            if (monitorResult) {
                monitorResult.classList.add("state-bocor");
                resTitle.innerText  = "PAYMENT NOT CONFIRMED";
                resName.innerText   = `NAME: ${res.nama_pengunjung || '-'}`;
                resDetail.innerText = `LOG: Invoice ${res.invoice_code} belum LUNAS.`;
            }
            playAudioFeedback(false);
            showToast("Akses Ditolak! Pembayaran belum lunas.", "danger");

        } else {
            if (monitorResult) {
                monitorResult.classList.add("state-bocor");
                resTitle.innerText  = "INVALID PASS";
                resName.innerText   = "ERROR: TIKET TIDAK TERDAFTAR";
                resDetail.innerText = `LOG: QR Code tidak ditemukan.`;
            }
            playAudioFeedback(false);
            showToast("Akses Ditolak!", "danger");
        }
        silentFetchStats();
    } catch (err) {
        console.error(err);
        if (monitorResult) {
            monitorResult.className = "result-panel state-bocor";
            resTitle.innerText  = "NETWORK ERROR";
            resName.innerText   = "GAGAL MENYAMBUNG KE DATABASE";
            resDetail.innerText = `LOG: ${err.message || err.toString()}`;
        }
        playAudioFeedback(false);
        showToast("Error memproses data scanner", "danger");
    } finally {
        const inputField = document.getElementById('ticketScannerInput');
        if (inputField) inputField.value = "";
    }
}

function jalankanKameraScanner() {
    const cameraBox     = document.getElementById('camera-box-interface');
    const uploadBox     = document.getElementById('upload-box-interface');
    const monitorResult = document.getElementById('monitor-result');
    const fileInput     = document.getElementById('qr-input-file');
    const manualInput   = document.getElementById('ticketScannerInput');

    if (cameraBox)     cameraBox.style.display     = 'block';
    if (uploadBox)     uploadBox.style.display     = 'block';
    if (monitorResult) monitorResult.style.display = 'none';
    if (fileInput)     fileInput.value             = "";
    if (manualInput)   manualInput.value           = "";
    isScanningActive = true;

    if (!html5QrcodeScanner) html5QrcodeScanner = new Html5Qrcode("reader");

    if (!html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
                if (!isScanningActive) return;
                isScanningActive = false;
                html5QrcodeScanner.stop()
                    .then(()  => eksekusiVerifikasiDatabase(decodedText))
                    .catch(() => eksekusiVerifikasiDatabase(decodedText));
            }
        ).catch(err => {
            console.warn("Kamera tidak tersedia, masuk mode upload gambar.");
        });
    }
}

function stopKameraScanner() {
    isScanningActive = false;
    if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
        html5QrcodeScanner.stop().catch(() => {});
    }
}

function prosesScanFileGambar(file) {
    const cameraBox     = document.getElementById('camera-box-interface');
    const uploadBox     = document.getElementById('upload-box-interface');
    const monitorResult = document.getElementById('monitor-result');
    const resTitle      = document.getElementById('res-title');
    const resName       = document.getElementById('res-name');

    if (cameraBox)     cameraBox.style.display     = 'none';
    if (uploadBox)     uploadBox.style.display     = 'none';
    if (monitorResult) {
        monitorResult.style.display = 'block';
        resTitle.innerText = "READING FILE...";
        resName.innerText  = "DECODING IMAGE MATRIX...";
    }

    if (!html5QrcodeScanner) html5QrcodeScanner = new Html5Qrcode("reader");

    html5QrcodeScanner.scanFile(file, false)
        .then(decodedText => eksekusiVerifikasiDatabase(decodedText))
        .catch(() => {
            if (monitorResult) {
                monitorResult.className = "result-panel state-bocor";
                document.getElementById('res-title').innerText = "SCAN FAILED";
                document.getElementById('res-name').innerText  = "QR CODE TIDAK TERDETEKSI";
                document.getElementById('res-detail').innerText = "LOG: Pastikan gambar memiliki pencahayaan yang jelas.";
            }
            playAudioFeedback(false);
            showToast("QR Code tidak terdeteksi pada berkas!", "danger");
        });
}

function initScannerUIHandlers() {
    const btnVerifyTicket = document.getElementById('btnVerifyTicket');
    if (btnVerifyTicket) {
        btnVerifyTicket.addEventListener('click', () => {
            const manualInput = document.getElementById('ticketScannerInput');
            const qrTarget    = manualInput ? manualInput.value.trim() : "";
            if (!qrTarget) { showToast("Masukkan ID QR unik penonton!", "warning"); return; }
            if (isScanningActive && html5QrcodeScanner && html5QrcodeScanner.isScanning) {
                isScanningActive = false;
                html5QrcodeScanner.stop()
                    .then(()  => eksekusiVerifikasiDatabase(qrTarget))
                    .catch(() => eksekusiVerifikasiDatabase(qrTarget));
            } else {
                eksekusiVerifikasiDatabase(qrTarget);
            }
        });
    }

    const btnResetScan = document.getElementById('btn-reset-scan');
    if (btnResetScan) btnResetScan.addEventListener('click', jalankanKameraScanner);

    const fileInput = document.getElementById('qr-input-file');
    if (fileInput) {
        fileInput.addEventListener('change', e => {
            if (e.target.files.length === 0) return;
            const fileGambar = e.target.files[0];
            if (isScanningActive && html5QrcodeScanner && html5QrcodeScanner.isScanning) {
                isScanningActive = false;
                html5QrcodeScanner.stop()
                    .then(()  => prosesScanFileGambar(fileGambar))
                    .catch(() => prosesScanFileGambar(fileGambar));
            } else {
                prosesScanFileGambar(fileGambar);
            }
        });
    }
}

// ==========================================================================
// NAVIGATION & DROPDOWNS
// ==========================================================================
function initNavigation() {
    const menuItems = document.querySelectorAll('.menu-item, .menu-shortcut');
    const sections  = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('pageTitle');
    const sidebar   = document.getElementById('sidebar');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = item.getAttribute('data-section');
            document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
            const activeMenu = document.querySelector(`.menu-item[data-section="${targetSection}"]`);
            if (activeMenu) activeMenu.classList.add('active');
            sections.forEach(sec => sec.classList.remove('active'));
            const currentSection = document.getElementById(`section-${targetSection}`);
            if (currentSection) currentSection.classList.add('active');
            pageTitle.innerText = activeMenu ? activeMenu.querySelector('span').innerText : "Overview";
            sidebar.classList.remove('mobile-open');
            if (targetSection === "verify") jalankanKameraScanner();
            else stopKameraScanner();
        });
    });

    const hamburgerBtn   = document.getElementById('hamburgerBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    if (hamburgerBtn)    hamburgerBtn.addEventListener('click',    () => sidebar.classList.add('mobile-open'));
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('mobile-open'));
}

function initDropdowns() {
    const ndBtn = document.getElementById('notifDropdownBtn');
    const pdBtn = document.getElementById('profileDropdownBtn');

    if (ndBtn) {
        ndBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('profileDropdown').classList.remove('show');
            document.getElementById('notifDropdown').classList.toggle('show');
        });
    }
    if (pdBtn) {
        pdBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('notifDropdown').classList.remove('show');
            document.getElementById('profileDropdown').classList.toggle('show');
        });
    }
    document.addEventListener('click', () => {
        const nd = document.getElementById('notifDropdown');
        const pd = document.getElementById('profileDropdown');
        if (nd) nd.classList.remove('show');
        if (pd) pd.classList.remove('show');
    });
}