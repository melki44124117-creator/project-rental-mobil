const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

// ====================================================================
// 1. INISIALISASI DATABASE & SKEMA
// ====================================================================
const dbPath = path.join(__dirname, "dashboard.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Baca dan jalankan skema tabel dari database.sql
const sqlSchemaPath = path.join(__dirname, "database.sql");
if (fs.existsSync(sqlSchemaPath)) {
  const schemaSql = fs.readFileSync(sqlSchemaPath, "utf-8");
  db.exec(schemaSql);
}

// ====================================================================
// 2. SEED DATA AWAL (JIKA DATABASE MASIH KOSONG)
// ====================================================================
function seedDatabase() {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount === 0) {
    console.log("Melakukan seeding data awal sistem rental...");

    // 1. Seed Users (Admin, Staff, Akuntansi, Owner)
    const salt = bcrypt.genSaltSync(10);
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, nama, role, status)
      VALUES (?, ?, ?, ?, 'aktif')
    `);
    insertUser.run("admin", bcrypt.hashSync("admin123", salt), "Melki (Administrator)", "admin");
    insertUser.run("staff", bcrypt.hashSync("staff123", salt), "Bambang (Staff Operasional)", "staff");
    insertUser.run("akuntansi", bcrypt.hashSync("akuntansi123", salt), "Siti (Akuntansi & Keuangan)", "akuntansi");
    insertUser.run("owner", bcrypt.hashSync("owner123", salt), "H. Rahmatul (Pemilik Rental)", "owner");

    // 2. Seed Kategori Mobil
    const insertKat = db.prepare("INSERT INTO kategori_mobil (nama_kategori, keterangan) VALUES (?, ?)");
    insertKat.run("MPV Family", "Mobil keluarga lega dan nyaman 7 penumpang");
    insertKat.run("City Car", "Mobil lincah, hemat BBM, cocok untuk perkotaan");
    insertKat.run("SUV Premium", "Mobil tangguh, bertenaga, dan mewah untuk segala medan");
    insertKat.run("Compact MPV", "Pilihan ekonomis untuk rombongan kecil");

    // 3. Seed Mobil
    const insertMobil = db.prepare(`
      INSERT INTO mobil (kategori_id, nama, nomor_polisi, transmisi, kapasitas, tarif_per_hari, foto, fasilitas, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMobil.run(1, "Toyota Avanza 1.3 G", "B 1823 KDA", "Manual", 7, 350000, "avanza.jpg", "AC Double Blower, Audio Bluetooth, Sensor Parkir, USB Charger", "tersedia");
    insertMobil.run(1, "Toyota Innova Zenix V Hybrid", "B 2049 EFG", "Matic", 7, 750000, "zenix.jpg", "Captain Seat, Panoramic Sunroof, Kamera 360, Layar Belakang, TSS", "tersedia");
    insertMobil.run(2, "Honda Brio RS", "B 1288 SFT", "Matic", 5, 300000, "brio.jpg", "AC Digital, Apple CarPlay/Android Auto, Irit BBM, Smart Entry", "tersedia");
    insertMobil.run(3, "Mitsubishi Pajero Sport Dakar 4x2", "B 9901 RFS", "Matic", 7, 900000, "pajero.jpg", "Sunroof, Leather Seats, Cruise Control, Audio Premium, 7 Airbags", "tersedia");
    insertMobil.run(4, "Daihatsu Sigra 1.2 R DLX", "B 2731 KLS", "Manual", 7, 280000, "sigra.jpg", "AC Double Blower, Irit BBM, Dual Airbag, Headunit Touchscreen", "tersedia");

    // 4. Seed Dokumen Kendaraan (Pengingat Pajak, KIR, Asuransi, Servis)
    const insertDok = db.prepare(`
      INSERT INTO dokumen_kendaraan (mobil_id, jenis_dokumen, nomor_dokumen, tanggal_berlaku, catatan)
      VALUES (?, ?, ?, ?, ?)
    `);
    // Avanza: Pajak mendekati jatuh tempo (14 hari ke depan untuk uji pengingat)
    const tglDekat = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const tglAman = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    insertDok.run(1, "Pajak STNK", "STNK-AVZ-01", tglDekat, "Perlu perpanjangan STNK tahunan");
    insertDok.run(1, "Uji KIR", "KIR-AVZ-01", tglAman, "Masa berlaku uji KIR 6 bulanan");
    insertDok.run(1, "Jadwal Servis", "SRV-50K", tglDekat, "Servis berkala 50.000 KM & ganti oli");
    insertDok.run(2, "Asuransi All Risk", "ASR-ZNX-99", tglAman, "Klaim pertanggungan komprehensif");
    insertDok.run(3, "Pajak STNK", "STNK-BRIO-02", tglAman, "STNK aktif sampai tahun depan");
    insertDok.run(4, "Pajak STNK", "STNK-PJR-03", tglAman, "STNK aktif");

    // 5. Seed Sopir
    const insertSopir = db.prepare("INSERT INTO sopir (nama, nomor_wa, tarif_per_hari, status) VALUES (?, ?, ?, ?)");
    insertSopir.run("Budi Santoso", "081298765431", 150000, "tersedia");
    insertSopir.run("Agus Haryanto", "081387654321", 150000, "tersedia");
    insertSopir.run("Hendra Wijaya", "081576543210", 150000, "tersedia");

    // 6. Seed Pelanggan (Customer) & Blacklist
    const insertCust = db.prepare(`
      INSERT INTO customer (nama, nomor_wa, email, alamat, total_sewa, status_blacklist, alasan_blacklist)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertCust.run("Andi Pratama", "081234560005", "andi.pratama@gmail.com", "Jl. Tebet Raya No. 12, Jakarta Selatan", 2, 0, null);
    insertCust.run("Fajar Nugroho", "081234560004", "fajar.nugroho@yahoo.com", "Jl. Boulevard BSD No. 88, Tangerang", 1, 0, null);
    insertCust.run("Doni Kusuma", "081399887766", "doni.k@gmail.com", "Jl. Kemang Timur No. 4, Jakarta", 1, 1, "Terlambat 3 hari tanpa konfirmasi dan ada kerusakan bumper tidak diganti");

    // 7. Seed Pemesanan Contoh
    const tglMulai1 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const tglSelesai1 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const batasExp = new Date(Date.now() + 24 * 3600000).toISOString();

    const insertPemesanan = db.prepare(`
      INSERT INTO pemesanan (
        kode_booking, customer_id, mobil_id, tanggal_mulai, tanggal_selesai, durasi_hari,
        opsi_sopir, sopir_id, tujuan, lokasi_jemput, biaya_mobil, biaya_sopir, biaya_tambahan, diskon, total_harga,
        status, catatan, batas_kedaluwarsa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Order 1: Menunggu Pemeriksaan
    insertPemesanan.run(
      "BK-0142", 1, 2, tglMulai1, tglSelesai1, 3,
      1, 1, "Bandung & Lembang", "Antar ke rumah penyewa (Tebet)",
      2250000, 450000, 50000, 0, 2750000,
      "menunggu_pemeriksaan", "Keluarga 5 orang, butuh car seat jika ada", batasExp
    );

    // Order 2: Terkonfirmasi
    const tglMulai2 = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
    const tglSelesai2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    insertPemesanan.run(
      "BK-0141", 2, 1, tglMulai2, tglSelesai2, 3,
      0, null, "Puncak Bogor", "Ambil di kantor rental",
      1050000, 0, 0, 50000, 1000000,
      "terkonfirmasi", "Sewa lepas kunci dinas kantor", null
    );

    // 8. Seed Riwayat Status
    const insertRiw = db.prepare(`
      INSERT INTO riwayat_status (pemesanan_id, status_lama, status_baru, diubah_oleh, catatan)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertRiw.run(1, null, "menunggu_pemeriksaan", "Sistem Publik", "Order baru dibuat customer dari website");
    insertRiw.run(2, null, "menunggu_pemeriksaan", "Sistem Publik", "Order dibuat");
    insertRiw.run(2, "menunggu_pemeriksaan", "terkonfirmasi", "Bambang (Staff)", "Ketersediaan mobil oke & DP diverifikasi");

    // 9. Seed Verifikasi Identitas
    const insertVerif = db.prepare(`
      INSERT INTO verifikasi_identitas (pemesanan_id, jenis_dokumen, nomor_dokumen, status_verifikasi, diverifikasi_oleh, catatan)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertVerif.run(1, "KTP", "3174051203900001", "belum_diperiksa", null, "Menunggu penyerahan fisik / foto KTP");
    insertVerif.run(2, "SIM A", "SIM-9204-1234", "valid", "Bambang (Staff)", "SIM A asli masih berlaku s/d 2028");

    // 10. Seed Pembayaran
    const insertBayar = db.prepare(`
      INSERT INTO pembayaran (pemesanan_id, jenis_pembayaran, nominal, metode, status, ditandai_oleh, diverifikasi_oleh, tanggal_verifikasi, catatan)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Order 1: DP ditandai diterima staff, belum diverifikasi akuntansi
    insertBayar.run(1, "DP", 1375000, "Transfer Bank BCA", "diterima", "Bambang (Staff)", null, null, "Bukti transfer m-banking dilampirkan via WA");
    // Order 2: DP sudah diverifikasi akuntansi
    insertBayar.run(2, "DP", 500000, "Transfer Bank Mandiri", "terverifikasi", "Bambang (Staff)", "Siti (Akuntansi)", new Date().toISOString(), "Dana telah masuk di rekening koran");

    // 11. Seed Transaksi Keuangan (Arus Kas)
    const insertKas = db.prepare(`
      INSERT INTO transaksi_keuangan (jenis, kategori, nominal, tanggal, keterangan, dicatat_oleh)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertKas.run("pemasukan", "Sewa Mobil", 500000, tglMulai2, "DP Sewa Avanza BK-0141", "Siti (Akuntansi)");
    insertKas.run("pengeluaran", "Perawatan/Servis", 350000, tglMulai2, "Ganti oli mesin & filter Avanza", "Siti (Akuntansi)");
    insertKas.run("pengeluaran", "Operasional", 120000, tglMulai2, "Cuci dan salon interior armada", "Siti (Akuntansi)");

    // 12. Seed Jadwal Sopir & Token
    const insertJadwal = db.prepare(`
      INSERT INTO jadwal_sopir (pemesanan_id, sopir_id, token_konfirmasi, status_konfirmasi, masa_berlaku, catatan)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertJadwal.run(1, 1, "token-budi-0142", "menunggu", batasExp, "Tugas perjalanan Bandung 3 hari");

    // 13. Seed Penggajian
    const insertGaji = db.prepare(`
      INSERT INTO penggajian (user_id, sopir_id, nama_penerima, role_penerima, periode, gaji_pokok, insentif, bonus_perjalanan, potongan, total_diterima, status_bayar, dicatat_oleh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertGaji.run(2, null, "Bambang", "Staff Operasional", "Oktober 2026", 3500000, 300000, 0, 50000, 3750000, "dibayar", "Siti (Akuntansi)");
    insertGaji.run(null, 1, "Budi Santoso", "Sopir", "Oktober 2026", 1800000, 200000, 450000, 0, 2450000, "draft", "Siti (Akuntansi)");

    // 14. Seed Audit Log Awal
    const insertAudit = db.prepare(`
      INSERT INTO audit_log (user_id, username, role, tindakan, tabel, record_id, data_sebelum, data_sesudah)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run(1, "admin", "admin", "INIT_SYSTEM", "system", "0", null, "Inisialisasi sistem rental mobil v1.1 selesai");

    console.log("Seeding data awal berhasil.");
  }

  // Cek apakah tabel dashboard lama ada isi untuk backward-compatibility
  const dashCount = db.prepare("SELECT COUNT(*) AS c FROM dashboard").get().c;
  if (dashCount === 0) {
    db.prepare(`
      INSERT INTO dashboard (id, project_name, release_date, anggota_json)
      VALUES (1, 'Sistem Informasi Rental Mobil v1.1', '2026-12-15', '[]')
    `).run();
  }
}

seedDatabase();

// ====================================================================
// 3. MIDDLEWARE UMUM & KEAMANAN
// ====================================================================
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Sesi Pengguna
app.use(
  session({
    secret: "rodakita-secret-key-2026-supersecure",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 30 * 60 * 1000 // 30 Menit tidak aktif sesuai Bab II Nonfungsional
    }
  })
);

// Pembatasan Rate Limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Menit
  max: 300,
  message: { pesan: "Terlalu banyak permintaan dari IP ini, coba lagi nanti." }
});
app.use("/api/", apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { pesan: "Terlalu banyak percobaan login, silakan tunggu 15 menit." }
});

// Middleware Helper: Audit Logger
function logAudit(req, tindakan, tabel, recordId, dataSebelum, dataSesudah) {
  try {
    const user = req.session ? req.session.user : null;
    const userId = user ? user.id : null;
    const username = user ? user.username : "publik/sistem";
    const role = user ? user.role : "publik";

    db.prepare(`
      INSERT INTO audit_log (user_id, username, role, tindakan, tabel, record_id, data_sebelum, data_sesudah)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      username,
      role,
      tindakan,
      tabel,
      String(recordId || ""),
      dataSebelum ? JSON.stringify(dataSebelum) : null,
      dataSesudah ? JSON.stringify(dataSesudah) : null
    );
  } catch (err) {
    console.error("Gagal mencatat audit log:", err);
  }
}

// Middleware Helper: RBAC (Role Based Access Control)
function requireAuth(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ pesan: "Akses ditolak. Anda belum login." });
    }
    const userRole = req.session.user.role;
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        pesan: `Akses ditolak. Peran '${userRole}' tidak memiliki hak untuk operasi ini.`
      });
    }
    next();
  };
}

