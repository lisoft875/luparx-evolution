const CRIT=300, WARN=600;
const urgencyOf=s=>s<=0?'expired':s<=CRIT?'critical':s<=WARN?'warning':'calm';
const toneFor=u=>({expired:'danger',critical:'warning',warning:'warning',calm:'success'})[u];
const msg=u=>u==='critical'?'critical':u==='warning'?'warning':null;
const casos=[
 [3600,'calm','success',null],[601,'calm','success',null],[600,'warning','warning','warning'],
 [301,'warning','warning','warning'],[300,'critical','warning','critical'],
 [1,'critical','warning','critical'],[0,'expired','danger',null],[-5,'expired','danger',null],
];
let malos=0;
for(const [s,eu,et,em] of casos){
  const u=urgencyOf(s), t=toneFor(u), m=msg(u);
  const ok=u===eu&&t===et&&m===em; if(!ok)malos++;
  console.log(`  ${ok?'ok ':'MAL'} ${String(s).padStart(5)}s -> ${u.padEnd(9)} ${t.padEnd(8)} ${m??'(sin texto)'}`);
}
console.log(malos?`${malos} FALLOS`:'8/8 correcto · 4 niveles, rojo reservado a lo vencido');
