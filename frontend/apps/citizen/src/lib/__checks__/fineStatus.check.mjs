// Comprobaciones de fineStatus: el criterio del Inicio vs el de la pantalla de Multas.
const ABIERTAS = new Set(['ISSUED','UPHELD','EXPIRED','APPEALED']);
const PORPAGAR = new Set(['ISSUED','UPHELD','EXPIRED']);
const abierta = f => ABIERTAS.has(f.status);
const porPagar = f => PORPAGAR.has(f.status);
const resumen = fs => { const d=fs.filter(porPagar);
  return {cantidad:d.length, totalMinor:d.reduce((s,f)=>s+f.amountPayableMinor,0), currencyCode:d[0]?.currencyCode ?? null}; };

let fallos=0;
const ok=(c,m)=>{ if(!c){console.log('  FALLA:',m);fallos++;} else console.log('  ok  ',m); };
const f=(status,pagar=10000)=>({status,amountPayableMinor:pagar,currencyCode:'CRC'});

console.log('el caso de Javier: una multa emitida');
const caso=[f('ISSUED',25000)];
ok(resumen(caso).cantidad===1,'el Inicio cuenta 1 (antes decia "Ninguna")');
ok(resumen(caso).totalMinor===25000,'el total es 25000');
ok(abierta(caso[0]),'aparece en la pestaña Pendientes');

console.log('una multa apelada: abierta, pero no se debe hoy');
const ap=[f('APPEALED')];
ok(abierta(ap[0]),'sigue en Pendientes, para poder revisarla');
ok(resumen(ap).cantidad===0,'el Inicio NO la cobra');

console.log('lo que no necesita nada de nadie');
for (const s of ['PAID','CANCELLED','DISMISSED','DRAFT']) {
  ok(!abierta(f(s)) && resumen([f(s)]).cantidad===0, `${s}: ni pendiente ni por pagar`);
}

console.log('las demas pagables');
for (const s of ['UPHELD','EXPIRED']) ok(resumen([f(s)]).cantidad===1, `${s}: se debe`);

console.log('mezcla realista');
const mix=[f('ISSUED',10000),f('APPEALED',50000),f('PAID',9999),f('UPHELD',5000),f('CANCELLED',1)];
const r=resumen(mix);
ok(r.cantidad===2, 'cuenta 2 por pagar (ISSUED + UPHELD)');
ok(r.totalMinor===15000, 'suma 15000, sin la apelada ni la pagada');
ok(mix.filter(abierta).length===3, 'la pestaña Pendientes muestra 3');

console.log('sin multas');
ok(resumen([]).cantidad===0 && resumen([]).currencyCode===null,'sin deudas: sin monto que mostrar');

console.log(fallos===0 ? '\n9 grupos, todo en verde' : `\n${fallos} FALLOS`);
process.exit(fallos?1:0);