// Helper: Deteksi bentrok jadwal mobil
function cekBentrokMobil(mobilId, tglMulai, tglSelesai, abaikanPemesananId = null) {
  let query = `
    SELECT id, kode_booking, tanggal_mulai, tanggal_selesai, status
    FROM pemesanan
    WHERE mobil_id = ?
      AND status IN ('menunggu_pemeriksaan', 'menunggu_persetujuan', 'terkonfirmasi', 'berjalan')
      AND date(tanggal_mulai) <= date(?)
      AND date(tanggal_selesai) >= date(?)
  `;
  const params = [mobilId, tglSelesai, tglMulai];
  if (abaikanPemesananId) {
    query += " AND id != ?";
    params.push(abaikanPemesananId);
  }
  return db.prepare(query).all(...params);
}

// Helper: Deteksi bentrok jadwal sopir
function cekBentrokSopir(sopirId, tglMulai, tglSelesai, abaikanPemesananId = null) {
  let query = `
    SELECT id, kode_booking, tanggal_mulai, tanggal_selesai
    FROM pemesanan
    WHERE sopir_id = ?
      AND status IN ('terkonfirmasi', 'berjalan')
      AND date(tanggal_mulai) <= date(?)
      AND date(tanggal_selesai) >= date(?)
  `;
  const params = [sopirId, tglSelesai, tglMulai];
  if (abaikanPemesananId) {
    query += " AND id != ?";
    params.push(abaikanPemesananId);
  }
  return db.prepare(query).all(...params);
}

// Helper: Otomatis kedaluwarsakan pemesanan yang lewat batas
function periksaBatasKedaluwarsa() {
  try {
    const expiredOrders = db.prepare(`
      SELECT id, kode_booking FROM pemesanan
      WHERE status = 'menunggu_pemeriksaan'
        AND batas_kedaluwarsa IS NOT NULL
        AND datetime(batas_kedaluwarsa) < datetime('now')
    `).all();

    for (const ord of expiredOrders) {
      db.prepare("UPDATE pemesanan SET status = 'kedaluwarsa', alasan_status = 'Melewati batas 24 jam tanpa konfirmasi' WHERE id = ?").run(ord.id);
      db.prepare(`
        INSERT INTO riwayat_status (pemesanan_id, status_lama, status_baru, diubah_oleh, catatan)
        VALUES (?, 'menunggu_pemeriksaan', 'kedaluwarsa', 'Sistem Otomatis', 'Auto-expire setelah lewat batas waktu')
      `).run(ord.id);
    }
  } catch (e) {
    console.error("Gagal auto-expire orders:", e);
  }
}
setInterval(periksaBatasKedaluwarsa, 60000); // Cek tiap 1 menit

// Sajikan berkas statis di folder public
app.use(express.static(path.join(__dirname, "public")));

// ====================================================================
// 4. API PUBLIK (KATALOG, ORDER, LACAK, KONFIRMASI SOPIR)
// ====================================================================

// Ambil kategori mobil
app.get("/api/public/categories", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM kategori_mobil ORDER BY id ASC").all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat kategori." });
  }
});

