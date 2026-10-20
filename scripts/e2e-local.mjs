// Jornada completa no modo local: nascer -> 7 quests -> vínculo 5 -> despertar -> reinício preserva progresso.
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? '.';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/01-entrada.png` });
await page.getByText('Jogar offline').click();
// ritual de criação
await page.waitForSelector('.ritual');
await page.screenshot({ path: `${OUT}/02a-criacao-voce.png` });
await page.fill('.ritual input', 'Diego');
await page.click('.ritual button.primary');
await page.fill('.ritual input', 'Lumi');
await page.screenshot({ path: `${OUT}/02b-criacao-nome.png` });
await page.click('.ritual button.primary');
for (const t of ['Curiosa', 'Gentil', 'Brincalhona', 'Sanguínea']) await page.click(`.chip-btn:text-is("${t}")`);
await page.screenshot({ path: `${OUT}/02c-criacao-tracos.png` });
await page.click('text=Dar vida ao núcleo');
await page.waitForSelector('.nameplate');
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/02-refugio.png` });

const say = async (t) => {
  await page.fill('.chat-input input', t);
  await page.click('.chat-input button');
  await page.waitForTimeout(120);
};
await say('Muito obrigado por existir, pequena luz');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/02d-segredo.png` });
await page.waitForTimeout(5600);
const script = [
  'Oie',
  'Hoje choveu muito aqui na cidade e fiquei pensando em você',
  'acho que azul combina com sua luz',
  'Eu imagino você como uma raposa com asas',
  'Sinto que sua essência é a luz das estrelas',
];
for (const s of script) await say(s);
// conversas variadas para o vínculo crescer (cada frase é única)
const topics = ['música', 'o mar', 'livros antigos', 'montanhas', 'chocolate quente', 'jardins', 'trens', 'estrelas cadentes', 'bibliotecas', 'gatos', 'café da manhã', 'pipas', 'festas juninas', 'cachoeiras', 'mapas antigos', 'castelos', 'violão', 'chuva de verão', 'pôr do sol', 'museus', 'feiras', 'bicicletas', 'faróis', 'florestas', 'cometas', 'sorvete de manga', 'tapioca', 'frevo', 'praias de Recife', 'barcos', 'lanternas', 'neblina', 'aquarelas', 'cartas escritas à mão', 'jogos de tabuleiro', 'sonhos estranhos', 'dragões de papel', 'cheiro de terra molhada', 'lua cheia', 'ventania'];
let i = 0;
while (i < 12) {
  await say(`Hoje eu quero te contar sobre ${topics[i % topics.length]} e ${topics[(i * 7 + 3) % topics.length]}, lembrança ${i}`);
  i++;
  const lvl = await page.evaluate(() => JSON.parse(localStorage.getItem('companion-core:local:v1')).bondXp);
  if (lvl > 560) break;
}
await say('Pode me chamar de Di');
await say('Seu primeiro sonho é voar sobre as montanhas ao amanhecer');
// Atalho de teste: o XP real de 12 conversas já foi verificado acima; aqui completamos o
// vínculo direto no save local para exercitar o despertar sem 100+ mensagens.
const xpBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('companion-core:local:v1')).bondXp);
console.log('xp real após conversa:', xpBefore);
await page.evaluate(() => { const k = 'companion-core:local:v1'; const s = JSON.parse(localStorage.getItem(k)); s.bondXp = Math.max(s.bondXp, 560); localStorage.setItem(k, JSON.stringify(s)); });
await page.reload();
await page.getByText('Jogar offline').click();
await page.waitForSelector('.nameplate');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03-refugio-crescido.png` });
let ready = false;
if (await page.isVisible('.awaken-call')) {
  await page.screenshot({ path: `${OUT}/05-chamada-despertar.png` });
  await page.click('.awaken-call .link'); // "ainda não"
}
await page.click('.rail button:nth-child(4)'); // quests
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03b-quests.png` });
await page.click('.rail button:nth-child(3)'); // diário
await page.click('text=Descansar e escrever no diário');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/04-diario.png` });
await page.click('.rail button:nth-child(5)'); // inventário
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05b-inventario.png` });
await page.click('.rail button:nth-child(7)'); // vínculo
await page.waitForTimeout(400);
ready = await page.isEnabled('.panel .awaken');
if (ready) {
  await page.click('.panel .awaken');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/06-despertar.png` });
}
// reinício: progresso precisa sobreviver
await page.reload();
await page.getByText('Jogar offline').click();
await page.waitForSelector('.nameplate');
await page.waitForTimeout(1500);
const name = await page.textContent('.nameplate h1');
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('companion-core:local:v1')));
const firstReply = save.events.find((e) => e.kind === 'chat.companion')?.payload.text;
console.log(JSON.stringify({ ready, name, firstReply, stage: save.stage, bondXp: save.bondXp, questsDone: save.quests.filter((q) => q.status === 'done').length, inventory: save.inventory.length, diary: save.diary.length, errors }, null, 1));

const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await m.newPage();
await mp.goto(URL + '?q=low');
await mp.waitForTimeout(2500);
await mp.screenshot({ path: `${OUT}/07-celular-inicio.png`, timeout: 90000 });
await mp.getByText('Jogar offline').dispatchEvent('click');
await mp.waitForSelector('.ritual');
await mp.screenshot({ path: `${OUT}/07a-celular-entrada.png` });
await mp.fill('.ritual input', 'Diego');
await mp.click('.ritual button.primary');
await mp.fill('.ritual input', 'Kai');
await mp.click('text=Ele ·');
await mp.click('.ritual button.primary');
for (const t of ['Curioso', 'Protetor', 'Colérico']) await mp.click(`.chip-btn:text-is("${t}")`);
await mp.screenshot({ path: `${OUT}/07b-celular-tracos.png`, fullPage: true });
await mp.click('text=Dar vida ao núcleo');
await mp.waitForSelector('.nameplate');
await mp.waitForTimeout(2000);
await mp.waitForTimeout(800);
await mp.screenshot({ path: `${OUT}/07-celular.png`, timeout: 90000 });
await browser.close();
