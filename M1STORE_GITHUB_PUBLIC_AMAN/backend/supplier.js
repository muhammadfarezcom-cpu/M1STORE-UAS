// Adapter interface; sengaja TIDAK melakukan top up sungguhan.
export async function submitTopup(order) {
  if(process.env.SUPPLIER_MODE!=='mock') throw new Error('Supplier nyata belum dikonfigurasi');
  return {status:'awaiting_supplier',reference:null,message:'Belum ada supplier; pesanan menunggu integrasi. Jangan tandai terkirim.'};
}
