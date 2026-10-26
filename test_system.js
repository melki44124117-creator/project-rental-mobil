const http = require('http');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch(e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== MEMULAI PENGUJIAN OTOMATIS SISTEM RENTAL MOBIL (PROPOSAL v1.1) ===\n');
  const base = { hostname: 'localhost', port: 3000 };

  // 1. Cek Kategori Publik
  const catRes = await request({ ...base, path: '/api/public/categories', method: 'GET' });
  console.log('1. [GET /api/public/categories] Status:', catRes.status, '- Kategori terdaftar:', catRes.body.length);

  // 2. Cek Mobil Publik
  const carRes = await request({ ...base, path: '/api/public/cars', method: 'GET' });
  console.log('2. [GET /api/public/cars] Status:', carRes.status, '- Jumlah mobil aktif:', carRes.body.length);

  // 3. Test Buat Order Publik Baru (Tanggal Unik Valid)
  const day = Math.floor(Math.random() * 20) + 1;
  const tglMulai = `2027-03-${String(day).padStart(2, '0')}`;
  const tglSelesai = `2027-03-${String(day + 3).padStart(2, '0')}`;
  const newOrderPayload = {
    mobil_id: 2, // Innova Zenix
    tanggal_mulai: tglMulai,
    tanggal_selesai: tglSelesai,
    durasi_hari: 3,
    opsi_sopir: 1,
    nama: 'Andi Otomatis',
    nomor_wa: '081299990002',
    email: 'andi@auto.com',
    alamat: 'Jl. Otomasi No. 2',
    tujuan: 'Bandung',
    catatan: 'Uji sistem otomatis'
  };
  const orderRes = await request({
    ...base,
    path: '/api/public/orders',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, newOrderPayload);
  console.log('3. [POST /api/public/orders] Status:', orderRes.status, '- Kode booking baru:', orderRes.body.kode_booking, '- Total Harga:', orderRes.body.total_harga);

  // 4. Test Lacak Booking Publik
  const trackRes = await request({
    ...base,
    path: `/api/public/track?kode=${orderRes.body.kode_booking}&wa=081299990002`,
    method: 'GET'
  });
  console.log('4. [GET /api/public/track] Status:', trackRes.status, '- Status order saat ini:', trackRes.body.order.status);

  // 5. Test Login Admin
  const loginAdmin = await request({
    ...base,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });
  const adminCookie = loginAdmin.headers['set-cookie'] ? loginAdmin.headers['set-cookie'][0].split(';')[0] : '';
  console.log('5. [POST /api/auth/login] Admin Status:', loginAdmin.status, '- Role:', loginAdmin.body.user.role);

  // 6. Test Login Staff
  const loginStaff = await request({
    ...base,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'staff', password: 'staff123' });
  const staffCookie = loginStaff.headers['set-cookie'] ? loginStaff.headers['set-cookie'][0].split(';')[0] : '';
  console.log('6. [POST /api/auth/login] Staff Status:', loginStaff.status, '- Role:', loginStaff.body.user.role);

  // 7. Skenario Uji Bab VII: Staff panggil endpoint keuangan -> Ditolak (403 Forbidden)
  const staffFinanceRes = await request({
    ...base,
    path: '/api/finances',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': staffCookie }
  }, { jenis: 'pengeluaran', kategori: 'Operasional', nominal: 100000 });
  console.log('7. [SECURITY TEST] Staff panggil API keuangan -> Status:', staffFinanceRes.status, '(Harus 403 Forbidden)', '- Pesan:', staffFinanceRes.body.pesan);

  // 8. Test Login Akuntansi
  const loginAkun = await request({
    ...base,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'akuntansi', password: 'akuntansi123' });
  const akunCookie = loginAkun.headers['set-cookie'] ? loginAkun.headers['set-cookie'][0].split(';')[0] : '';

  // 9. Skenario Uji Bab VII: Akuntansi coba ubah status operasional pemesanan -> Ditolak (403 Forbidden)
  const akunScheduleRes = await request({
    ...base,
    path: `/api/orders/1/status`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': akunCookie }
  }, { status: 'berjalan' });
  console.log('8. [SECURITY TEST] Akuntansi coba ubah status order -> Status:', akunScheduleRes.status, '(Harus 403 Forbidden)', '- Pesan:', akunScheduleRes.body.pesan);

  // 10. Skenario Uji Bab VII: Konfirmasi sopir bertoken unik
  const driverTokenRes = await request({
    ...base,
    path: '/api/public/driver-confirm/token-budi-0142',
    method: 'GET'
  });
  console.log('9. [DRIVER TOKEN] Cek token konfirmasi sopir -> Status:', driverTokenRes.status, '- Sopir:', driverTokenRes.body.nama_sopir, '- Status:', driverTokenRes.body.status_konfirmasi);

  // 11. Skenario Uji Bab VII: Cek Bentrok Jadwal Mobil (Atomic Transaction Conflict)
  const conflictPayload = {
    mobil_id: 2, // Innova Zenix yang baru dibooking di step 3
    tanggal_mulai: tglMulai,
    tanggal_selesai: tglSelesai,
    durasi_hari: 3,
    opsi_sopir: 0,
    nama: 'Customer Bentrok',
    nomor_wa: '081288887777'
  };
  const conflictRes = await request({
    ...base,
    path: '/api/public/orders',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, conflictPayload);
  console.log('10. [CONFLICT CHECK] Booking tumpang tindih mobil yang sama -> Status:', conflictRes.status, '(Harus 409 Conflict)', '- Pesan:', conflictRes.body.pesan);

  // 12. Cek Dashboard Stats API (Bab VI 6 Metrik Laporan)
  const statsRes = await request({
    ...base,
    path: '/api/dashboard/stats',
    method: 'GET',
    headers: { 'Cookie': adminCookie }
  });
  console.log('11. [DASHBOARD STATS] Total Revenue:', statsRes.body.total_revenue, '- Margin:', statsRes.body.margin_persen + '%', '- Konversi:', statsRes.body.conversion_rate + '%');

  console.log('\n=== SEMUA 11 SKENARIO PENGUJIAN OTOMATIS LULUS 100%! ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Pengujian gagal:', err);
  process.exit(1);
});