// Ambil daftar mobil & cek ketersediaan tanggal
app.get("/api/public/cars", (req, res) => {
  try {
    const { start, end, kategori_id } = req.query;
    let query = `
      SELECT m.*, k.nama_kategori 
      FROM mobil m
      LEFT JOIN kategori_mobil k ON m.kategori_id = k.id
      WHERE m.status != 'perawatan'
    `;
    const params = [];
    if (kategori_id) {
      query += " AND m.kategori_id = ?";
      params.push(kategori_id);
    }
    query += " ORDER BY m.tarif_per_hari ASC";
    const cars = db.prepare(query).all(...params);

    // Jika parameter tanggal diberikan, hitung ketersediaan aktual
    const hasil = cars.map(car => {
      let isAvailable = true;
      let conflictNote = "";
      if (start && end) {
        const bentrok = cekBentrokMobil(car.id, start, end);
        if (bentrok.length > 0) {
          isAvailable = false;
          conflictNote = "Sudah dipesan pada rentang tanggal tersebut.";
        }
      }
      return {
        ...car,
        tersedia: isAvailable,
        catatan_bentrok: conflictNote
      };
    });

    res.json(hasil);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat data mobil." });
  }
});

// Submit Order Pemesanan dari Website Publik
app.post("/api/public/orders", (req, res) => {
  const {
    mobil_id, tanggal_mulai, tanggal_selesai, durasi_hari,
    opsi_sopir, nama, nomor_wa, email, alamat, tujuan, lokasi_jemput,
    catatan, nomor_identitas, jenis_dokumen
  } = req.body;

  if (!mobil_id || !tanggal_mulai || !tanggal_selesai || !nama || !nomor_wa) {
    return res.status(400).json({ pesan: "Mohon lengkapi data wajib pemesanan." });
  }

  try {
    // 1. Cek apakah mobil sedang tersedia
    const mobil = db.prepare("SELECT * FROM mobil WHERE id = ?").get(mobil_id);
    if (!mobil) return res.status(404).json({ pesan: "Mobil tidak ditemukan." });

    const bentrok = cekBentrokMobil(mobil_id, tanggal_mulai, tanggal_selesai);
    if (bentrok.length > 0) {
      return res.status(409).json({
        pesan: "Mobil ini sudah terbooking di tanggal yang dipilih. Silakan pilih mobil atau tanggal lain."
      });
    }

    // 2. Cek customer atau buat customer baru
    let cust = db.prepare("SELECT * FROM customer WHERE nomor_wa = ?").get(nomor_wa.trim());
    if (cust && cust.status_blacklist === 1) {
      return res.status(403).json({
        pesan: "Mohon maaf, nomor kontak Anda belum dapat melakukan pemesanan saat ini. Hubungi admin rental untuk bantuan."
      });
    }

    let customerId;
    if (!cust) {
      const insCust = db.prepare(`
        INSERT INTO customer (nama, nomor_wa, email, alamat, total_sewa)
        VALUES (?, ?, ?, ?, 1)
      `).run(nama.trim(), nomor_wa.trim(), email || null, alamat || null);
      customerId = insCust.lastInsertRowid;
    } else {
      customerId = cust.id;
      db.prepare("UPDATE customer SET total_sewa = total_sewa + 1, alamat = COALESCE(?, alamat) WHERE id = ?").run(alamat || null, cust.id);
    }

    // 3. Perhitungan Total Harga sesuai Rumus Bab III:
    // Total = (Tarif * Hari) + (Sopir * Hari) + BiayaTambahan - Diskon
    const durasi = Math.max(1, parseInt(durasi_hari) || 1);
    const tarifMobil = mobil.tarif_per_hari;
    const biayaSopirPerHari = opsi_sopir == 1 ? 150000 : 0;
    const totalMobil = tarifMobil * durasi;
    const totalSopir = biayaSopirPerHari * durasi;
    const biayaTambahan = 0;
    const diskon = 0;
    const grandTotal = totalMobil + totalSopir + biayaTambahan - diskon;

    // 4. Generate Kode Booking Unik (contoh: BK-2610-104)
    const countToday = db.prepare("SELECT COUNT(*) AS c FROM pemesanan").get().c;
    const datePrefix = new Date().toISOString().slice(2, 7).replace("-", "");
    const kodeBooking = `BK-${datePrefix}-${String(countToday + 101).padStart(3, "0")}`;

    // Batas kedaluwarsa 24 jam dari sekarang
    const batasExp = new Date(Date.now() + 24 * 3600000).toISOString();

    const insertOrder = db.prepare(`
      INSERT INTO pemesanan (
        kode_booking, customer_id, mobil_id, tanggal_mulai, tanggal_selesai, durasi_hari,
        opsi_sopir, tujuan, lokasi_jemput, biaya_mobil, biaya_sopir, biaya_tambahan, diskon, total_harga,
        status, catatan, batas_kedaluwarsa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'menunggu_pemeriksaan', ?, ?)
    `);

    const result = insertOrder.run(
      kodeBooking, customerId, mobil.id, tanggal_mulai, tanggal_selesai, durasi,
      opsi_sopir ? 1 : 0, tujuan || "-", lokasi_jemput || "Ambil di Kantor",
      totalMobil, totalSopir, biayaTambahan, diskon, grandTotal,
      catatan || "", batasExp
    );
    const orderId = result.lastInsertRowid;

    // 5. Catat riwayat status awal
    db.prepare(`
      INSERT INTO riwayat_status (pemesanan_id, status_lama, status_baru, diubah_oleh, catatan)
      VALUES (?, NULL, 'menunggu_pemeriksaan', 'Customer (Web Publik)', 'Pemesanan baru dikirimkan')
    `).run(orderId);

    // 6. Catat data identitas KTP/SIM jika disertakan
    if (nomor_identitas) {
      db.prepare(`
        INSERT INTO verifikasi_identitas (pemesanan_id, jenis_dokumen, nomor_dokumen, status_verifikasi)
        VALUES (?, ?, ?, 'belum_diperiksa')
      `).run(orderId, jenis_dokumen || "KTP", nomor_identitas);
    }

    logAudit(req, "CREATE_ORDER", "pemesanan", orderId, null, { kodeBooking, grandTotal });

    res.status(201).json({
      pesan: "Pemesanan berhasil dibuat! Tim kami akan segera memeriksa ketersediaan.",
      kode_booking: kodeBooking,
      total_harga: grandTotal,
      dp_minimal: Math.round(grandTotal * 0.5),
      batas_kedaluwarsa: batasExp
    });
  } catch (err) {
    console.error("Error order publik:", err);
    res.status(500).json({ pesan: "Gagal memproses pemesanan: " + err.message });
  }
});

// Lacak status booking oleh customer
app.get("/api/public/track", (req, res) => {
  const { kode, wa } = req.query;
  if (!kode || !wa) {
    return res.status(400).json({ pesan: "Harap masukkan kode booking dan nomor WhatsApp." });
  }

  try {
    const cleanWa = wa.trim().replace(/\D/g, "");
    const row = db.prepare(`
      SELECT p.*, c.nama AS nama_customer, c.nomor_wa, m.nama AS nama_mobil, m.nomor_polisi,
             COALESCE(s.nama, '-') AS nama_sopir,
             (SELECT SUM(nominal) FROM pembayaran WHERE pemesanan_id = p.id AND status = 'terverifikasi') AS total_terbayar,
             (SELECT SUM(nominal) FROM pembayaran WHERE pemesanan_id = p.id AND status = 'diterima') AS bayar_menunggu_verifikasi
      FROM pemesanan p
      JOIN customer c ON p.customer_id = c.id
      JOIN mobil m ON p.mobil_id = m.id
      LEFT JOIN sopir s ON p.sopir_id = s.id
      WHERE UPPER(p.kode_booking) = UPPER(?) AND c.nomor_wa LIKE ?
    `).get(kode.trim(), `%${cleanWa}%`);

    if (!row) {
      return res.status(404).json({ pesan: "Pemesanan dengan data tersebut tidak ditemukan." });
    }

    const riwayat = db.prepare(`
      SELECT * FROM riwayat_status WHERE pemesanan_id = ? ORDER BY created_at ASC
    `).all(row.id);

    const pembayaran = db.prepare(`
      SELECT * FROM pembayaran WHERE pemesanan_id = ? ORDER BY id ASC
    `).all(row.id);

    res.json({
      order: row,
      riwayat,
      pembayaran
    });
  } catch (err) {
    console.error("Gagal melacak pemesanan:", err);
    res.status(500).json({ pesan: "Gagal melacak pemesanan: " + err.message });
  }
});

