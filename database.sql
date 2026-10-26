-- ====================================================================
-- SKEMA DATABASE SISTEM INFORMASI PENYEWAAN MOBIL (VERSI 1.1)
-- Sesuai Bab V Proposal Aplikasi Rental Mobil Berbasis Web
-- ====================================================================

-- 1. USERS (Akun Internal 4 Peran)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nama TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'staff', 'akuntansi', 'owner')) NOT NULL,
    status TEXT DEFAULT 'aktif', -- 'aktif', 'terkunci', 'nonaktif'
    failed_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. AUDIT LOG (Pencatatan Aktivitas & Perubahan Penting)
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    role TEXT,
    tindakan TEXT NOT NULL,
    tabel TEXT NOT NULL,
    record_id TEXT,
    data_sebelum TEXT,
    data_sesudah TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 3. KATEGORI MOBIL
CREATE TABLE IF NOT EXISTS kategori_mobil (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_kategori TEXT NOT NULL,
    keterangan TEXT
);

-- 4. MOBIL
CREATE TABLE IF NOT EXISTS mobil (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kategori_id INTEGER,
    nama TEXT NOT NULL,
    nomor_polisi TEXT UNIQUE NOT NULL,
    transmisi TEXT DEFAULT 'Manual',
    kapasitas INTEGER DEFAULT 7,
    tarif_per_hari REAL NOT NULL,
    foto TEXT,
    fasilitas TEXT,
    status TEXT DEFAULT 'tersedia', -- 'tersedia', 'disewa', 'perawatan'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(kategori_id) REFERENCES kategori_mobil(id)
);

-- 5. CUSTOMER (Pelanggan Tetap & Blacklist)
CREATE TABLE IF NOT EXISTS customer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    nomor_wa TEXT NOT NULL,
    email TEXT,
    alamat TEXT,
    total_sewa INTEGER DEFAULT 0,
    status_blacklist INTEGER DEFAULT 0, -- 0 = Normal, 1 = Blacklist
    alasan_blacklist TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 6. PEMESANAN (Order Rental)
CREATE TABLE IF NOT EXISTS pemesanan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_booking TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL,
    mobil_id INTEGER NOT NULL,
    tanggal_mulai TEXT NOT NULL,
    tanggal_selesai TEXT NOT NULL,
    durasi_hari INTEGER NOT NULL,
    opsi_sopir INTEGER DEFAULT 0, -- 0 = Lepas Kunci, 1 = Dengan Sopir
    sopir_id INTEGER,
    tujuan TEXT,
    lokasi_jemput TEXT,
    biaya_mobil REAL NOT NULL,
    biaya_sopir REAL DEFAULT 0,
    biaya_tambahan REAL DEFAULT 0,
    diskon REAL DEFAULT 0,
    total_harga REAL NOT NULL,
    status TEXT DEFAULT 'menunggu_pemeriksaan', 
    -- Alur: 'menunggu_pemeriksaan', 'menunggu_persetujuan', 'terkonfirmasi', 'berjalan', 'selesai'
    -- Exit: 'ditolak', 'kedaluwarsa', 'dibatalkan'
    alasan_status TEXT,
    catatan TEXT,
    batas_kedaluwarsa TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customer(id),
    FOREIGN KEY(mobil_id) REFERENCES mobil(id),
    FOREIGN KEY(sopir_id) REFERENCES sopir(id)
);

-- 7. RIWAYAT STATUS PEMESANAN
CREATE TABLE IF NOT EXISTS riwayat_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pemesanan_id INTEGER NOT NULL,
    status_lama TEXT,
    status_baru TEXT NOT NULL,
    diubah_oleh TEXT NOT NULL,
    catatan TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(pemesanan_id) REFERENCES pemesanan(id)
);

-- 8. VERIFIKASI IDENTITAS (Pemeriksaan KTP / SIM)
CREATE TABLE IF NOT EXISTS verifikasi_identitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pemesanan_id INTEGER NOT NULL,
    jenis_dokumen TEXT DEFAULT 'KTP', -- 'KTP', 'SIM A'
    nomor_dokumen TEXT,
    status_verifikasi TEXT DEFAULT 'belum_diperiksa', -- 'belum_diperiksa', 'valid', 'tidak_valid'
    diverifikasi_oleh TEXT,
    catatan TEXT,
    file_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(pemesanan_id) REFERENCES pemesanan(id)
);

