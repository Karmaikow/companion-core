import { initFormArt } from './modules/form-art.js';
import { manifestationStatus } from './modules/manifestation-rules.js';
import { bindAndroidShell } from './modules/android-shell.js';
import { mode } from './modules/runtime-mode.js';
import { AccessGate } from './modules/access-gate.js';
import { bindHudEffects } from './modules/hud-effects.js';
import { api } from './modules/api.js';
import { GameViewport } from './modules/game-viewport.js';
import { PanelManager } from './modules/panel-manager.js';
import { FloatingChat } from './modules/floating-chat.js';
import { preferences } from './modules/preferences.js';

let currentState = null;
let activeDrawer = null;
let chatBusy = false;
let viewport;
let floatingChat;
let previousFocus;
let initialized = false, accessEpoch = 0;
let pairingTimer;
let formPreviewActive = false, chatWasMinimized = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const normalized = value.length === 3 ? value.split('').map(x => x + x).join('') : value;
  const number = Number.parseInt(normalized, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255
  };
}

function mixWithWhite({ r, g, b }, amount = .32) {
  const mix = c => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function applyTheme(hex, persist = true) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) hex = '#3f8cff';
  const rgb = hexToRgb(hex);
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  root.style.setProperty('--accent-soft', mixWithWhite(rgb));
  $('#customTheme').value = hex;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
  if (persist) preferences.set(currentState ? `companion-theme-${currentState.identity.id}` : 'mayuna-theme', hex);
  viewport?.setTheme(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
}

function renderHotbars() {
  const symbols = ['✦', '◇', '◈', '⌁', '✧', '◆', '○', '△', '□', '◎'];
  const keys = ['1','2','3','4','5','6','7','8','9','0'];
  const markup = keys.map((key, index) => `<button class="hotkey" data-hotkey="${key}" title="Slot reservado · ver skills" aria-label="Slot ${key}: ver skills em formação"><small>${key}</small><b>${symbols[index]}</b></button>`).join('');
  $('#hotbar').innerHTML = markup;
  $('#mobileHotbar').innerHTML = markup;
}

function renderInventory(items = []) {
  const slots = 24;
  const symbols = ['◈','✦','◇','◆','⌁','✧'];
  $('#inventoryGrid').innerHTML = Array.from({ length: slots }, (_, index) => {
    const item = items[index];
    return `<div class="inventory-slot ${item ? 'is-filled' : ''}" title="${escapeHtml(item ?? 'Slot vazio')}">${item ? symbols[index % symbols.length] : ''}</div>`;
  }).join('');
}

function renderPersonality(personality) {
  const labels = {
    loyalty: 'Lealdade', curiosity: 'Curiosidade', humor: 'Humor', courage: 'Coragem', empathy: 'Empatia', autonomy: 'Autonomia'
  };
  $('#personalityBars').innerHTML = Object.entries(labels).map(([key, label]) => {
    const value = clamp(Number(personality?.[key] ?? 0), 0, 100);
    return `<div class="personality-row"><span>${label}</span><div class="mini-meter"><i style="width:${value}%"></i></div><b>${value}</b></div>`;
  }).join('');
}