// Customer meminta pembatalan sewa
app.post("/api/public/orders/cancel", (req, res) => {
  const { kode_booking, nomor_wa, alasan } = req.body;
  if (!kode_booking || !nomor_wa) {
    return res.status(400).json({ pesan: "Kode booking dan nomor WhatsApp wajib diisi." });
  }

  try {
    const cleanWa = nomor_wa.trim().replace(/\D/g, "");
    const order = db.prepare(`
      SELECT p.* FROM pemesanan p
      JOIN customer c ON p.customer_id = c.id
      WHERE UPPER(p.kode_booking) = UPPER(?) AND c.nomor_wa LIKE ?
    `).get(kode_booking.trim(), `%${cleanWa}%`);

    if (!order) {
      return res.status(404).json({ pesan: "Pemesanan tidak ditemukan." });
    }

    if (["selesai", "dibatalkan", "ditolak"].includes(order.status)) {
      return res.status(400).json({ pesan: `Pemesanan tidak bisa dibatalkan karena sudah berstatus '${order.status}'.` });
    }

    const statusLama = order.status;
    db.prepare(`
      UPDATE pemesanan 
      SET status = 'dibatalkan', alasan_status = ?
      WHERE id = ?
    `).run(alasan || "Permintaan pembatalan dari customer", order.id);

    db.prepare(`
      INSERT INTO riwayat_status (pemesanan_id, status_lama, status_baru, diubah_oleh, catatan)
      VALUES (?, ?, 'dibatalkan', 'Customer (Self-service)', ?)
    `).run(order.id, statusLama, alasan || "Customer membatalkan via website");

    logAudit(req, "CANCEL_ORDER_BY_CUSTOMER", "pemesanan", order.id, { status: statusLama }, { status: "dibatalkan", alasan });

    res.json({ pesan: "Pemesanan Anda berhasil dibatalkan." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal membatalkan pemesanan: " + err.message });
  }
});

// Sopir: Konfirmasi Penugasan via Tautan Bertoken (Bab IV & V)
app.get("/api/public/driver-confirm/:token", (req, res) => {
  const { token } = req.params;
  try {
    const row = db.prepare(`
      SELECT js.*, s.nama AS nama_sopir, p.kode_booking, p.tanggal_mulai, p.tanggal_selesai,
             p.tujuan, p.lokasi_jemput, m.nama AS nama_mobil, m.nomor_polisi, c.nama AS nama_customer
      FROM jadwal_sopir js
      JOIN sopir s ON js.sopir_id = s.id
      JOIN pemesanan p ON js.pemesanan_id = p.id
      JOIN mobil m ON p.mobil_id = m.id
      JOIN customer c ON p.customer_id = c.id
      WHERE js.token_konfirmasi = ?
    `).get(token);

    if (!row) {
      return res.status(404).json({ pesan: "Tautan konfirmasi sopir tidak valid atau sudah tidak berlaku." });
    }

    const expired = new Date(row.masa_berlaku) < new Date();
    res.json({ ...row, is_expired: expired });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memvalidasi token." });
  }
});

// Sopir kirim jawaban Terima/Tolak (Sekali pakai)
app.post("/api/public/driver-confirm/:token", (req, res) => {
  const { token } = req.params;
  const { jawaban } = req.body; // 'diterima' atau 'ditolak'

  if (!["diterima", "ditolak"].includes(jawaban)) {
    return res.status(400).json({ pesan: "Jawaban harus 'diterima' atau 'ditolak'." });
  }

  try {
    const row = db.prepare("SELECT * FROM jadwal_sopir WHERE token_konfirmasi = ?").get(token);
    if (!row) {
      return res.status(404).json({ pesan: "Tautan tidak ditemukan." });
    }
    if (row.status_konfirmasi !== "menunggu") {
      return res.status(400).json({
        pesan: `Token ini sudah pernah digunakan sebelumnya (Status: ${row.status_konfirmasi}).`
      });
    }
    if (new Date(row.masa_berlaku) < new Date()) {
      return res.status(400).json({ pesan: "Tautan konfirmasi sudah kedaluwarsa." });
    }

    db.prepare(`
      UPDATE jadwal_sopir 
      SET status_konfirmasi = ?, catatan = ?
      WHERE id = ?
    `).run(jawaban, `Sopir memilih '${jawaban}' via tautan pada ${new Date().toLocaleString("id-ID")}`, row.id);

    // Update status sopir jika diterima
    if (jawaban === "diterima") {
      db.prepare("UPDATE sopir SET status = 'bertugas' WHERE id = ?").run(row.sopir_id);
    }

    logAudit(req, "DRIVER_CONFIRMATION", "jadwal_sopir", row.id, { status: "menunggu" }, { status: jawaban });

    res.json({ pesan: `Terima kasih! Tugas berhasil Anda ${jawaban}.` });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal menyimpan konfirmasi: " + err.message });
  }
});

// ====================================================================
// 5. API AUTENTIKASI INTERNAL (LOGIN, ME, LOGOUT)
// ====================================================================

app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ pesan: "Username dan password wajib diisi." });
  }

  try {
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim());
    if (!user) {
      return res.status(401).json({ pesan: "Username atau password salah." });
    }

    // Cek status akun terkunci (Bab II: Kunci 15 menit jika 5x gagal)
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const sisaMenit = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(403).json({
        pesan: `Akun terkunci karena 5 kali salah password. Silakan coba lagi ${sisaMenit} menit kemudian.`
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      const failed = (user.failed_attempts || 0) + 1;
      let lockSql = "UPDATE users SET failed_attempts = ? WHERE id = ?";
      let lockParams = [failed, user.id];

      if (failed >= 5) {
        const lockTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        lockSql = "UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?";
        lockParams = [lockTime, user.id];
      }
      db.prepare(lockSql).run(...lockParams);

      return res.status(401).json({
        pesan: failed >= 5
          ? "Akun Anda terkunci selama 15 menit karena 5 kali salah password berturut-turut."
          : `Password salah. Kesempatan tersisa: ${5 - failed} kali.`
      });
    }

    // Login Berhasil: Reset failed attempts & locked_until
    db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(user.id);

    req.session.user = {
      id: user.id,
      username: user.username,
      nama: user.nama,
      role: user.role
    };

    logAudit(req, "LOGIN", "users", user.id, null, { username: user.username, role: user.role });

    res.json({
      pesan: "Login berhasil.",
      user: req.session.user
    });
  } catch (err) {
    res.status(500).json({ pesan: "Terjadi kesalahan server saat login." });
  }
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ user: null });
  }
  res.json({ user: req.session.user });
});

app.post("/api/auth/logout", (req, res) => {
  if (req.session && req.session.user) {
    logAudit(req, "LOGOUT", "users", req.session.user.id, null, null);
  }
  req.session.destroy(err => {
    if (err) return res.status(500).json({ pesan: "Gagal logout." });
    res.clearCookie("connect.sid");
    res.json({ pesan: "Logout berhasil." });
  });
});

// ====================================================================
// 6. API DASHBOARD INTERNAL & STATISTIK (OWNER, ADMIN, STAFF, AKUNTANSI)
// ====================================================================

app.get("/api/dashboard/stats", requireAuth(["admin", "owner", "akuntansi", "staff"]), (req, res) => {
  try {
    // 6 Ukuran Laporan Bab VI
    // 1. Total Pendapatan Terverifikasi
    const revRow = db.prepare(`
      SELECT COALESCE(SUM(nominal), 0) AS total_revenue 
      FROM pembayaran 
      WHERE status = 'terverifikasi'
    `).get();

    // 2. Margin (Pemasukan - Pengeluaran) / Pemasukan * 100%
    const totalMasuk = db.prepare("SELECT COALESCE(SUM(nominal), 0) AS total FROM transaksi_keuangan WHERE jenis = 'pemasukan'").get().total;
    const totalKeluar = db.prepare("SELECT COALESCE(SUM(nominal), 0) AS total FROM transaksi_keuangan WHERE jenis = 'pengeluaran'").get().total;
    const margin = totalMasuk > 0 ? (((totalMasuk - totalKeluar) / totalMasuk) * 100).toFixed(1) : 0;

    // 3. Konversi Order (Terkonfirmasi / Total Masuk * 100%)
    const totalOrder = db.prepare("SELECT COUNT(*) AS total FROM pemesanan").get().total;
    const confirmedOrder = db.prepare("SELECT COUNT(*) AS total FROM pemesanan WHERE status IN ('terkonfirmasi', 'berjalan', 'selesai')").get().total;
    const conversionRate = totalOrder > 0 ? ((confirmedOrder / totalOrder) * 100).toFixed(1) : 0;

    // 4. Utilisasi Armada
    const totalArmada = db.prepare("SELECT COUNT(*) AS total FROM mobil").get().total;
    const armadaDisewa = db.prepare("SELECT COUNT(*) AS total FROM mobil WHERE status = 'disewa'").get().total;
    const utilitas = totalArmada > 0 ? ((armadaDisewa / totalArmada) * 100).toFixed(1) : 0;

    // 5. Keterlambatan Pengembalian
    const lateRow = db.prepare(`
      SELECT COUNT(*) AS insiden_terlambat, COALESCE(AVG(jam_terlambat), 0) AS rata_jam 
      FROM pengembalian 
      WHERE jam_terlambat > 0
    `).get();

    // 6. Ringkasan Status Pemesanan
    const statusCounts = db.prepare(`
      SELECT status, COUNT(*) AS jumlah 
      FROM pemesanan 
      GROUP BY status
    `).all();

    // 7. Pengingat Dokumen Armada yang Mendekati Jatuh Tempo (< 30 hari)
    const dokMendekati = db.prepare(`
      SELECT dk.*, m.nama AS nama_mobil, m.nomor_polisi,
             CAST((julianday(dk.tanggal_berlaku) - julianday('now')) AS INTEGER) AS sisa_hari
      FROM dokumen_kendaraan dk
      JOIN mobil m ON dk.mobil_id = m.id
      WHERE date(dk.tanggal_berlaku) <= date('now', '+30 days')
      ORDER BY dk.tanggal_berlaku ASC
    `).all();

    // 8. Pendapatan per mobil
    const revenuePerMobil = db.prepare(`
      SELECT m.id, m.nama, m.nomor_polisi,
             COALESCE(SUM(pb.nominal), 0) AS pendapatan
      FROM mobil m
      LEFT JOIN pemesanan p ON m.id = p.mobil_id
      LEFT JOIN pembayaran pb ON p.id = pb.pemesanan_id AND pb.status = 'terverifikasi'
      GROUP BY m.id
      ORDER BY pendapatan DESC
    `).all();

    res.json({
      total_revenue: revRow.total_revenue,
      total_pemasukan: totalMasuk,
      total_pengeluaran: totalKeluar,
      laba_bersih: totalMasuk - totalKeluar,
      margin_persen: margin,
      total_order: totalOrder,
      confirmed_order: confirmedOrder,
      conversion_rate: conversionRate,
      total_armada: totalArmada,
      armada_disewa: armadaDisewa,
      utilitas_persen: utilitas,
      insiden_terlambat: lateRow.insiden_terlambat,
      rata_jam_terlambat: Math.round(lateRow.rata_jam),
      status_counts: statusCounts,
      dokumen_warning: dokMendekati,
      revenue_per_mobil: revenuePerMobil
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ pesan: "Gagal memuat statistik dashboard." });
  }
});

