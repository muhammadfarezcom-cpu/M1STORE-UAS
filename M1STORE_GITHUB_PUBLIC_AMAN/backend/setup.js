import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'node:fs';
const db=process.env.DB_NAME||'m1store';
if(!/^[a-zA-Z0-9_]+$/.test(db))throw Error('Nama database tidak valid');
const opts={host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',multipleStatements:true};
let c;
try {
 c=await mysql.createConnection(opts);
 await c.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 await c.changeUser({...opts,database:db});
 const schema=fs.readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
 await c.query(schema);
 const cols=async table=>new Set((await c.query(`SHOW COLUMNS FROM \`${table}\``))[0].map(x=>x.Field));
 const pc=await cols('products');
 if(!pc.has('stock')){await c.query('ALTER TABLE products ADD COLUMN stock INT NOT NULL DEFAULT 100');console.log('Kolom products.stock dibuat (stok awal 100).')}
 const oc=await cols('orders');
 if(!oc.has('stock_reserved')){await c.query('ALTER TABLE orders ADD COLUMN stock_reserved BOOLEAN NOT NULL DEFAULT FALSE');console.log('Kolom orders.stock_reserved dibuat.')}
 const [[{n}]]=await c.query('SELECT COUNT(*) n FROM products');
 if(Number(n)===0){
  const products=JSON.parse(fs.readFileSync(new URL('./products.json',import.meta.url),'utf8'));
  for(const p of products)await c.execute('INSERT INTO products(id,game,name,section,price,active,stock) VALUES(?,?,?,?,?,1,100)',[p.id,p.game,p.name,p.section,p.price]);
  console.log(`${products.length} produk demo dibuat, aktif, stok awal 100.`);
 }
 console.log('Database siap. Data lama tidak dihapus.');
}catch(e){console.error('SETUP DATABASE GAGAL:',e.message);process.exitCode=1}finally{if(c)await c.end()}
