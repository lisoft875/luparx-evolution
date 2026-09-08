import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [w,h,n] of [[1440,900,'desk'],[390,844,'phone']]) {
  const p = await b.newPage({ viewport:{width:w,height:h}, locale:'es-CR' });
  const missing = [];
  p.on('response', r => { if (r.status() >= 400) missing.push(r.status()+' '+r.url().slice(-60)); });
  await p.goto('http://localhost:8899/'); await p.waitForTimeout(1200);
  await p.screenshot({ path:`/home/claude/previews/skin-http-${n}.png` });
  console.log(n, 'errores de red:', missing.length ? missing.join(' | ') : 'ninguno');
  await p.close();
}
await b.close();