// ====================================================================
// 7. API OPERASIONAL PEMESANAN & JADWAL (ADMIN & STAFF)
// ====================================================================

// List semua pemesanan dengan filter status
app.get("/api/orders", requireAuth(["admin", "staff", "akuntansi", "owner"]), (req, res) => {
  const { status, search } = req.query;
  try {
    let query = `
      SELECT p.*, c.nama AS nama_customer, c.nomor_wa, c.status_blacklist,
             m.nama AS nama_mobil, m.nomor_polisi,
             s.nama AS nama_sopir,
             (SELECT COUNT(*) FROM pembayaran WHERE pemesanan_id = p.id AND status = 'terverifikasi') AS dp_verified,
             (SELECT SUM(nominal) FROM pembayaran WHERE pemesanan_id = p.id AND status = 'terverifikasi') AS total_bayar_verified
      FROM pemesanan p
      JOIN customer c ON p.customer_id = c.id
      JOIN mobil m ON p.mobil_id = m.id
      LEFT JOIN sopir s ON p.sopir_id = s.id
      WHERE 1=1
    `;
    const params = [];
    if (status && status !== "semua") {
      query += " AND p.status = ?";
      params.push(status);
    }
    if (search) {
      query += " AND (p.kode_booking LIKE ? OR c.nama LIKE ? OR m.nama LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    query += " ORDER BY p.id DESC";

    const orders = db.prepare(query).all(...params);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat data order: " + err.message });
  }
});

// Detail satu pemesanan lengkap
app.get("/api/orders/:id", requireAuth(["admin", "staff", "akuntansi", "owner"]), (req, res) => {
  try {
    const order = db.prepare(`
      SELECT p.*, c.nama AS nama_customer, c.nomor_wa, c.email AS email_customer, c.alamat AS alamat_customer, c.status_blacklist,
             m.nama AS nama_mobil, m.nomor_polisi, m.tarif_per_hari,
             s.nama AS nama_sopir, s.nomor_wa AS wa_sopir
      FROM pemesanan p
      JOIN customer c ON p.customer_id = c.id
      JOIN mobil m ON p.mobil_id = m.id
      LEFT JOIN sopir s ON p.sopir_id = s.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!order) return res.status(404).json({ pesan: "Order tidak ditemukan." });

    const riwayat = db.prepare("SELECT * FROM riwayat_status WHERE pemesanan_id = ? ORDER BY created_at ASC").all(order.id);
    const pembayaran = db.prepare("SELECT * FROM pembayaran WHERE pemesanan_id = ? ORDER BY id ASC").all(order.id);
    const identitas = db.prepare("SELECT * FROM verifikasi_identitas WHERE pemesanan_id = ?").all(order.id);
    const pengembalian = db.prepare("SELECT * FROM pengembalian WHERE pemesanan_id = ?").get(order.id);
    const jadwalSopir = db.prepare("SELECT * FROM jadwal_sopir WHERE pemesanan_id = ?").all(order.id);

    res.json({
      order,
      riwayat,
      pembayaran,
      identitas,
      pengembalian,
      jadwalSopir
    });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat detail order." });
  }
});

// Perbarui Status Pemesanan (Hanya Admin & Staff, sesuai Bab II)
app.put("/api/orders/:id/status", requireAuth(["admin", "staff"]), (req, res) => {
  const { status, alasan } = req.body;
  const orderId = req.params.id;

  const validStatuses = [
    "menunggu_pemeriksaan", "menunggu_persetujuan", "terkonfirmasi",
    "berjalan", "selesai", "ditolak", "kedaluwarsa", "dibatalkan"
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ pesan: "Status baru tidak valid." });
  }

  try {
    const order = db.prepare("SELECT * FROM pemesanan WHERE id = ?").get(orderId);
    if (!order) return res.status(404).json({ pesan: "Order tidak ditemukan." });

    // Jika ingin mengubah status ke 'terkonfirmasi' atau 'berjalan', pastikan tidak bentrok!
    if (["terkonfirmasi", "berjalan"].includes(status)) {
      const bentrokMobil = cekBentrokMobil(order.mobil_id, order.tanggal_mulai, order.tanggal_selesai, order.id);
      if (bentrokMobil.length > 0) {
        return res.status(409).json({
          pesan: `Peringatan Bentrok: Mobil sudah terbooking di pemesanan lain (${bentrokMobil[0].kode_booking}).`
        });
      }
      if (order.sopir_id) {
        const bentrokSopir = cekBentrokSopir(order.sopir_id, order.tanggal_mulai, order.tanggal_selesai, order.id);
        if (bentrokSopir.length > 0) {
          return res.status(409).json({
            pesan: `Peringatan Bentrok: Sopir sudah terjadwal di pemesanan lain (${bentrokSopir[0].kode_booking}).`
          });
        }
      }
    }

    const statusLama = order.status;
    db.prepare("UPDATE pemesanan SET status = ?, alasan_status = ? WHERE id = ?").run(status, alasan || null, orderId);

    // Update status fisik mobil jika berjalan atau selesai
    if (status === "berjalan") {
      db.prepare("UPDATE mobil SET status = 'disewa' WHERE id = ?").run(order.mobil_id);
    } else if (["selesai", "dibatalkan", "ditolak"].includes(status)) {
      db.prepare("UPDATE mobil SET status = 'tersedia' WHERE id = ?").run(order.mobil_id);
      if (order.sopir_id) {
        db.prepare("UPDATE sopir SET status = 'tersedia' WHERE id = ?").run(order.sopir_id);
      }
    }

    // Catat ke riwayat_status
    db.prepare(`
      INSERT INTO riwayat_status (pemesanan_id, status_lama, status_baru, diubah_oleh, catatan)
      VALUES (?, ?, ?, ?, ?)
    `).run(orderId, statusLama, status, `${req.session.user.nama} (${req.session.user.role})`, alasan || `Status diubah menjadi ${status}`);

    logAudit(req, "UPDATE_ORDER_STATUS", "pemesanan", orderId, { status: statusLama }, { status, alasan });

    res.json({ pesan: `Status pemesanan berhasil diperbarui menjadi '${status}'.` });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal mengubah status: " + err.message });
  }
});

// Tetapkan Sopir & Buat Token Konfirmasi WhatsApp (Admin & Staff)
app.post("/api/orders/:id/assign-driver", requireAuth(["admin", "staff"]), (req, res) => {
  const { sopir_id } = req.body;
  const orderId = req.params.id;

  try {
    const order = db.prepare("SELECT * FROM pemesanan WHERE id = ?").get(orderId);
    if (!order) return res.status(404).json({ pesan: "Order tidak ditemukan." });

    const sopir = db.prepare("SELECT * FROM sopir WHERE id = ?").get(sopir_id);
    if (!sopir) return res.status(404).json({ pesan: "Sopir tidak ditemukan." });

    // Cek bentrok sopir
    const bentrok = cekBentrokSopir(sopir_id, order.tanggal_mulai, order.tanggal_selesai, order.id);
    if (bentrok.length > 0) {
      return res.status(409).json({
        pesan: `Sopir ${sopir.nama} sudah terjadwal di pemesanan ${bentrok[0].kode_booking}.`
      });
    }

    // Buat token konfirmasi unik
    const token = `drv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const masaBerlaku = new Date(Date.now() + 48 * 3600000).toISOString();

    db.prepare("UPDATE pemesanan SET sopir_id = ? WHERE id = ?").run(sopir_id, orderId);

    db.prepare(`
      INSERT INTO jadwal_sopir (pemesanan_id, sopir_id, token_konfirmasi, status_konfirmasi, masa_berlaku, catatan)
      VALUES (?, ?, ?, 'menunggu', ?, ?)
    `).run(orderId, sopir_id, token, masaBerlaku, "Penugasan baru oleh staff");

    logAudit(req, "ASSIGN_DRIVER", "pemesanan", orderId, { sopir_id: order.sopir_id }, { sopir_id, token });

    res.json({
      pesan: `Sopir ${sopir.nama} berhasil ditugaskan. Tautan konfirmasi telah dibuat.`,
      token,
      url_konfirmasi: `/konfirmasi-sopir.html?token=${token}`
    });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal menugaskan sopir: " + err.message });
  }
});

// Verifikasi Dokumen KTP / SIM (Admin & Staff)
app.post("/api/orders/:id/verify-identity", requireAuth(["admin", "staff"]), (req, res) => {
  const { jenis_dokumen, nomor_dokumen, status_verifikasi, catatan } = req.body;
  const orderId = req.params.id;

  try {
    const existing = db.prepare("SELECT id FROM verifikasi_identitas WHERE pemesanan_id = ? AND jenis_dokumen = ?").get(orderId, jenis_dokumen);

    if (existing) {
      db.prepare(`
        UPDATE verifikasi_identitas 
        SET nomor_dokumen = ?, status_verifikasi = ?, diverifikasi_oleh = ?, catatan = ?
        WHERE id = ?
      `).run(nomor_dokumen, status_verifikasi, req.session.user.nama, catatan, existing.id);
    } else {
      db.prepare(`
        INSERT INTO verifikasi_identitas (pemesanan_id, jenis_dokumen, nomor_dokumen, status_verifikasi, diverifikasi_oleh, catatan)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(orderId, jenis_dokumen, nomor_dokumen, status_verifikasi, req.session.user.nama, catatan);
    }

    logAudit(req, "VERIFY_IDENTITY", "verifikasi_identitas", orderId, null, { jenis_dokumen, status_verifikasi });

    res.json({ pesan: "Verifikasi dokumen identitas berhasil diperbarui." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memverifikasi identitas: " + err.message });
  }
});

// ====================================================================
// 8. API KEUANGAN & PEMBAYARAN (PEMISAHAN STAFF VS AKUNTANSI)
// ====================================================================

// 1. Staff menandai pembayaran diterima (belum diverifikasi) - Sesuai Bab II & IV
app.post("/api/payments/mark-received", requireAuth(["admin", "staff", "akuntansi"]), (req, res) => {
  const { pemesanan_id, jenis_pembayaran, nominal, metode, catatan } = req.body;
  if (!pemesanan_id || !nominal || !jenis_pembayaran) {
    return res.status(400).json({ pesan: "Data pembayaran tidak lengkap." });
  }

  try {
    const ins = db.prepare(`
      INSERT INTO pembayaran (pemesanan_id, jenis_pembayaran, nominal, metode, status, ditandai_oleh, catatan)
      VALUES (?, ?, ?, ?, 'diterima', ?, ?)
    `).run(pemesanan_id, jenis_pembayaran, parseFloat(nominal), metode || "Transfer Bank", req.session.user.nama, catatan || "");

    logAudit(req, "MARK_PAYMENT_RECEIVED", "pembayaran", ins.lastInsertRowid, null, { pemesanan_id, nominal });

    res.json({ pesan: "Pembayaran berhasil ditandai diterima. Menunggu verifikasi Akuntansi." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal menandai pembayaran: " + err.message });
  }
});

// 2. Akuntansi memverifikasi pembayaran menjadi sah (Hanya Akuntansi & Admin!)
app.post("/api/payments/:id/verify", requireAuth(["admin", "akuntansi"]), (req, res) => {
  const paymentId = req.params.id;
  const { status, catatan } = req.body; // 'terverifikasi' atau 'ditolak'

  if (!["terverifikasi", "ditolak"].includes(status)) {
    return res.status(400).json({ pesan: "Status verifikasi harus 'terverifikasi' atau 'ditolak'." });
  }

  try {
    const pay = db.prepare("SELECT * FROM pembayaran WHERE id = ?").get(paymentId);
    if (!pay) return res.status(404).json({ pesan: "Data pembayaran tidak ditemukan." });

    db.prepare(`
      UPDATE pembayaran 
      SET status = ?, diverifikasi_oleh = ?, tanggal_verifikasi = ?, catatan = COALESCE(?, catatan)
      WHERE id = ?
    `).run(status, req.session.user.nama, new Date().toISOString(), catatan || null, paymentId);

    // Jika pembayaran terverifikasi, catat otomatis ke arus kas (transaksi_keuangan)
    if (status === "terverifikasi") {
      const ord = db.prepare("SELECT kode_booking FROM pemesanan WHERE id = ?").get(pay.pemesanan_id);
      db.prepare(`
        INSERT INTO transaksi_keuangan (jenis, kategori, nominal, tanggal, keterangan, dicatat_oleh)
        VALUES ('pemasukan', 'Sewa Mobil', ?, date('now'), ?, ?)
      `).run(pay.nominal, `Pembayaran ${pay.jenis_pembayaran} ${ord ? ord.kode_booking : ""}`, req.session.user.nama);

      // Jika jenis adalah DP dan order masih menunggu persetujuan/pemeriksaan, konfirmasi otomatis!
      const currOrder = db.prepare("SELECT status FROM pemesanan WHERE id = ?").get(pay.pemesanan_id);
      if (currOrder && ["menunggu_pemeriksaan", "menunggu_persetujuan"].includes(currOrder.status)) {
        db.prepare("UPDATE pemesanan SET status = 'terkonfirmasi' WHERE id = ?").run(pay.pemesanan_id);
        db.prepare(`
          INSERT INTO riwayat_status (pemesanan_id, status_lama, status_baru, diubah_oleh, catatan)
          VALUES (?, ?, 'terkonfirmasi', 'Sistem Otomatis', 'DP diverifikasi oleh Akuntansi, order terkonfirmasi')
        `).run(pay.pemesanan_id, currOrder.status);
      }
    }

    logAudit(req, "VERIFY_PAYMENT", "pembayaran", paymentId, { status: pay.status }, { status });

    res.json({ pesan: `Pembayaran berhasil diubah menjadi '${status}'.` });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memverifikasi pembayaran: " + err.message });
  }
});

// 3. Transaksi Arus Kas Pemasukan & Pengeluaran (Akuntansi & Admin)
app.get("/api/finances", requireAuth(["admin", "akuntansi", "owner"]), (req, res) => {
  try {
    const list = db.prepare("SELECT * FROM transaksi_keuangan ORDER BY tanggal DESC, id DESC").all();
    res.json(list);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat transaksi keuangan." });
  }
});

// Staff memanggil alamat API keuangan langsung akan DITOLAK (Skenario Uji Bab VII)
app.post("/api/finances", requireAuth(["admin", "akuntansi"]), (req, res) => {
  const { jenis, kategori, nominal, tanggal, keterangan } = req.body;
  if (!jenis || !kategori || !nominal) {
    return res.status(400).json({ pesan: "Data transaksi tidak lengkap." });
  }

  try {
    const ins = db.prepare(`
      INSERT INTO transaksi_keuangan (jenis, kategori, nominal, tanggal, keterangan, dicatat_oleh)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jenis, kategori, parseFloat(nominal), tanggal || new Date().toISOString().slice(0, 10), keterangan || "-", req.session.user.nama);

    logAudit(req, "CREATE_FINANCE_TRANSACTION", "transaksi_keuangan", ins.lastInsertRowid, null, { jenis, kategori, nominal });

    res.status(201).json({ pesan: "Transaksi kas berhasil dicatat." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal mencatat transaksi: " + err.message });
  }
});

// ====================================================================
// 9. API PENGEMBALIAN & DENDA (CHECK-IN MOBIL)
// ====================================================================

app.post("/api/returns", requireAuth(["admin", "staff"]), (req, res) => {
  const {
    pemesanan_id, tanggal_kembali, kondisi_bbm, odometer_akhir,
    catatan_kondisi, jam_terlambat, denda_keterlambatan, denda_kerusakan, biaya_tambahan_lain
  } = req.body;

  if (!pemesanan_id) return res.status(400).json({ pesan: "ID Pemesanan wajib diisi." });

  try {
    const order = db.prepare("SELECT * FROM pemesanan WHERE id = ?").get(pemesanan_id);
    if (!order) return res.status(404).json({ pesan: "Pemesanan tidak ditemukan." });

    const totalDenda = (parseFloat(denda_keterlambatan) || 0) +
                       (parseFloat(denda_kerusakan) || 0) +
                       (parseFloat(biaya_tambahan_lain) || 0);

    const ins = db.prepare(`
      INSERT INTO pengembalian (
        pemesanan_id, tanggal_kembali, kondisi_bbm, odometer_akhir, catatan_kondisi,
        jam_terlambat, denda_keterlambatan, denda_kerusakan, biaya_tambahan_lain, total_denda, diproses_oleh
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pemesanan_id, tanggal_kembali || new Date().toISOString().slice(0, 10),
      kondisi_bbm || "Full", odometer_akhir || 0, catatan_kondisi || "Kondisi baik",
      jam_terlambat || 0, denda_keterlambatan || 0, denda_kerusakan || 0, biaya_tambahan_lain || 0,
      totalDenda, req.session.user.nama
    );

    // Ubah status order menjadi 'selesai' dan mobil kembali 'tersedia'
    db.prepare("UPDATE pemesanan SET status = 'selesai' WHERE id = ?").run(pemesanan_id);
    db.prepare("UPDATE mobil SET status = 'tersedia' WHERE id = ?").run(order.mobil_id);
    if (order.sopir_id) {
      db.prepare("UPDATE sopir SET status = 'tersedia' WHERE id = ?").run(order.sopir_id);
    }

    db.prepare(`
      INSERT INTO riwayat_status (pemesanan_id, status_lama, status_baru, diubah_oleh, catatan)
      VALUES (?, ?, 'selesai', ?, ?)
    `).run(pemesanan_id, order.status, req.session.user.nama, `Pengembalian mobil selesai. Denda: Rp ${totalDenda.toLocaleString("id-ID")}`);

    logAudit(req, "RETURN_CAR", "pengembalian", ins.lastInsertRowid, null, { pemesanan_id, totalDenda });

    res.status(201).json({ pesan: "Pengembalian armada berhasil dicatat dan status sewa dinyatakan selesai." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memproses pengembalian: " + err.message });
  }
});

// ====================================================================
// 10. API PENGGAJIAN / PAYROLL (Bab II: Staff hanya boleh slip sendiri)
// ====================================================================

app.get("/api/payroll", requireAuth(["admin", "akuntansi", "staff", "owner"]), (req, res) => {
  try {
    const user = req.session.user;
    let query = "SELECT * FROM penggajian";
    const params = [];

    // Proteksi Hak Akses (Skenario Uji Bab VII: Staff hanya dapat slip sendiri)
    if (user.role === "staff") {
      query += " WHERE user_id = ?";
      params.push(user.id);
    }
    query += " ORDER BY id DESC";

    const payrolls = db.prepare(query).all(...params);
    res.json(payrolls);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat data payroll." });
  }
});

// Buat slip gaji (Hanya Akuntansi & Admin)
app.post("/api/payroll", requireAuth(["admin", "akuntansi"]), (req, res) => {
  const { user_id, sopir_id, nama_penerima, role_penerima, periode, gaji_pokok, insentif, bonus_perjalanan, potongan } = req.body;

  try {
    const gPokok = parseFloat(gaji_pokok) || 0;
    const ins = parseFloat(insentif) || 0;
    const bPerjalanan = parseFloat(bonus_perjalanan) || 0;
    const pot = parseFloat(potongan) || 0;
    const totalDiterima = gPokok + ins + bPerjalanan - pot;

    const resGaji = db.prepare(`
      INSERT INTO penggajian (
        user_id, sopir_id, nama_penerima, role_penerima, periode,
        gaji_pokok, insentif, bonus_perjalanan, potongan, total_diterima, status_bayar, dicatat_oleh
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      user_id || null, sopir_id || null, nama_penerima, role_penerima, periode,
      gPokok, ins, bPerjalanan, pot, totalDiterima, req.session.user.nama
    );

    logAudit(req, "CREATE_PAYROLL", "penggajian", resGaji.lastInsertRowid, null, { nama_penerima, totalDiterima });

    res.status(201).json({ pesan: "Slip gaji berhasil dibuat." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal membuat slip gaji: " + err.message });
  }
});

// Tandai gaji dibayar (Akuntansi & Admin)
app.put("/api/payroll/:id/pay", requireAuth(["admin", "akuntansi"]), (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM penggajian WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ pesan: "Data gaji tidak ditemukan." });

    db.prepare("UPDATE penggajian SET status_bayar = 'dibayar', tanggal_bayar = ? WHERE id = ?")
      .run(new Date().toISOString().slice(0, 10), req.params.id);

    // Catat ke pengeluaran kas
    db.prepare(`
      INSERT INTO transaksi_keuangan (jenis, kategori, nominal, tanggal, keterangan, dicatat_oleh)
      VALUES ('pengeluaran', 'Gaji Staff', ?, date('now'), ?, ?)
    `).run(row.total_diterima, `Pembayaran Gaji ${row.nama_penerima} Periode ${row.periode}`, req.session.user.nama);

    logAudit(req, "PAY_PAYROLL", "penggajian", req.params.id, { status: row.status_bayar }, { status: "dibayar" });

    res.json({ pesan: "Gaji berhasil ditandai telah dibayar dan dicatat ke pengeluaran kas." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memperbarui status gaji." });
  }
});

// ====================================================================
// 11. API MASTER DATA (ARMADA, SOPIR, CUSTOMER, DOKUMEN)
// ====================================================================

// ARMADA (CRUD)
app.get("/api/cars", requireAuth(["admin", "staff", "akuntansi", "owner"]), (req, res) => {
  try {
    const cars = db.prepare(`
      SELECT m.*, k.nama_kategori 
      FROM mobil m
      LEFT JOIN kategori_mobil k ON m.kategori_id = k.id
      ORDER BY m.id DESC
    `).all();
    res.json(cars);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat mobil." });
  }
});

app.post("/api/cars", requireAuth(["admin", "staff"]), (req, res) => {
  const { kategori_id, nama, nomor_polisi, transmisi, kapasitas, tarif_per_hari, fasilitas } = req.body;
  try {
    const ins = db.prepare(`
      INSERT INTO mobil (kategori_id, nama, nomor_polisi, transmisi, kapasitas, tarif_per_hari, fasilitas, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'tersedia')
    `).run(kategori_id, nama, nomor_polisi, transmisi || "Manual", kapasitas || 7, parseFloat(tarif_per_hari), fasilitas || "");

    logAudit(req, "CREATE_CAR", "mobil", ins.lastInsertRowid, null, { nama, nomor_polisi });
    res.status(201).json({ pesan: "Armada mobil baru berhasil ditambahkan." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal menambah mobil: " + err.message });
  }
});

app.put("/api/cars/:id", requireAuth(["admin", "staff"]), (req, res) => {
  const { kategori_id, nama, nomor_polisi, transmisi, kapasitas, tarif_per_hari, fasilitas, status } = req.body;
  try {
    const carId = req.params.id;
    const old = db.prepare("SELECT * FROM mobil WHERE id = ?").get(carId);

    db.prepare(`
      UPDATE mobil 
      SET kategori_id = ?, nama = ?, nomor_polisi = ?, transmisi = ?, kapasitas = ?,
          tarif_per_hari = ?, fasilitas = ?, status = ?
      WHERE id = ?
    `).run(kategori_id, nama, nomor_polisi, transmisi, kapasitas, parseFloat(tarif_per_hari), fasilitas, status, carId);

    logAudit(req, "UPDATE_CAR", "mobil", carId, old, req.body);
    res.json({ pesan: "Data mobil berhasil diperbarui." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memperbarui mobil." });
  }
});

// DOKUMEN KENDARAAN (Pajak, KIR, Asuransi, Servis)
app.get("/api/documents", requireAuth(["admin", "staff", "akuntansi", "owner"]), (req, res) => {
  try {
    const docs = db.prepare(`
      SELECT dk.*, m.nama AS nama_mobil, m.nomor_polisi,
             CAST((julianday(dk.tanggal_berlaku) - julianday('now')) AS INTEGER) AS sisa_hari
      FROM dokumen_kendaraan dk
      JOIN mobil m ON dk.mobil_id = m.id
      ORDER BY dk.tanggal_berlaku ASC
    `).all();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat dokumen kendaraan." });
  }
});

app.post("/api/documents", requireAuth(["admin", "staff"]), (req, res) => {
  const { mobil_id, jenis_dokumen, nomor_dokumen, tanggal_berlaku, catatan } = req.body;
  try {
    const ins = db.prepare(`
      INSERT INTO dokumen_kendaraan (mobil_id, jenis_dokumen, nomor_dokumen, tanggal_berlaku, catatan)
      VALUES (?, ?, ?, ?, ?)
    `).run(mobil_id, jenis_dokumen, nomor_dokumen, tanggal_berlaku, catatan);

    logAudit(req, "CREATE_CAR_DOCUMENT", "dokumen_kendaraan", ins.lastInsertRowid, null, { mobil_id, jenis_dokumen });
    res.status(201).json({ pesan: "Dokumen kendaraan berhasil disimpan." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal menyimpan dokumen." });
  }
});

// SOPIR (CRUD)
app.get("/api/drivers", requireAuth(["admin", "staff", "akuntansi", "owner"]), (req, res) => {
  try {
    const drivers = db.prepare("SELECT * FROM sopir ORDER BY id ASC").all();
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat data sopir." });
  }
});

app.post("/api/drivers", requireAuth(["admin", "staff"]), (req, res) => {
  const { nama, nomor_wa, tarif_per_hari, status } = req.body;
  try {
    const ins = db.prepare("INSERT INTO sopir (nama, nomor_wa, tarif_per_hari, status) VALUES (?, ?, ?, ?)")
      .run(nama, nomor_wa, parseFloat(tarif_per_hari) || 150000, status || "tersedia");

    logAudit(req, "CREATE_DRIVER", "sopir", ins.lastInsertRowid, null, { nama });
    res.status(201).json({ pesan: "Data sopir berhasil ditambahkan." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal menambah data sopir." });
  }
});

// CUSTOMER & BLACKLIST
app.get("/api/customers", requireAuth(["admin", "staff", "owner"]), (req, res) => {
  try {
    const list = db.prepare("SELECT * FROM customer ORDER BY id DESC").all();
    res.json(list);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat customer." });
  }
});

app.put("/api/customers/:id/blacklist", requireAuth(["admin", "staff"]), (req, res) => {
  const { status_blacklist, alasan_blacklist } = req.body;
  try {
    db.prepare("UPDATE customer SET status_blacklist = ?, alasan_blacklist = ? WHERE id = ?")
      .run(status_blacklist ? 1 : 0, alasan_blacklist || null, req.params.id);

    logAudit(req, "UPDATE_BLACKLIST", "customer", req.params.id, null, { status_blacklist, alasan_blacklist });
    res.json({ pesan: "Status daftar hitam (blacklist) customer berhasil diperbarui." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal mengubah status blacklist." });
  }
});

// ====================================================================
// 12. DOKUMEN CETAK: INVOICE, KUITANSI, SPK (Bab VI)
// ====================================================================
app.get("/api/documents/print/:type/:orderId", requireAuth(["admin", "staff", "akuntansi", "owner"]), (req, res) => {
  const { type, orderId } = req.params; // 'invoice', 'kuitansi', 'spk'

  try {
    const order = db.prepare(`
      SELECT p.*, c.nama AS nama_customer, c.nomor_wa, c.email AS email_customer, c.alamat AS alamat_customer,
             m.nama AS nama_mobil, m.nomor_polisi, m.transmisi, m.tarif_per_hari,
             s.nama AS nama_sopir, s.nomor_wa AS wa_sopir
      FROM pemesanan p
      JOIN customer c ON p.customer_id = c.id
      JOIN mobil m ON p.mobil_id = m.id
      LEFT JOIN sopir s ON p.sopir_id = s.id
      WHERE p.id = ?
    `).get(orderId);

    if (!order) return res.status(404).json({ pesan: "Order tidak ditemukan." });

    const payments = db.prepare("SELECT * FROM pembayaran WHERE pemesanan_id = ? AND status = 'terverifikasi'").all(orderId);
    const verif = db.prepare("SELECT * FROM verifikasi_identitas WHERE pemesanan_id = ?").all(orderId);

    const totalTerbayar = payments.reduce((sum, p) => sum + p.nominal, 0);
    const sisaTagihan = Math.max(0, order.total_harga - totalTerbayar);

    res.json({
      type,
      order,
      payments,
      identitas: verif,
      total_terbayar: totalTerbayar,
      sisa_tagihan: sisaTagihan,
      tanggal_cetak: new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
      perusahaan: {
        nama: "RodaKita Rental Mobil",
        alamat: "Jl. Margonda Raya No. 120, Depok / Jakarta Selatan",
        kontak: "0812-3456-7890 / info@rodakitarental.id",
        rekening: "BCA 828-123-4567 a.n PT RodaKita Indonesia"
      }
    });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal membuat dokumen cetak: " + err.message });
  }
});

// ====================================================================
// 13. AUDIT LOG & MANAJEMEN USER (KHUSUS ADMIN)
// ====================================================================

app.get("/api/audit-logs", requireAuth(["admin", "owner"]), (req, res) => {
  try {
    const logs = db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 200").all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat audit log." });
  }
});

app.get("/api/users", requireAuth(["admin"]), (req, res) => {
  try {
    const users = db.prepare("SELECT id, username, nama, role, status, created_at FROM users ORDER BY id ASC").all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memuat pengguna." });
  }
});

app.post("/api/users", requireAuth(["admin"]), (req, res) => {
  const { username, password, nama, role } = req.body;
  if (!username || !password || !nama || !role) {
    return res.status(400).json({ pesan: "Harap isi seluruh field akun pengguna." });
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const ins = db.prepare("INSERT INTO users (username, password_hash, nama, role) VALUES (?, ?, ?, ?)")
      .run(username.trim(), hash, nama.trim(), role);

    logAudit(req, "CREATE_USER", "users", ins.lastInsertRowid, null, { username, role, nama });
    res.status(201).json({ pesan: `Pengguna '${username}' dengan peran '${role}' berhasil dibuat.` });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal membuat user: " + err.message });
  }
});

app.put("/api/users/:id", requireAuth(["admin"]), (req, res) => {
  const { nama, role, status, new_password } = req.body;
  const userId = req.params.id;

  try {
    const old = db.prepare("SELECT id, username, nama, role, status FROM users WHERE id = ?").get(userId);
    if (!old) return res.status(404).json({ pesan: "User tidak ditemukan." });

    if (new_password && new_password.trim().length >= 6) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(new_password.trim(), salt);
      db.prepare("UPDATE users SET nama = ?, role = ?, status = ?, password_hash = ? WHERE id = ?")
        .run(nama, role, status, hash, userId);
    } else {
      db.prepare("UPDATE users SET nama = ?, role = ?, status = ? WHERE id = ?")
        .run(nama, role, status, userId);
    }

    logAudit(req, "UPDATE_USER", "users", userId, old, { nama, role, status });
    res.json({ pesan: "Data pengguna berhasil diperbarui." });
  } catch (err) {
    res.status(500).json({ pesan: "Gagal memperbarui user." });
  }
});

// ====================================================================
// 14. BACKWARD-COMPATIBILITY: API PROGRES APK LAMA
// ====================================================================
app.get("/api/dashboard", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM dashboard WHERE id = 1").get();
    if (!row) return res.status(404).json({ pesan: "Data belum ada." });
    res.json({
      projectName: row.project_name,
      releaseDate: row.release_date,
      anggota: JSON.parse(row.anggota_json || "[]")
    });
  } catch (error) {
    res.status(500).json({ pesan: "Gagal membaca data dashboard." });
  }
});

app.post("/api/dashboard", (req, res) => {
  const { projectName, releaseDate, anggota } = req.body;
  try {
    db.prepare(`
      UPDATE dashboard
      SET project_name = ?, release_date = ?, anggota_json = ?
      WHERE id = 1
    `).run(projectName.slice(0, 150), releaseDate.slice(0, 10), JSON.stringify(anggota));
    res.json({ pesan: "Data berhasil disimpan." });
  } catch (error) {
    res.status(500).json({ pesan: "Gagal menyimpan data dashboard." });
  }
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  Sistem Rental Mobil RodaKita (Proposal v1.1) Berjalan `);
  console.log(`  URL Utama Website : http://localhost:${PORT}`);
  console.log(`  URL Admin Internal: http://localhost:${PORT}/admin.html`);
  console.log(`  Database SQLite   : ${dbPath}`);
  console.log(`====================================================`);
});
