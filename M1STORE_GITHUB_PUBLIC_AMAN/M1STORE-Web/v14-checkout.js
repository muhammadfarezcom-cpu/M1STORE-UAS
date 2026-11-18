'use strict';
// V14: mengganti transaksi localStorage dengan backend. Harus dijalankan setelah script.js.
const api=async(path,opts={})=>{const r=await fetch('/api'+path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Koneksi server gagal');return d};
const oldDetail=detail;
detail=function(gameid){oldDetail(gameid);const hint=document.querySelector('.official');if(hint)hint.textContent='MIDTRANS SANDBOX';const guide=document.querySelector('.guide');if(guide)guide.insertAdjacentHTML('beforeend','<p><b>Mode Tugas:</b> hanya produk yang diaktifkan admin dapat diuji; pengiriman item hanya simulasi, bukan Diamond sungguhan.</p>');};
placeOrder=async function(){
 if(!storage.get('m1_auth_token')){saveForm();toast('Login dulu sebelum membeli.');modal('login');return;}
 const user=$('#userId')?.value.trim(),zone=$('#zoneId')?.value.trim()||'',wa=$('#whatsapp')?.value.trim().replace(/[\s()-]/g,'');
 if(!user||!wa){toast('Isi ID akun dan WhatsApp dahulu');return}
 if((catalog[state.game.id]||catalog.mlbb).fields.length>1&&!zone){toast('Lengkapi data akun tambahan');return}
 const button=$('#buyNow');button.disabled=true;button.textContent='Membuat pesanan sandbox...';
 try{
  const result=await api('/orders',{headers:{Authorization:'Bearer '+storage.get('m1_auth_token')},method:'POST',body:JSON.stringify({productId:state.game.id+'-'+(state.selected+1),quantity:state.qty,accountId:user,zoneId:zone,whatsapp:wa,paymentMethod:state.method})});
  storage.set('m1_v14_last',{id:result.orderId,wa});
  // Snap popup stays on M1STORE; never follow a placeholder finish URL.
  const showOrder=()=>{location.hash='/orders';track();const last=storage.get('m1_v14_last');if(last){$('#trackNo').value=last.id;$('#trackWA').value=last.wa;$('#v14Track').requestSubmit()}};
  if(result.snapToken){
   try{
    const config=await api('/config');
    if(!config.clientKey)throw new Error('Client Key Midtrans belum tersedia');
    if(!window.snap){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://app.sandbox.midtrans.com/snap/snap.js';script.dataset.clientKey=config.clientKey;script.onload=resolve;script.onerror=()=>reject(new Error('Gagal memuat Midtrans Snap'));document.head.appendChild(script)})}
    window.snap.pay(result.snapToken,{onSuccess:showOrder,onPending:showOrder,onError:showOrder,onClose:()=>{button.disabled=false;button.textContent='BELI SEKARANG →';toast('Pembayaran belum diselesaikan. Cek menu Pesanan.')}});
    button.disabled=false;button.textContent='BELI SEKARANG →';return;
   }catch(error){console.error('Snap popup:',error);toast(error.message+' — buka menu Pesanan untuk cek transaksi');showOrder();return}
  }
  showOrder();
 }catch(e){toast(e.message);button.disabled=false;button.textContent='BELI SEKARANG →'}
};
track=function(){
 $('#app').innerHTML='<div class="track-page"><div class="track-inner"><h1>Cek <span>Pesanan</span></h1><p>Status pembayaran diverifikasi melalui Midtrans Sandbox.</p><form id="v14Track" class="track-form"><h3>Nomor Pesanan</h3><input id="trackNo" placeholder="M1-..." required><label>WhatsApp</label><input id="trackWA" placeholder="08..." required><button class="wide-button">Cek Status</button><div id="trackResult"></div></form></div></div>';
 const last=storage.get('m1_v14_last');if(last){$('#trackNo').value=last.id;$('#trackWA').value=last.wa}
 $('#v14Track').onsubmit=async e=>{e.preventDefault();try{
  const d=await api('/orders/'+encodeURIComponent($('#trackNo').value.trim())+'?wa='+encodeURIComponent($('#trackWA').value.trim()));
  const paymentLabels={pending:'Menunggu pembayaran',paid:'Pembayaran berhasil',failed:'Pembayaran gagal',refunded:'Dana dikembalikan',setup_failed:'Gagal membuat pembayaran'};
  const deliveryLabels={not_started:'Belum diproses',awaiting_supplier:'Menunggu integrasi supplier',processing:'Sedang diproses',success:'Terkirim',failed:'Gagal diproses'};
  const date=new Date(d.created_at).toLocaleString('id-ID',{dateStyle:'long',timeStyle:'short'});
  const receipt='<section id="m1Receipt" style="background:#fff;color:#172033;padding:24px;border-radius:14px;line-height:1.8;text-align:left;margin-top:18px">'+
   '<h2 style="color:#172033;margin:0">M1STORE · Rincian Pembelian</h2><p>Nomor pesanan: <b>'+escapeHTML(d.id)+'</b></p><hr>'+
   '<p>Tanggal: '+escapeHTML(date)+'<br>Game: '+escapeHTML(d.game)+'<br>Produk: '+escapeHTML(d.product_name)+'<br>ID akun: '+escapeHTML(d.account_id)+'<br>Zone/Server: '+escapeHTML(d.zone_id||'-')+'<br>Harga satuan: '+money(d.unit_price)+'<br>Jumlah: '+d.quantity+'<br><b>Total: '+money(d.total)+'</b></p><hr>'+
   '<p>Status pembayaran: <b>'+escapeHTML(paymentLabels[d.payment_status]||d.payment_status)+'</b><br>Status pengiriman: <b>'+escapeHTML(deliveryLabels[d.fulfillment_status]||d.fulfillment_status)+'</b></p>'+
   '<small>'+ (d.payment_status==='paid'?'Pembayaran telah diverifikasi melalui Midtrans Sandbox. ':'Status pembayaran mengikuti hasil verifikasi Midtrans. ') +'Pengiriman item hanya SIMULASI tugas, tidak ada Diamond sungguhan yang dikirim. Sandbox tidak menggunakan uang sungguhan.</small></section>';
  $('#trackResult').innerHTML=receipt+'<button type="button" id="m1PrintReceipt" class="wide-button" style="margin-top:12px">Cetak / Simpan PDF</button><button type="button" id="m1RefreshReceipt" class="wide-button" style="margin-top:8px">Perbarui Status</button>';
  $('#m1RefreshReceipt').onclick=()=>$('#v14Track').requestSubmit();
  $('#m1PrintReceipt').onclick=()=>{const w=window.open('','_blank');if(!w){toast('Izinkan pop-up untuk mencetak');return}w.document.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Pesanan '+escapeHTML(d.id)+'</title></head><body style="font-family:Arial,sans-serif;max-width:650px;margin:35px auto">'+receipt+'</body></html>');w.document.close();w.focus();w.print()};
 }catch(e){toast(e.message)}};
};
payment=function(id){track();const last=storage.get('m1_v14_last');if(last&&last.id===id){$('#trackNo').value=id;$('#trackWA').value=last.wa;$('#v14Track').requestSubmit()}};

// Ganti form akun demo lokal dengan autentikasi backend.
modal=function(mode='login'){
 const reg=mode==='register',session=storage.get('m1_session');
 $('#modalRoot').innerHTML=`<div class="modal-shell" id="modalShell"><div class="auth-modal" role="dialog" aria-modal="true"><button class="close-modal" id="closeModal">✕</button><h2>${session?'AKUN SAYA':reg?'DAFTAR AKUN':'LOGIN'}</h2>${session?`<p>Halo, ${escapeHTML(session.name)}</p><button id="signOut" class="wide-button">Keluar</button>`:`<p>${reg?'Buat akun sebelum berbelanja':'Login diperlukan sebelum membeli'}</p><form id="authForm" class="auth-form">${reg?'<label>NAMA<input id="authName" required minlength="2"></label>':''}<label>EMAIL<input id="authEmail" type="email" required></label>${reg?'<label>WHATSAPP<input id="authWA" required></label>':''}<label>KATA SANDI<input id="authPassword" type="password" minlength="8" required></label>${reg?'<label>ULANGI KATA SANDI<input id="authConfirm" type="password" minlength="8" required></label>':''}<button type="submit" class="wide-button">${reg?'DAFTAR':'LOGIN'}</button></form><div class="auth-bottom">${reg?'Sudah punya akun?':'Belum punya akun?'} <button id="switchAuth" class="text-button">${reg?'Login':'Daftar'}</button></div>`}</div></div>`;
 $('#closeModal').onclick=closeModal;$('#modalShell').onclick=e=>{if(e.target.id==='modalShell')closeModal()};
 if(session){$('#signOut').onclick=async()=>{const token=storage.get('m1_auth_token');try{if(token)await api('/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token}})}catch(e){}localStorage.removeItem('m1_auth_token');localStorage.removeItem('m1_session');closeModal();route();toast('Berhasil keluar')}}
 else{$('#switchAuth').onclick=()=>modal(reg?'login':'register');$('#authForm').onsubmit=async e=>{e.preventDefault();const email=$('#authEmail').value.trim(),password=$('#authPassword').value;try{if(reg){if(password!==$('#authConfirm').value){toast('Konfirmasi kata sandi tidak cocok');return}await api('/auth/register',{method:'POST',body:JSON.stringify({name:$('#authName').value.trim(),email,password,whatsapp:$('#authWA').value.trim()})})}const d=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});storage.set('m1_auth_token',d.token);storage.set('m1_session',d.user);closeModal();route();toast('Berhasil login sebagai '+d.user.name)}catch(err){toast(err.message)}}}
};
// Validasi ulang sesi setelah refresh, tanpa mempercayai localStorage sebagai otorisasi server.
(async()=>{const token=storage.get('m1_auth_token');if(!token){localStorage.removeItem('m1_session');return}try{const d=await api('/auth/me',{headers:{Authorization:'Bearer '+token}});storage.set('m1_session',d.user)}catch(e){localStorage.removeItem('m1_auth_token');localStorage.removeItem('m1_session')}route()})();