function renderMemories(memories = []) {
  const list = $('#memoryList');
  if (!memories.length) {
    list.innerHTML = '<p class="muted">Sua Companion ainda não possui memórias registradas.</p>';
    return;
  }

  const companion = currentState?.identity?.name ?? 'Companion';
  const person = currentState?.profile?.companionOf?.name ?? 'Você';
  const groups = [
    { title: `Sobre ${person}`, test: memory => memory.title.toLocaleLowerCase('pt-BR').includes(person.toLocaleLowerCase('pt-BR')) },
    { title: `Sobre ${companion}`, test: memory => memory.title.toLocaleLowerCase('pt-BR').includes(companion.toLocaleLowerCase('pt-BR')) },
    { title: 'História compartilhada', test: () => true }
  ];
  const remaining = new Set(memories);
  list.innerHTML = groups.map(group => {
    const entries = memories.slice().reverse().filter(memory => remaining.has(memory) && group.test(memory));
    entries.forEach(memory => remaining.delete(memory));
    if (!entries.length) return '';
    const cards = entries.map(memory => {
      const date = new Date(memory.timestamp);
      const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
      const legacyPrefix = `${person} gosta de `;
      const legacyLike = memory.title.toLocaleLowerCase('pt-BR').startsWith(legacyPrefix.toLocaleLowerCase('pt-BR'));
      const legacyValue = legacyLike ? memory.title.slice(legacyPrefix.length).split(/\b(?:tbm|tamb[eé]m)\b|[,!?]/i)[0]?.trim() : '';
      const title = legacyValue ? `${person} gosta de ${legacyValue}` : memory.title;
      const content = legacyValue && legacyLike && memory.title.slice(legacyPrefix.length) !== legacyValue
        ? `${person} comentou que gosta de ${legacyValue}.`
        : memory.content;
      return `<article class="memory-card"><header><strong>${escapeHtml(title)}</strong><small>${escapeHtml(memory.type)} · ${dateText}</small></header><p>${escapeHtml(content)}</p></article>`;
    }).join('');
    return `<section class="memory-group"><h3>${escapeHtml(group.title)}</h3>${cards}</section>`;
  }).join('');
}

function renderQuests(state) {
  $('#questList').innerHTML=(state.quests||[]).map(q=>`<article class="memory-card"><strong>${escapeHtml(q.title)} · +${q.xp} XP</strong><p>${escapeHtml(q.description)}</p><p>${q.current}/${q.target} · ${q.claimed?'Recompensa recebida':q.ready?'Pronta para receber':'Em andamento'}</p>${q.claimed?'':`<button type="button" class="secondary-button full" data-quest-prompt="${escapeHtml(q.id)}">Continuar com a Companion</button><button type="button" class="primary-button full" data-quest-claim="${escapeHtml(q.id)}" ${q.ready?'':'disabled'}>Receber ${q.xp} XP</button>`}</article>`).join('');
}
function renderEvolution(state) {
  renderQuests(state);
  const status = state.manifestation || manifestationStatus(state);
  $('#evolutionTitle').textContent = status.next?.title || 'Sua forma continua crescendo';
  $('#evolutionCopy').textContent = status.hasBody ? `Forma ${status.generation ?? 1}. Novos ciclos desenvolvem sua história sem uma forma final. A arte anterior continua até você aplicar a próxima.` : 'A alma ganha sua primeira forma quando todos os requisitos abaixo forem atendidos. As escolhas são da Companion, não do usuário.';
  $('#evolutionRequirements').innerHTML = (status.next?.requirements || []).map(r => `<div class="evolution-requirement"><div><span>${r.current >= r.target ? '✓ ' : '○ '}${escapeHtml(r.label)}</span><strong>${escapeHtml(`${Math.min(r.current,r.target)} / ${r.target}`)}</strong></div><progress max="${r.target}" value="${Math.min(r.current,r.target)}" aria-label="${escapeHtml(r.label)}"></progress>${r.detail ? `<small>${escapeHtml(r.detail)}</small>` : ''}</div>`).join('');
  $('#evolutionPreview').hidden = status.hasBody;
  $('#formInfluences').textContent = state.profile.appearance?.formInfluences?.length ? 'Sementes da forma: ' + state.profile.appearance.formInfluences.join(', ') + '.' : 'Uma forma única começa na sua identidade e mantém a cor da alma.';
  $('#formRendererNotice').hidden = !!state.artwork;
}

function stopFormPreview() {
  if(formPreviewActive) { viewport?.setFormPreview(false);floatingChat?.setMinimized(chatWasMinimized); }
  formPreviewActive=false;document.body.classList.remove('is-form-preview');$('#formPreviewBanner').hidden=true;
}