-- 9. SOPIR
CREATE TABLE IF NOT EXISTS sopir (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    nomor_wa TEXT NOT NULL,
    tarif_per_hari REAL DEFAULT 150000,
    status TEXT DEFAULT 'tersedia', -- 'tersedia', 'bertugas', 'nonaktif'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 10. JADWAL SOPIR (Penugasan & Konfirmasi Bertoken)
CREATE TABLE IF NOT EXISTS jadwal_sopir (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pemesanan_id INTEGER NOT NULL,
    sopir_id INTEGER NOT NULL,
    token_konfirmasi TEXT UNIQUE NOT NULL,
    status_konfirmasi TEXT DEFAULT 'menunggu', -- 'menunggu', 'diterima', 'ditolak'
    masa_berlaku TEXT NOT NULL,
    catatan TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(pemesanan_id) REFERENCES pemesanan(id),
    FOREIGN KEY(sopir_id) REFERENCES sopir(id)
);

-- 11. PENGEMBALIAN (Check-in Mobil & Denda)
CREATE TABLE IF NOT EXISTS pengembalian (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pemesanan_id INTEGER NOT NULL,
    tanggal_kembali TEXT NOT NULL,
    kondisi_bbm TEXT, -- 'Full', '3/4', '1/2', '1/4'
    odometer_akhir INTEGER,
    catatan_kondisi TEXT,
    jam_terlambat INTEGER DEFAULT 0,
    denda_keterlambatan REAL DEFAULT 0,
    denda_kerusakan REAL DEFAULT 0,
    biaya_tambahan_lain REAL DEFAULT 0,
    total_denda REAL DEFAULT 0,
    diproses_oleh TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(pemesanan_id) REFERENCES pemesanan(id)
);

-- 12. DOKUMEN KENDARAAN (Pengingat Pajak, KIR, Asuransi, Servis)
CREATE TABLE IF NOT EXISTS dokumen_kendaraan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mobil_id INTEGER NOT NULL,
    jenis_dokumen TEXT NOT NULL, -- 'Pajak STNK', 'Uji KIR', 'Asuransi', 'Jadwal Servis'
    nomor_dokumen TEXT,
    tanggal_berlaku TEXT NOT NULL,
    catatan TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(mobil_id) REFERENCES mobil(id)
);

-- 13. PEMBAYARAN (DP, Pelunasan, Deposit)
CREATE TABLE IF NOT EXISTS pembayaran (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pemesanan_id INTEGER NOT NULL,
    jenis_pembayaran TEXT NOT NULL, -- 'DP', 'Pelunasan', 'Deposit'
    nominal REAL NOT NULL,
    metode TEXT DEFAULT 'Transfer Bank', -- 'Transfer Bank', 'Tunai', 'QRIS'
    bukti_bayar TEXT,
    status TEXT DEFAULT 'diterima', -- 'diterima' (staff), 'terverifikasi' (akuntansi), 'ditolak'
    ditandai_oleh TEXT,
    diverifikasi_oleh TEXT,
    catatan TEXT,
    tanggal_diterima TEXT DEFAULT CURRENT_TIMESTAMP,
    tanggal_verifikasi TEXT,
    FOREIGN KEY(pemesanan_id) REFERENCES pemesanan(id)
);

-- 14. TRANSAKSI KEUANGAN (Arus Kas Pemasukan & Pengeluaran)
CREATE TABLE IF NOT EXISTS transaksi_keuangan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jenis TEXT NOT NULL, -- 'pemasukan', 'pengeluaran'
    kategori TEXT NOT NULL, -- 'Sewa Mobil', 'Perawatan/Servis', 'BBM', 'Gaji Staff', 'Gaji Sopir', 'Operasional', 'Lain-lain'
    nominal REAL NOT NULL,
    tanggal TEXT NOT NULL,
    keterangan TEXT,
    bukti_transaksi TEXT,
    dicatat_oleh TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 15. PENGGAJIAN (Payroll Sederhana)
CREATE TABLE IF NOT EXISTS penggajian (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    sopir_id INTEGER,
    nama_penerima TEXT NOT NULL,
    role_penerima TEXT NOT NULL,
    periode TEXT NOT NULL,
    gaji_pokok REAL DEFAULT 0,
    insentif REAL DEFAULT 0,
    bonus_perjalanan REAL DEFAULT 0,
    potongan REAL DEFAULT 0,
    total_diterima REAL NOT NULL,
    status_bayar TEXT DEFAULT 'draft', -- 'draft', 'dibayar'
    tanggal_bayar TEXT,
    dicatat_oleh TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(sopir_id) REFERENCES sopir(id)
);

-- 16. TIKET KENDALA (IT & Support - Lanjutan)
CREATE TABLE IF NOT EXISTS tiket_kendala (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pelapor TEXT NOT NULL,
    judul TEXT NOT NULL,
    deskripsi TEXT NOT NULL,
    prioritas TEXT DEFAULT 'sedang', -- 'rendah', 'sedang', 'tinggi'
    status TEXT DEFAULT 'terbuka', -- 'terbuka', 'diproses', 'selesai'
    solusi TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Pendukung: Dashboard Kinerja APK (Mempertahankan data lama jika ada)
CREATE TABLE IF NOT EXISTS dashboard (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    project_name TEXT NOT NULL,
    release_date TEXT NOT NULL,
    anggota_json TEXT NOT NULL
);
