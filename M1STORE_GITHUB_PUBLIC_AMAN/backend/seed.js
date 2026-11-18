import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'node:fs';
const pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'m1store'});
const items=JSON.parse(fs.readFileSync(new URL('./products.json',import.meta.url)));
for(const p of items) await pool.execute(`INSERT INTO products(id,game,name,section,price,active) VALUES(?,?,?,?,?,false) ON DUPLICATE KEY UPDATE game=VALUES(game),name=VALUES(name),section=VALUES(section),price=VALUES(price)`,[p.id,p.game,p.name,p.section,p.price]);
console.log(`Seed ${items.length} produk; semuanya nonaktif sampai harga dan SKU supplier diverifikasi.`);await pool.end();
