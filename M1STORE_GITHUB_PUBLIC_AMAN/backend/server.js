import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app=express();
const pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'m1store',waitForConnections:true,connectionLimit:10,decimalNumbers:true});
const queryTx=async(client,q,args=[])=>{const [rows]=await client.execute(sql(q),args);return {rows,rowCount:Array.isArray(rows)?rows.length:rows.affectedRows};};
const sql=(q)=>q.replace(/\$\d+/g,'?');
const query=async(q,args=[])=>{const [rows]=await pool.execute(sql(q),args);return {rows,rowCount:Array.isArray(rows)?rows.length:rows.affectedRows};};
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverKey=process.env.MIDTRANS_SERVER_KEY||'';
if(process.env.MIDTRANS_IS_PRODUCTION==='true') throw new Error('Versi V14 hanya sandbox. Production belum diaktifkan.');
app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'40kb'}));
app.use('/api',rateLimit({windowMs:60_000,limit:80,standardHeaders:'draft-7',legacyHeaders:false}));
const fail=(res,status,message)=>res.status(status).json({error:message});
// Reservasi stok atomik: setiap order menahan stok sebelum pembayaran.
async function reserveOrder(p, orderId, quantity, accountId, zoneId, whatsapp, demo=false, method='') {
 const c=await pool.getConnection();
 try { await c.beginTransaction();
  const r=await queryTx(c,'UPDATE products SET stock=stock-? WHERE id=? AND active=1 AND stock>=?',[quantity,p.id,quantity]);
  if(!r.rowCount){await c.rollback();return false;}
  await queryTx(c,'INSERT INTO orders(id,product_id,product_name,game,unit_price,quantity,total,account_id,zone_id,whatsapp,payment_status,fulfillment_status,payment_type,stock_reserved) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)',[orderId,p.id,p.name,p.game,p.price,quantity,p.price*quantity,accountId,zoneId||'',whatsapp,demo?'demo_paid':'pending',demo?'demo_delivered':'not_started',demo?'demo:'+method:null]);
  await c.commit();return true;
 }catch(e){await c.rollback();throw e}finally{c.release()}
}
async function releaseStockTx(c,order){
 if(!order.stock_reserved)return;
 await queryTx(c,'UPDATE products SET stock=stock+? WHERE id=?',[order.quantity,order.product_id]);
 await queryTx(c,'UPDATE orders SET stock_reserved=0 WHERE id=?',[order.id]);
}
async function failAndRelease(orderId,status){
 const c=await pool.getConnection();try{await c.beginTransaction();
 const r=await queryTx(c,'SELECT * FROM orders WHERE id=? FOR UPDATE',[orderId]);
 if(r.rowCount && r.rows[0].payment_status!=='paid' && r.rows[0].payment_status!=='demo_paid'){
 await releaseStockTx(c,r.rows[0]);await queryTx(c,'UPDATE orders SET payment_status=? WHERE id=?',[status,orderId]);}
 await c.commit();}catch(e){await c.rollback();throw e}finally{c.release()}
}