function showFormPreview() {
  if(!currentState || currentState.core.evolutionStage!=='SOUL') return;
  closeDrawer();setViewMode('refugio');
  chatWasMinimized=$('#panel-chat').classList.contains('is-chat-minimized');floatingChat?.setMinimized(true);
  formPreviewActive=true;document.body.classList.add('is-form-preview');viewport?.setFormPreview(true);$('#formPreviewBanner').hidden=false;
  $('#formRendererNotice').hidden=!!currentState.artwork;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function applyState(state) {
  if(currentState?.identity.id===state.identity.id&&state.meta?.eventCount<currentState.meta?.eventCount)return;
  const changed=currentState?.identity.id!==state.identity.id;
  currentState = state;
  window.dispatchEvent(new CustomEvent('companion:state',{detail:{id:state.identity.id,generation:state.core.formGeneration ?? ({SOUL:0,AWAKENED:1,MANIFESTED:2,ASCENDED:3}[state.core.evolutionStage])}}));
  if(changed) $('#questStatus').textContent='';
  if(changed) applyTheme(preferences.get(`companion-theme-${state.identity.id}`) || '#3f8cff',false);
  if(changed || state.core.evolutionStage!=='SOUL') stopFormPreview();
  viewport?.setState(state);
  renderEvolution(state);
  document.title = `Companion Core · ${state.identity.name}`;
  $('.brand-copy small').textContent = `${state.identity.name} · SUA COMPANION`;
  $('#panel-companion .drawer-header h2').textContent = state.identity.name;
  $('#panel-chat .chat-identity h2').textContent = state.identity.name;
  $('#panel-chat').setAttribute('aria-label', `Conversa com ${state.identity.name}`);
  $('#chatInput').setAttribute('aria-label', `Mensagem para ${state.identity.name}`);
  $('#chatInput').placeholder = `Fale com ${state.identity.name}...`;
  $('#panel-skills .drawer-header h2').textContent = `Skills de ${state.identity.name}`;
  $('#panel-memories .drawer-header h2').textContent = `Memórias de ${state.identity.name}`;
  $('#panel-memories .drawer-content h3:last-of-type').textContent = `Diário de ${state.identity.name}`;
  const companionMenu = $('[data-open-panel="companion"] span'); if (companionMenu) companionMenu.textContent = state.identity.name;
  const entityTarget = $('.entity-target'); if (entityTarget) entityTarget.setAttribute('aria-label', `Fazer carinho em ${state.identity.name}`);
  const companionButton = $('[data-open-panel="chat"]'); if (companionButton) { companionButton.setAttribute('aria-label', `Falar com ${state.identity.name}`); companionButton.textContent = `Falar com ${state.identity.name}`; }
  const companionName = $('[data-open-panel="companion-summary"]'); if (companionName) companionName.setAttribute('aria-label', `Inspecionar ${state.identity.name}`);
  const welcome = $('.chat-welcome'); if (welcome) welcome.textContent = `Sou ${state.identity.name}, sua Companion. ${state.core.evolutionStage === "SOUL" ? "Ainda sou uma alma, e minha forma vai se desenvolver com nossas experiências. " : ""}Estamos no Refúgio, nosso espaço em um mundo de fantasia ainda em construção. Conte algo de que gosta ou pergunte sobre mim para começarmos.`;
  $('#entityName').textContent = state.identity.name;
  $('#entityStage').textContent = state.core.evolutionStage;
  $('#worldProvider').textContent = state.meta.provider === 'mock' ? 'PRÉVIA · IA SIMULADA' : state.meta.provider === 'openai' ? 'CORE LOCAL · IA ONLINE' : 'CORE LOCAL · OLLAMA';
  $('#combatXpText').textContent = `${state.combat.xp} / ${state.combat.xpToNextLevel}`;
  $('#combatXpBar').style.width = `${clamp(state.combat.xp / state.combat.xpToNextLevel * 100, 0, 100)}%`;
  $('#journalList').innerHTML = state.journal.slice().reverse().map(entry => `<article class="memory-card"><header><strong>${escapeHtml(entry.title)}</strong></header><p>${escapeHtml(entry.content)}</p></article>`).join('') || '<p class="muted">O diário aguarda novos capítulos.</p>';
  const corePercent = state.core.xpToNextLevel > 0 ? (state.core.xp / state.core.xpToNextLevel) * 100 : 0;
  const bondPercent = Math.min((state.bond.value / 100) * 100, 100);

  $('#companionName').textContent = state.identity.name;
  $('#stageLabel').textContent = state.core.evolutionStage;
  $('#relationshipLabel').textContent = state.bond.relationship;
  $('#coreLevel').textContent = state.core.level;
  $('#coreXpText').textContent = `${state.core.xp} / ${state.core.xpToNextLevel}`;
  $('#coreXpBar').style.width = `${clamp(corePercent, 0, 100)}%`;
  $('#bondText').textContent = state.bond.value;
  $('#bondBar').style.width = `${clamp(bondPercent, 0, 100)}%`;
  $('#combatLevel').textContent = state.combat.level;
  $('#memoryCount').textContent = state.memories.length;
  $('#eventCount').textContent = state.meta.eventCount;
  $('#snapshotCount').textContent = state.meta.snapshotCount;
  $('#identityShort').textContent = state.identity.id.replace('MC-', '').slice(0, 8);

  $('#mobileName').textContent = state.identity.name;
  $('#mobileStage').textContent = state.core.evolutionStage;
  $('#mobileCore').textContent = `Lv. ${state.core.level}`;

  $('#drawerStage').textContent = state.core.evolutionStage;
  $('#drawerCore').textContent = state.core.level;
  $('#drawerBond').textContent = state.bond.value;
  $('#drawerCombat').textContent = state.combat.level;

  renderInventory(state.inventory);
  renderPersonality(state.personality);
  renderMemories(state.memories);
  setViewMode($('#appShell').dataset.viewMode, false);
}

function setConnection(status, text) {
  const dot = $('#statusDot');
  dot.classList.remove('is-online', 'is-error');
  if (status === 'online') dot.classList.add('is-online');
  if (status === 'error') dot.classList.add('is-error');
  $$('.world-system-state .status-dot, .mobile-status .status-dot').forEach(el => { el.classList.toggle('is-online', status === 'online'); el.classList.toggle('is-error', status === 'error'); });
  if (mode === 'demo') text = 'Prévia · sem Core';
  $('#connectionLabel').textContent = text;
  $('#worldConnection').textContent = text;
  viewport?.setPresence(status === 'online' ? 'idle' : 'offline');
}

function setViewMode(view, persist = true) {
  const selected = view === 'world' ? 'world' : 'refugio';
  const app = $('#appShell');
  app.dataset.viewMode = selected;
  $$('[data-view-mode]').forEach(button => {
    const active = button.dataset.viewMode === selected;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const world = selected === 'world';
  $('#worldProvider').textContent = world ? 'COMPANION WORLD' : 'REFÚGIO';
  $('#roomName').textContent = world ? 'Companion World' : `Refúgio de ${currentState?.identity?.name || 'Companion'}`;
  $('#roomCoordinate').textContent = world ? 'MUNDO EXTERNO · EM DESENVOLVIMENTO' : 'ESPAÇO PRIVADO';
  $('#roomEyebrow').textContent = world ? 'COMPANION WORLD' : 'NOSSA HISTÓRIA';
  $('#roomHeading').textContent = world ? 'O mundo aguarda' : 'Um espaço nosso';
  $('#roomDescription').textContent = world
    ? 'A interface de batalha está separada do Refúgio e será expandida com o mundo externo.'
    : `Converse, lembre e evolua ao lado de ${currentState?.identity?.name || 'sua Companion'}.`;
  $('#roomFooter').textContent = world ? 'Exploração e batalhas' : 'Refúgio da Companion';
  $('#roomFootnote').textContent = world
    ? 'Área de combate em preparação.'
    : 'Um lugar para conversa, memórias e evolução.';
  if (persist) preferences.set('mayuna-view-mode', selected);
  if (world) closeDrawer();
  requestAnimationFrame(() => floatingChat?.refreshPosition());
}

async function loadState() {
  setConnection('loading', 'Conectando');
  try {
    const state = await api.state();
    applyState(state);
    setConnection('online', 'Core ativo');
  } catch (error) {
    setConnection('error', 'Core indisponível');
    console.error(error);
    throw error;
  }
}

function openDrawer(name) {
  if (name === 'chat') {
    setViewMode('refugio');
    closeDrawer();
    floatingChat?.setMinimized(false);
    $('#chatInput').focus({ preventScroll: true });
    return;
  }
  const drawer = document.querySelector(`[data-drawer="${name}"]`);
  if (!drawer) return;

  previousFocus = document.activeElement;
  closeDrawer(false);
  activeDrawer = drawer;
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.inert = false;
  $('#overlay').hidden = false;
  requestAnimationFrame(() => {
    (name === 'chat' ? $('#chatInput') : drawer.querySelector('button'))?.focus();
  });
}

function closeDrawer(hideOverlay = true) {
  if (activeDrawer) {
    activeDrawer.classList.remove('is-open');
    activeDrawer.setAttribute('aria-hidden', 'true');
    activeDrawer.inert = true;
    activeDrawer = null;
  }
  if (hideOverlay) { $('#overlay').hidden = true; previousFocus?.focus(); }
}

function appendChat(role, text, extraClass = '') {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role} ${extraClass}`.trim();
  bubble.innerHTML = `<small>${escapeHtml(role === 'user' ? currentState?.profile?.companionOf?.preferredAddress || 'Você' : currentState?.identity?.name || 'Companion')}</small><p></p>`;
  bubble.querySelector('p').textContent = text;
  $('#chatFeed').appendChild(bubble);
  $('#chatFeed').scrollTop = $('#chatFeed').scrollHeight;
  return bubble;
}

async function sendChat(message) {
  if (chatBusy || !message.trim()) return;
  const epoch = accessEpoch;
  chatBusy = true;
  viewport?.setPresence('thinking');
  $('#chatPresence').textContent = `${currentState?.identity?.name || 'Sua Companion'} está respondendo`;
  const submit = $('#chatForm button[type="submit"]');
  submit.disabled = true;
  $('.chat-welcome')?.remove();
  appendChat('user', message.trim());
  const thinking = appendChat('companion', '...', 'thinking');

  try {
    const result = await api.chat(message.trim());
    if (epoch !== accessEpoch) return;
    thinking.remove();
    appendChat('companion', result.response);
    if (result.state) applyState(result.state);
  } catch (error) {
    if (epoch !== accessEpoch) return;
    thinking.remove();
    appendChat('companion', `Não consegui responder agora. ${error.message}`, 'error');
    if (!$('#chatInput').value) $('#chatInput').value = message;
  } finally {
    chatBusy = false;
    viewport?.setPresence('idle');
    $('#chatPresence').textContent = 'Pronta para conversar';
    submit.disabled = false;
    if (!document.body.classList.contains('is-locked')) $('#chatInput').focus();
  }
}

async function verifyCore(target = '#verifyResult') {
  const element = $(target);
  if (element) element.textContent = 'Verificando...';
  try {
    const result = await api.verify();
    if (element) element.textContent = result.valid ? `✓ ${result.reason}` : `⚠ ${result.reason}`;
    if (!element && result.reason) alert(result.reason);
  } catch (error) {
    if (element) element.textContent = `Falha: ${error.message}`;
  }
}

function bindUi() {
  $$('[data-open-panel]').forEach(button => button.addEventListener('click', () => openDrawer(button.dataset.openPanel)));
  $$('[data-view-mode]').forEach(button => button.addEventListener('click', () => setViewMode(button.dataset.viewMode)));
  $$('[data-close-drawer]').forEach(button => button.addEventListener('click', () => closeDrawer()));
  $('#overlay').addEventListener('click', () => closeDrawer());
  $$('[data-action="focus-refuge"]').forEach(button => button.addEventListener('click', () => { closeDrawer(); setViewMode('refugio'); }));

  $('#chatForm').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('#chatInput');
    const message = input.value;
    if (chatBusy || !message.trim()) return;
    input.value = '';
    input.style.height = 'auto';
    void sendChat(message);
  });

  $('#chatInput').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('#chatForm').requestSubmit();
    }
  });

  $('#chatInput').addEventListener('input', event => {
    event.currentTarget.style.height = 'auto';
    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 130)}px`;
  });

  $$('.theme-swatch').forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.theme)));
  $('#customTheme').addEventListener('input', event => applyTheme(event.target.value));

  $('#evolutionPreview').addEventListener('click',showFormPreview);
  $('#leaveFormPreview').addEventListener('click',()=>{stopFormPreview();$('#evolutionPreview').focus({preventScroll:true});});
  $('#verifyButton').addEventListener('click', () => void verifyCore());
  $('#mobileVerify').addEventListener('click', async () => {
    const result = await api.verify().catch(error => ({ valid: false, reason: error.message }));
    alert(result.reason);
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeDrawer(); return; }
    if (activeDrawer && matchMedia('(max-width: 920px)').matches && event.key === 'Tab') {
      const items = [...activeDrawer.querySelectorAll('button:not(:disabled), input, textarea, select, [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (activeDrawer) return;
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
    if (/^[0-9]$/.test(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey) {
      openDrawer('skills');
      $$(`[data-hotkey="${event.key}"]`).forEach(el => {
        el.classList.add('is-pressed');
        setTimeout(() => el.classList.remove('is-pressed'), 160);
      });
    }

  });
}


function init() {
  bindHudEffects();
  renderHotbars();
  bindUi();
  setViewMode(preferences.get('mayuna-view-mode') || 'refugio', false);
  const setImmersive = value => {
    $('#appShell').classList.toggle('hud-immersive', value);
    $('#immersiveToggle').setAttribute('aria-pressed', String(value));
    $('#immersiveToggle').setAttribute('aria-label', value ? 'Restaurar HUD lateral' : 'Expandir mundo');
    preferences.set('mayuna-immersive', String(value));
  };
  setImmersive(preferences.get('mayuna-immersive') === 'true');
  $('#immersiveToggle').addEventListener('click', () => setImmersive(!$('#appShell').classList.contains('hud-immersive')));
  const style = preferences.get('mayuna-ui-style-v3');
  const applyStyle = value => {
    const valid = ['astral', 'sanctuary', 'obsidian', 'minimal'].includes(value) ? value : 'astral';
    document.documentElement.dataset.uiStyle = valid;
    $('#interfaceStyle').value = valid;
    preferences.set('mayuna-ui-style-v3', valid);
  };
  applyStyle(style);
  $('#interfaceStyle').addEventListener('change', event => applyStyle(event.target.value));
  $$('.drawer-panel').forEach(el => { el.inert = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', el.querySelector('h2').textContent); });
  new PanelManager(document.querySelector('.desktop-layout'));
  floatingChat = new FloatingChat($('#panel-chat'), $('#worldFrame'));
  viewport = new GameViewport(document.querySelector('#gameRenderer'));
  const savedTheme = preferences.get('mayuna-theme');
  applyTheme(!savedTheme || savedTheme.toLowerCase() === '#7657ff' ? '#3f8cff' : savedTheme, false);
  viewport.mount();
  let questBusy=false;
  $('#questList').addEventListener('click',async event=>{
    const prompt=event.target.closest('[data-quest-prompt]');
    if(prompt){const quest=currentState?.quests?.find(q=>q.id===prompt.dataset.questPrompt);if(quest){openDrawer('chat');$('#chatInput').value=quest.prompt;$('#chatInput').focus();}return;}
    const button=event.target.closest('[data-quest-claim]');if(!button||questBusy||!currentState)return;
    questBusy=true;button.disabled=true;const id=currentState.identity.id,epoch=accessEpoch;
    try{const result=await api.claimQuest(id,button.dataset.questClaim);if(epoch!==accessEpoch||currentState?.identity.id!==id)return;applyState(result.state);$('#questStatus').textContent=`Missão concluída! +${result.xp} XP do Core.`;}
    catch(error){if(epoch===accessEpoch){$('#questStatus').textContent=error.message;renderQuests(currentState);}}
    finally{questBusy=false;}
  });
  let affectionBusy=false;
  document.querySelector('#gameRenderer').addEventListener('companion:affection',async event=>{
    if(affectionBusy||chatBusy||!currentState||event.detail.id!==currentState.identity.id)return;
    affectionBusy=true;
    try {
      const result=await api.affection(event.detail.id);
      if(currentState?.identity.id!==event.detail.id)return;
      applyState(result.state);
      if(result.awarded)viewport.react('bond');
      else $('#entityPresence').textContent=result.remaining===0?'Carinho recebido · cota de vínculo de hoje concluída':'Carinho recebido · vínculo disponível a cada minuto';
    } catch(error){if(currentState?.identity.id===event.detail.id)$('#entityPresence').textContent=error.message;}
    finally{affectionBusy=false;}
  });
  window.addEventListener('pagehide', () => viewport.destroy(), { once: true });
  $$('.skill-slot, .gear-slot').forEach(button => { button.addEventListener('click', () => openDrawer(button.classList.contains('gear-slot') ? 'inventory' : 'skills')); });
  $$('[data-hotkey]').forEach(button => button.addEventListener('click', () => openDrawer('skills')));
  $('#retryConnection').addEventListener('click', () => void loadState().catch(() => {}));
  const pairingButton = $('#makeRemotePairCode');
  if (mode !== 'local') $('#localPairing').hidden = true;
  else {
    void api.pairingStatus().then(status => {
      if (!status.enabled) {
        $('#pairingDescription').textContent = 'Para habilitar, inicie o Core com MAYUNA_REMOTE_ORIGIN definido para a origem HTTPS exata desta interface.';
        pairingButton.disabled = true;
        pairingButton.textContent = 'Conexão online não configurada';
      }
    }).catch(error => { $('#pairingStatus').textContent = error.message; });
    pairingButton.addEventListener('click', async () => {
      pairingButton.disabled = true; $('#pairingStatus').textContent = 'Gerando código…';
      try {
        const pair = await api.createPairingCode();
        window.clearTimeout(pairingTimer);
        $('#pairingCode').textContent = pair.code;
        $('#pairingExpiry').textContent = `Válido até ${new Date(pair.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · uso único`;
        $('#pairingCodeDisplay').hidden = false; $('#pairingStatus').textContent = 'Digite este código na interface online.';
        pairingTimer = window.setTimeout(() => { $('#pairingCodeDisplay').hidden = true; $('#pairingStatus').textContent = 'Código expirado. Gere outro quando precisar.'; }, Math.max(0, Date.parse(pair.expiresAt) - Date.now()));
      } catch (error) { $('#pairingStatus').textContent = error.message; }
      finally { pairingButton.disabled = false; }
    });
  }
}
const access = new AccessGate(async () => {
  if (!initialized) { init(); initialized = true; }
  await loadState(); viewport.resume();
}, () => {
  stopFormPreview();
  accessEpoch++;
  if (initialized) {
    closeDrawer(); viewport.pause(); currentState = null;
    $('#chatFeed').replaceChildren();
    const welcome = document.createElement('p'); welcome.className = 'muted chat-welcome'; welcome.textContent = `Estou aqui, ${currentState?.profile?.companionOf?.preferredAddress || 'com você'}. O que vamos descobrir hoje?`; $('#chatFeed').append(welcome);
    $('#chatInput').value = '';
    $('#memoryList').replaceChildren(); $('#journalList').replaceChildren();
    $('#chatPresence').textContent = 'Pronta para conversar';

  }
});
bindAndroidShell(() => closeDrawer());
document.querySelector('#gameRenderer').addEventListener('companion-art-status',()=>{if(currentState)$('#formRendererNotice').hidden=document.querySelector('#gameRenderer').dataset.bodyRenderer==='sprite2d';});
initFormArt(applyState);
void access.start();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Optional agent-facing navigation uses exactly the same visible UI actions.
if (mode === 'demo' && document.modelContext?.registerTool) {
 const lifecycle = new AbortController();
 try { Promise.resolve(document.modelContext.registerTool({
  name:'open_mayuna_panel',title:'Abrir painel da interface',description:'Abre um painel da prévia; não modifica Core ou dados.',
  inputSchema:{type:'object',properties:{panel:{type:'string',enum:['companion','inventory','skills','memories','chat','settings']}},required:['panel'],additionalProperties:false},
  annotations:{readOnlyHint:false,untrustedContentHint:false},
  execute(input){if(!input || !['companion','inventory','skills','memories','chat','settings'].includes(input.panel))throw Error('Painel inválido');if(!initialized||document.body.classList.contains('is-locked'))throw Error('Entre na prévia primeiro');openDrawer(input.panel);return {opened:input.panel};}
 },{signal:lifecycle.signal})).catch(()=>{}); }catch{}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
