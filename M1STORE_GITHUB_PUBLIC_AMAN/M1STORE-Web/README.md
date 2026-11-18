# M1STORE — Implementasi Web dari Figma

Prototipe interaktif dari desain Figma M1STORE, menggunakan aset asli SVG dari berkas `webbbb(1).zip`.

## Menjalankan

**Cara termudah (VS Code):** buka folder `M1STORE-Web` di VS Code, gunakan ekstensi **Live Server**, lalu pilih **Open with Live Server** pada `index.html`.

**Cara Python:** buka Terminal di folder ini dan jalankan:

```bash
python -m http.server 8000
```

Kunjungi **http://localhost:8000**. Tidak perlu npm, Composer, database, maupun instalasi dependensi frontend.

## Fitur demo

- Beranda responsif sesuai tema Figma, slider banner, pencarian dan katalog game.
- Detail produk, pilihan nominal, jumlah, metode bayar, kolom User ID, Zone ID, promo, WhatsApp, dan validasi input.
- Order demo lokal yang dapat dicek kembali di menu **Pesanan** dengan nomor order dan WhatsApp.
- Halaman checkout bergaya QRIS, ringkasan order dan countdown.
- Modal login, daftar akun, dan keluar akun demo.

## Penting

**Ini adalah prototipe frontend.** Tidak ada server, database produksi, transaksi pembayaran asli, webhook, verifikasi pembayaran, pengiriman diamond otomatis, atau integrasi provider game. QR hanya ilustrasi sehingga tidak bisa dipindai untuk transfer. Semua data demo disimpan pada `localStorage` di browser perangkat yang sama. Autentikasi sisi browser hanya untuk demonstrasi, jangan digunakan untuk layanan publik atau data sensitif.

Untuk menjadi produk nyata, butuh backend, basis data, autentikasi server-side, provider digital goods, gateway pembayaran, dan validasi order yang aman.

## Struktur

- `index.html` — kerangka HTML
- `styles.css` — desain dan responsivitas
- `script.js` — navigasi dan interaksi demo
- `assets/` — aset SVG asli dari ZIP pengguna

**Sumber desain:** https://www.figma.com/design/p6rxTAIlsAwk8HYZXUkYTP/Untitled?node-id=0-1


Aset game V2: enam gambar pengguna disimpan di assets/game-*.png. Mobile Legends tetap memakai aset asli karena gambar pengganti tidak disediakan. Gambar Anime Zero digunakan pada kartu Roblox sesuai urutan katalog; dapat diganti bila diinginkan.


## Banner baru (V2)
Slider berisi banner FAST HAND, Roblox, dan TOP UP GAME TERMURAH sesuai gambar yang dikirim. Berganti otomatis setiap 5 detik dan bisa dinavigasi manual. File ada di `assets/banner-*.png`.


## Katalog multi-game
Setiap game sekarang memiliki nominal, harga DEMO, dan formulir data akun yang berbeda.
Harga adalah contoh UI, **bukan harga resmi Ourastore maupun supplier**.
Untuk mengubah harga/nominal, edit objek `catalog` di awal `script.js`.
Tidak ada pembayaran nyata atau pengiriman item otomatis.

V6: Free Fire Naruto banner, diamond icon, 67 pilihan item sesuai daftar pengguna. Harga referensi, belum terhubung pembayaran asli.
