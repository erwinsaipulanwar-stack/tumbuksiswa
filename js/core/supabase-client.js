/**
 * ==========================================================================
 * TUMBUK SISWA — SUPABASE CLIENT CONFIG
 * File ini dipakai bersama oleh semua halaman (public & admin).
 * Wajib di-load SEBELUM js lain yang pakai `supabase` (lihat urutan <script> di HTML).
 * ==========================================================================
 */

// ⚠️ GANTI dengan URL & Anon Key project Supabase kamu sendiri.
// Lokasi: Supabase Dashboard > Project Settings > API
const SUPABASE_URL = "https://wpgcbpwzaormdsdywzfd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Gl-90SkoiuGXzNp0QFVNoA_qWDxEu9z";

// Inisialisasi client (variabel global `supabase` dari library CDN)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