// Akun pelanggan tersimpan di MySQL; token acak disimpan sebagai hash SHA-256.
const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');
const authRequired=async(req,res,next)=>{try{const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!/^[a-f0-9]{64}$/.test(token))return fail(res,401,'Silakan login untuk membeli');const r=await query('SELECT u.id,u.name,u.email,u.whatsapp FROM customer_sessions s JOIN customers u ON u.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>NOW()',[hashToken(token)]);if(!r.rowCount)return fail(res,401,'Sesi habis. Silakan login kembali');req.customer=r.rows[0];next()}catch(e){next(e)}};
app.post('/api/auth/register',async(req,res,next)=>{try{const {name,email,password,whatsapp}=req.body||{};if(typeof name!=='string'||name.trim().length<2||name.length>100||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>190||typeof password!=='string'||password.length<8||password.length>128||typeof whatsapp!=='string'||!/^\+?\d{10,16}$/.test(whatsapp.replace(/[\s()-]/g,'')))return fail(res,400,'Lengkapi data dengan benar (kata sandi minimal 8 karakter)');const salt=crypto.randomBytes(16).toString('hex');const hashed=crypto.scryptSync(password,salt,64).toString('hex');try{await query('INSERT INTO customers(name,email,whatsapp,password_salt,password_hash) VALUES(?,?,?,?,?)',[name.trim(),email.trim().toLowerCase(),whatsapp.replace(/[\s()-]/g,''),salt,hashed])}catch(e){if(e.code==='ER_DUP_ENTRY')return fail(res,409,'Email sudah terdaftar');throw e}res.status(201).json({ok:true})}catch(e){next(e)}});
app.post('/api/auth/login',async(req,res,next)=>{try{const {email,password}=req.body||{};if(typeof email!=='string'||typeof password!=='string')return fail(res,400,'Email dan kata sandi wajib diisi');const r=await query('SELECT * FROM customers WHERE email=?',[email.trim().toLowerCase()]);if(!r.rowCount)return fail(res,401,'Email atau kata sandi salah');const u=r.rows[0],candidate=crypto.scryptSync(password,u.password_salt,64),actual=Buffer.from(u.password_hash,'hex');if(actual.length!==candidate.length||!crypto.timingSafeEqual(actual,candidate))return fail(res,401,'Email atau kata sandi salah');const token=crypto.randomBytes(32).toString('hex');await query('INSERT INTO customer_sessions(customer_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 7 DAY))',[u.id,hashToken(token)]);res.json({token,user:{name:u.name,email:u.email,whatsapp:u.whatsapp}})}catch(e){next(e)}});
app.get('/api/auth/me',authRequired,(req,res)=>res.json({user:req.customer}));
app.post('/api/auth/logout',authRequired,async(req,res,next)=>{try{await query('DELETE FROM customer_sessions WHERE token_hash=?',[hashToken(String(req.headers.authorization).replace(/^Bearer\s+/i,''))]);res.json({ok:true})}catch(e){next(e)}});
app.get('/api/health',(_req,res)=>res.json({ok:true,mode:'sandbox',supplier:'demo_simulation'}));
app.get('/api/config',(_req,res)=>res.json({mode:'sandbox',supplierConfigured:false,demoMode:true,clientKey:process.env.MIDTRANS_CLIENT_KEY||null}));
app.get('/api/products',async(_req,res,next)=>{try{const r=await query('SELECT id,game,name,section,price,active,stock FROM products ORDER BY game,id');res.json(r.rows)}catch(e){next(e)}});
// Mode Demo lokal: tidak pernah memanggil Midtrans atau mengubah status transaksi Midtrans.
app.post('/api/orders',authRequired,async(req,res,next)=>{
 try{
  const {productId,quantity,accountId,zoneId,whatsapp,paymentMethod}=req.body||{};
  // Whitelist server-side: the customer cannot choose an arbitrary Midtrans channel.
  const paymentChannels={
    'QRIS':['qris'],
    'GoPay':['gopay'],
    'ShopeePay / SPayLater':['shopeepay'],
    'BCA Virtual Account':['bca_va'],
    'BRI Virtual Account':['bri_va'],
    'BNI Virtual Account':['bni_va'],
    'Mandiri Virtual Account':['echannel']
  };
  if(!Object.hasOwn(paymentChannels,paymentMethod))return fail(res,400,'Metode pembayaran tidak didukung. Silakan pilih metode lain.');
  if(typeof productId!=='string'||!Number.isInteger(quantity)||quantity<1||quantity>10)return fail(res,400,'Produk/jumlah tidak valid');
  if(typeof accountId!=='string'||!/^[\p{L}\p{N}_.@ #+-]{2,60}$/u.test(accountId))return fail(res,400,'ID akun tidak valid');
  if(typeof whatsapp!=='string'||!/^\+?\d{10,16}$/.test(whatsapp))return fail(res,400,'WhatsApp tidak valid');
  if(zoneId!=null&&(typeof zoneId!=='string'||zoneId.length>40))return fail(res,400,'Zone tidak valid');
  const p=(await query('SELECT * FROM products WHERE id=$1',[productId])).rows[0];
  if(!p||!p.active)return fail(res,409,'Produk belum aktif; aktifkan melalui dashboard admin');
  if(!serverKey.startsWith('SB-Mid-server-')||serverKey.includes('ISI_')||serverKey.includes('xxxxxxxx'))return fail(res,503,'Midtrans Sandbox belum dikonfigurasi: masukkan Server Key Sandbox asli di .env, lalu restart server. Konfigurasikan Server Key Sandbox pada .env.');
  const id='M1-'+crypto.randomUUID().replace(/-/g,'').slice(0,20).toUpperCase();const total=p.price*quantity;
  if(!await reserveOrder(p,id,quantity,accountId,zoneId,whatsapp))return fail(res,409,'Stok tidak mencukupi');
  const body={transaction_details:{order_id:id,gross_amount:total},item_details:[{id:p.id,price:p.price,quantity,name:p.name.slice(0,50)}],customer_details:{first_name:'Pelanggan M1STORE',phone:whatsapp},enabled_payments:paymentChannels[paymentMethod]};
  let response,data;
  try {response=await fetch('https://app.sandbox.midtrans.com/snap/v1/transactions',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(serverKey+':').toString('base64'),'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});data=await response.json().catch(()=>({}));}
  catch(e){await failAndRelease(id,'setup_failed');throw e;}
  if(!response.ok||!data.token){await failAndRelease(id,'setup_failed');return fail(res,502,'Gagal membuat pembayaran Sandbox; periksa kredensial Midtrans');}
  await query('UPDATE orders SET snap_token=?,snap_redirect_url=? WHERE id=?',[data.token,data.redirect_url,id]);
  res.status(201).json({orderId:id,total,redirectUrl:data.redirect_url,snapToken:data.token,paymentStatus:'pending',fulfillmentStatus:'not_started'});
 }catch(e){next(e)}
});
// Sinkronisasi status hanya dari API resmi Midtrans, bukan dari browser.
async function syncMidtransOrder(orderId, expectedTotal) {
 if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY belum diatur');
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 10000);
 let response;
 try {
  response = await fetch('https://api.sandbox.midtrans.com/v2/'+encodeURIComponent(orderId)+'/status', {
   headers: { Authorization: 'Basic '+Buffer.from(serverKey+':').toString('base64'), Accept: 'application/json' },
   signal: controller.signal
  });
 } finally { clearTimeout(timeout); }
 if (!response.ok) throw new Error('Midtrans status HTTP '+response.status);
 const n = await response.json();
 if (String(n.order_id) !== orderId || Number(n.gross_amount) !== Number(expectedTotal)) throw new Error('Identitas/nominal transaksi Midtrans tidak cocok');
 const raw = String(n.transaction_status || '');
 const fraud = String(n.fraud_status || 'accept');
 const paid = raw === 'settlement' || (raw === 'capture' && fraud === 'accept');
 const nextStatus = paid ? 'paid' : raw === 'pending' ? 'pending' : ['expire','cancel','deny','failure'].includes(raw) ? 'failed' : ['refund','partial_refund','chargeback'].includes(raw) ? 'refunded' : null;
 if (!nextStatus) return;
 const client = await pool.getConnection();
 try {
  await client.beginTransaction();
  const r = await queryTx(client,'SELECT * FROM orders WHERE id=? FOR UPDATE',[orderId]);
  if (!r.rowCount) { await client.rollback(); return; }
  const old = r.rows[0];
  if (Number(old.total) !== Number(n.gross_amount)) throw new Error('Nominal lokal tidak cocok');
  const finalStatus = old.payment_status === 'paid' && nextStatus !== 'refunded' ? 'paid' : nextStatus;
  if(['failed','refunded'].includes(finalStatus) && old.payment_status!=='paid')await releaseStockTx(client,old);
  await queryTx(client,'UPDATE orders SET payment_status=?,payment_type=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[finalStatus,n.payment_type||null,orderId]);
  if (paid) {
   await queryTx(client,'INSERT INTO fulfillment_jobs(order_id) VALUES(?) ON DUPLICATE KEY UPDATE order_id=order_id',[orderId]);
   await queryTx(client,"UPDATE orders SET fulfillment_status='demo_delivered' WHERE id=? AND fulfillment_status IN ('not_started','awaiting_supplier')",[orderId]);
  }
  await client.commit();
 } catch(e) { await client.rollback(); throw e; } finally { client.release(); }
}
app.get('/api/orders/:id',async(req,res,next)=>{try{
 const wa=String(req.query.wa||'');if(!/^\+?\d{10,16}$/.test(wa))return fail(res,400,'Nomor WhatsApp diperlukan');
 const r=await query('SELECT id,game,product_name,unit_price,quantity,total,account_id,zone_id,payment_status,fulfillment_status,created_at,snap_redirect_url FROM orders WHERE id=$1 AND whatsapp=$2',[req.params.id,wa]);
 if(!r.rowCount)return fail(res,404,'Pesanan tidak ditemukan');
 // Hanya pemilik nomor WhatsApp pesanan yang dapat memicu pengecekan.
 try { if(r.rows[0].payment_status!=='demo_paid' && !req.params.id.startsWith('DEMO-')) await syncMidtransOrder(req.params.id,r.rows[0].total); }
 catch (e) { console.warn('Sinkronisasi Midtrans gagal:',e.message); }
 await query("UPDATE orders SET fulfillment_status='demo_delivered' WHERE id=? AND payment_status='paid' AND fulfillment_status IN ('not_started','awaiting_supplier')",[req.params.id]);
 const updated=await query('SELECT id,game,product_name,unit_price,quantity,total,account_id,zone_id,payment_status,fulfillment_status,created_at,snap_redirect_url FROM orders WHERE id=? AND whatsapp=?',[req.params.id,wa]);
 res.json(updated.rows[0]);
}catch(e){next(e)}});
app.post('/api/midtrans/webhook',async(req,res,next)=>{
 const n=req.body||{};
 try{
  if(!serverKey||!n.order_id||!n.signature_key||!n.gross_amount||!n.status_code)return fail(res,401,'Signature tidak lengkap');
  const sig=crypto.createHash('sha512').update(String(n.order_id)+String(n.status_code)+String(n.gross_amount)+serverKey).digest('hex');
  const a=Buffer.from(sig,'hex'),b=Buffer.from(String(n.signature_key),'hex');
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return fail(res,401,'Signature tidak sah');
  const client=await pool.getConnection();
  try{
   await client.beginTransaction();
   const q=await queryTx(client,'SELECT * FROM orders WHERE id=$1 FOR UPDATE',[n.order_id]);
   if(!q.rowCount){await client.rollback();return fail(res,404,'Pesanan tidak ditemukan')}
   const o=q.rows[0];
   if(Number(n.gross_amount)!==o.total){await client.rollback();return fail(res,400,'Jumlah pembayaran tidak cocok')}
   const raw=String(n.transaction_status||'');const fraud=String(n.fraud_status||'accept');
   const paid=(raw==='settlement'||(raw==='capture'&&fraud==='accept'));
   let status=paid?'paid':raw==='pending'?'pending':['expire','cancel','deny','failure'].includes(raw)?'failed':raw==='refund'?'refunded':'pending';
   // Tidak turunkan paid ke pending/failed akibat notifikasi terlambat.
   if(o.payment_status==='paid'&&status!=='refunded')status='paid';
   await queryTx(client,'INSERT INTO payment_events(order_id,status,transaction_id,payload) VALUES($1,$2,$3,$4)',[o.id,raw,n.transaction_id||null,JSON.stringify(n)]);
   if(['failed','refunded'].includes(status) && o.payment_status!=='paid')await releaseStockTx(client,o);
   await queryTx(client,'UPDATE orders SET payment_status=?,payment_type=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[status,n.payment_type||null,o.id]);
   if(paid){await queryTx(client,"INSERT INTO fulfillment_jobs(order_id) VALUES($1) ON DUPLICATE KEY UPDATE order_id=order_id",[o.id]);await queryTx(client,"UPDATE orders SET fulfillment_status='demo_delivered' WHERE id=? AND fulfillment_status IN ('not_started','awaiting_supplier')",[o.id]);}
   await client.commit();
  }catch(e){await client.rollback();throw e}finally{client.release()}
  res.json({ok:true});
 }catch(e){next(e)}
});

// Dashboard tugas lokal: Basic Auth dengan kata sandi tersendiri; jangan gunakan API Key Midtrans.
const adminAuth=(req,res,next)=>{
 const user=process.env.ADMIN_USER||'admin'; const pass=process.env.ADMIN_PASSWORD||'';
 if(!pass || pass.length<12)return fail(res,503,'Atur ADMIN_PASSWORD minimal 12 karakter di .env');
 const header=String(req.headers.authorization||'');
 let supplied='';
 if(header.startsWith('Basic ')){try{supplied=Buffer.from(header.slice(6),'base64').toString('utf8')}catch{}}
 const expected=user+':'+pass;
 const a=crypto.createHash('sha256').update(supplied).digest();
 const b=crypto.createHash('sha256').update(expected).digest();
 if(!crypto.timingSafeEqual(a,b)){res.set('WWW-Authenticate','Basic realm="M1STORE Admin"');return fail(res,401,'Login admin diperlukan')}
 next();
};
// Route dashboard tersedia dengan atau tanpa trailing slash.
app.get(['/admin', '/admin/'], adminAuth, (_req, res, next) => {
  const adminFile = path.resolve(__dirname, '../M1STORE-Web/admin.html');
  res.sendFile(adminFile, err => { if (err) next(err); });
});
app.get('/api/admin/summary',adminAuth,async(_req,res,next)=>{try{
 const [orders,products]=await Promise.all([
  query("SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0) AS revenue, SUM(CASE WHEN payment_status='paid' THEN 1 ELSE 0 END) AS paid, SUM(CASE WHEN payment_status='pending' THEN 1 ELSE 0 END) AS pending FROM orders"),
  query('SELECT COUNT(*) AS products, SUM(active=1) AS active FROM products')]);
 res.json({...orders.rows[0],...products.rows[0],demo:true});
}catch(e){next(e)}});
app.get('/api/admin/orders',adminAuth,async(req,res,next)=>{try{
 const r=await query('SELECT id,game,product_name,quantity,total,account_id,zone_id,whatsapp,payment_status,fulfillment_status,created_at FROM orders ORDER BY created_at DESC LIMIT 200');res.json(r.rows);
}catch(e){next(e)}});
app.get('/api/admin/products',adminAuth,async(_req,res,next)=>{try{res.json((await query('SELECT id,game,name,price,active,stock FROM products ORDER BY game,id')).rows)}catch(e){next(e)}});
app.patch('/api/admin/products/:id',adminAuth,async(req,res,next)=>{try{
 const {price,active,stock}=req.body||{};
 if(!Number.isSafeInteger(price)||price<100||price>100000000||typeof active!=='boolean'||!Number.isSafeInteger(stock)||stock<0||stock>1000000)return fail(res,400,'Harga, status atau stok tidak valid');
 const r=await query('UPDATE products SET price=?,active=?,stock=? WHERE id=?',[price,active?1:0,stock,req.params.id]);
 if(!r.rowCount)return fail(res,404,'Produk tidak ditemukan');res.json({ok:true});
}catch(e){next(e)}});
app.get('/api/admin/report.csv',adminAuth,async(_req,res,next)=>{try{
 const r=await query('SELECT id,created_at,game,product_name,quantity,total,payment_status,fulfillment_status FROM orders ORDER BY created_at DESC LIMIT 5000');
 const cols=['id','created_at','game','product_name','quantity','total','payment_status','fulfillment_status'];
 const safe=v=>{let x=String(v??'');if(/^[=+@-]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'};
 res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="laporan-m1store.csv"');res.send('\uFEFF'+cols.join(',')+'\n'+r.rows.map(o=>cols.map(c=>safe(o[c])).join(',')).join('\n'));
}catch(e){next(e)}});

// Tidak ada endpoint publik untuk memaksa pembayaran berhasil atau mengirim item.
app.get('/admin.html',adminAuth,(_req,res)=>res.redirect('/admin'));
app.use(express.static(path.resolve(__dirname,'../M1STORE-Web'),{index:'index.html'}));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Kesalahan server'});});
app.listen(Number(process.env.PORT||3000),()=>{ console.log('M1STORE FINAL demo sandbox: http://localhost:'+(process.env.PORT||3000)); console.log('Dashboard admin: http://localhost:'+(process.env.PORT||3000)+'/admin'); console.log('Server file: '+fileURLToPath(import.meta.url)); });
