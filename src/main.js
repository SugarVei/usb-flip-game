import { Game, seededRandom } from './engine.js';
import { DeskScene } from './scene.js';
import { Leaderboard } from './leaderboard.js';
import { Tutorial } from './tutorial.js';
const $ = s => document.querySelector(s), game = new Game();
const leaderboard = new Leaderboard();
const tutorial = new Tutorial();
let starting = false, boardReturn = null, boardResume = false;
const wideLayout = matchMedia('(min-width: 1180px)');
let tutorialReturn = null, tutorialResume = false;
let desk, audio, muted = false, modal = null, lastTime = performance.now(), samples = [], frameCount = 0, previousFocus;
try { muted = localStorage.getItem('usb-desk-muted') === 'true'; } catch {}
const icons = {
  sound: '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 5v14m6-14v14"/></svg>'
};
$('#pause-btn').innerHTML = icons.pause;
function updateSound() { $('#sound-btn').innerHTML = muted ? icons.muted : icons.sound; $('#sound-btn').setAttribute('aria-label', muted ? '开启音效' : '关闭音效'); $('#sound-btn').setAttribute('aria-pressed', String(!muted)); }
updateSound();
function unlockAudio() { try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch {} }
function tone(frequency, delay, duration, volume = .035, type = 'sine') {
  if (muted || !audio || audio.state !== 'running') return;
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(frequency, t); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(volume, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + duration);
  o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + duration + .02);
}
function sound(type) {
  if (type === 'move') tone(270, 0, .07, .015);
  if (type === 'flip') { tone(350, 0, .11, .02); tone(510, .07, .12, .015); }
  if (type === 'success') { tone(420, 0, .09, .035, 'triangle'); tone(680, .08, .15); }
  if (type === 'fail') { tone(90, 0, .19, .045, 'triangle'); tone(60, .08, .22, .03, 'triangle'); }
  if (type === 'land') tone(110, 0, .08, .012, 'triangle');
}
function showModal(id) {
  previousFocus = document.activeElement; modal = id; $('#modal-backdrop').hidden = false;
  for (const e of document.querySelectorAll('.modal:not(.docked)')) e.hidden = e.id !== id;
  $('#rank-host').inert = true; $('#tutorial-host').inert = true;
  requestAnimationFrame(() => { if (modal === id) $(`#${id} input:not(:disabled), #${id} button:not(:disabled)`)?.focus({ preventScroll: true }); });
}
function hideModal() { modal = null; $('#modal-backdrop').hidden = true; for (const e of document.querySelectorAll('.modal:not(.docked)')) e.hidden = true; $('#rank-host').inert = false; $('#tutorial-host').inert = false; previousFocus?.blur?.(); }
async function start() {
  if (starting) return; starting = true; hideModal(); game.start(); game.togglePause(true);
  if (!leaderboard.nickname) { starting = false; $('#loading').hidden = true; $('#pause-btn').disabled = true; showModal('nickname-modal'); updateUI(); return; }
  $('#loading').hidden = false; $('#loading').style.opacity = '1'; $('#pause-btn').disabled = true; $('#leaderboard-btn').disabled = true; updateUI();
  try { const seed = await leaderboard.newRun(); game.random = seededRandom(seed); game.start(); lastTime = performance.now(); $('#pause-btn').disabled = false; }
  catch (error) { $('#connection-status').textContent = error.name === 'TimeoutError' ? '连接超时，请稍后重试' : error.message; showModal('connection-modal'); }
  finally { starting = false; $('#leaderboard-btn').disabled = false; $('#loading').hidden = true; updateUI(); }
}
function pause() {
  if (starting || (modal && modal !== 'pause-modal')) return;
  if (!['running', 'crash'].includes(game.status)) return;
  game.togglePause(); if (game.paused) showModal('pause-modal'); else hideModal();
}
function autoPause() { if (['running', 'crash'].includes(game.status) && !game.paused) pause(); }
function flip() { if (game.toggleFlip()) { $('#flip-btn').classList.remove('spinning'); void $('#flip-btn').offsetWidth; $('#flip-btn').classList.add('spinning'); } }
$('#left-btn').addEventListener('click', () => game.move(-1)); $('#right-btn').addEventListener('click', () => game.move(1)); $('#flip-btn').addEventListener('click', flip);
$('#restart-btn').addEventListener('click', start); $('#pause-restart-btn').addEventListener('click', start);
$('#pause-btn').addEventListener('click', pause); $('#resume-btn').addEventListener('click', pause);
$('#retry-connection-btn').addEventListener('click', start);
$('#nickname-form').addEventListener('submit', event => { event.preventDefault(); try { leaderboard.setNickname($('#nickname').value); $('#nickname-status').textContent = ''; start(); } catch (error) { $('#nickname-status').textContent = error.message; $('#nickname').focus(); } });
function openBoard() { if (wideLayout.matches) { hideModal(); $('#board-panel').focus({ preventScroll: true }); leaderboard.load(); return; } boardReturn = modal; boardResume = ['running', 'crash'].includes(game.status) && !game.paused; if (boardResume) game.togglePause(true); showModal('leaderboard-modal'); leaderboard.load(); }
function closeBoard() { if (boardReturn) showModal(boardReturn); else { hideModal(); if (boardResume) game.togglePause(false); } }
$('#leaderboard-btn').addEventListener('click', openBoard); $('#result-board-btn').addEventListener('click', openBoard);
$('#close-board-btn').addEventListener('click', closeBoard);
$('#challenge-btn').addEventListener('click', () => { if (game.status === 'over' || boardReturn === 'connection-modal') start(); else { hideModal(); game.togglePause(false); } });
function closeTutorial() { if (tutorialReturn) showModal(tutorialReturn); else { hideModal(); if (tutorialResume) game.togglePause(false); } }
$('#tutorial-btn').addEventListener('click', () => { tutorialReturn = modal; tutorialResume = ['running', 'crash'].includes(game.status) && !game.paused; if (tutorialResume) game.togglePause(true); showModal('tutorial-modal'); tutorial.started = performance.now() / 1000; });
$('#close-tutorial-btn').addEventListener('click', closeTutorial);
function syncPanels() {
  if (wideLayout.matches && modal === 'leaderboard-modal') closeBoard();
  if (wideLayout.matches && modal === 'tutorial-modal') closeTutorial();
  for (const [id, host] of [['leaderboard-modal', 'rank-host'], ['tutorial-modal', 'tutorial-host']]) {
    const panel = $(`#${id}`); panel.classList.toggle('docked', wideLayout.matches);
    if (wideLayout.matches) { $(`#${host}`).append(panel); panel.hidden = false; panel.setAttribute('role', 'region'); panel.removeAttribute('aria-modal'); }
    else { $('#modal-backdrop').append(panel); panel.hidden = modal !== id; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); }
  }
}
wideLayout.addEventListener('change', syncPanels); syncPanels();
$('#sound-btn').addEventListener('click', () => { unlockAudio(); muted = !muted; try { localStorage.setItem('usb-desk-muted', String(muted)); } catch {} updateSound(); if (!muted) tone(480, 0, .1); });
document.addEventListener('pointerdown', unlockAudio, { once: true });
// Activate completed touch taps without relying on a synthetic click after a swipe.
let touchButton = null, lastTouchButton = null, lastTouchTime = -1000;
document.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { const b = e.target.closest?.('button'); touchButton = b && !b.disabled ? { b, id: e.pointerId, x: e.clientX, y: e.clientY } : null; } }, true);
document.addEventListener('pointerup', e => {
  const t = touchButton; touchButton = null;
  if (!t || e.pointerId !== t.id || e.pointerType !== 'touch' || t.b.disabled || e.target.closest?.('button') !== t.b || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 18) return;
  e.preventDefault(); lastTouchButton = t.b; lastTouchTime = performance.now(); t.b.click();
}, true);
document.addEventListener('pointercancel', () => { touchButton = null; }, true);
document.addEventListener('click', e => { if (e.isTrusted && e.detail > 0 && e.target.closest?.('button') === lastTouchButton && performance.now() - lastTouchTime < 600) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
document.addEventListener('keydown', e => {
  if (e.code === 'Tab' && modal) {
    const buttons = [...document.querySelectorAll(`#${modal} button:not(:disabled), #${modal} input:not(:disabled), #${modal} [tabindex="0"]`)].filter(e => e.getClientRects().length), first = buttons[0], last = buttons.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } return;
  }
  if (e.code === 'Escape' && modal === 'leaderboard-modal') { e.preventDefault(); closeBoard(); return; }
  if (e.code === 'Escape' && modal === 'tutorial-modal') { e.preventDefault(); closeTutorial(); return; }
  if (e.target instanceof HTMLInputElement) return;
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { if (!modal || modal === 'pause-modal') { e.preventDefault(); pause(); } return; }
  if (e.code === 'KeyM' && !e.repeat) { e.preventDefault(); $('#sound-btn').click(); return; }
  if (modal) return;
  if (e.target.closest?.('#rank-host, #tutorial-host')) return;
  if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); unlockAudio(); }
  if (['ArrowLeft', 'KeyA'].includes(e.code)) game.move(-1);
  if (['ArrowRight', 'KeyD'].includes(e.code)) game.move(1);
  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code) && !e.repeat) flip();
});
let pointer = null;
$('#scene').addEventListener('pointerdown', e => { if (e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; $('#scene').setPointerCapture(e.pointerId); });
$('#scene').addEventListener('pointermove', e => {
  if (!pointer || pointer.id !== e.pointerId) return;
  const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y, threshold = Math.max(32, Math.min(innerWidth * .08, 70));
  if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * .7) { game.move(Math.sign(dx)); pointer.x = e.clientX; pointer.y = e.clientY; }
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#scene').addEventListener(t, () => { pointer = null; });
window.addEventListener('blur', autoPause); document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
document.addEventListener('usb-context-lost', () => { autoPause(); $('#resume-btn').disabled = true; });
document.addEventListener('usb-context-restored', () => { $('#resume-btn').disabled = false; });
let displayedScore = -1;
function updateUI() {
  if (game.cleared !== displayedScore) { displayedScore = game.cleared; $('#score').textContent = String(game.cleared).padStart(2, '0'); $('#score').setAttribute('aria-label', `已通过${game.cleared}台电脑`); }
  const disabled = !game.canControl(); for (const id of ['left-btn', 'right-btn', 'flip-btn']) $(`#${id}`).disabled = disabled;
}
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, .1); lastTime = now; game.update(dt);
  for (const e of game.drainEvents()) {
    sound(e.type);
    if (e.type === 'fail') { if (navigator.vibrate) navigator.vibrate(45); }
    if (e.type === 'over') { $('#result-score').textContent = String(game.cleared).padStart(2, '0'); $('#pause-btn').disabled = true; leaderboard.finish(game); showModal('result-modal'); }
  }
  updateUI(); desk?.update(game); tutorial.update(now / 1000);
  if (frameCount++ > 30 && dt > 0 && !document.hidden && !game.paused && game.status === 'running') { samples.push(dt * 1000); if (samples.length > 600) samples.shift(); }
  requestAnimationFrame(frame);
}
try {
  desk = new DeskScene($('#scene')); start(); desk.update(game);
  requestAnimationFrame(frame);
} catch (error) { console.error(error); $('#loading').textContent = '请使用支持 WebGL 2 的浏览器打开'; }
if (new URLSearchParams(location.search).has('qa')) Object.defineProperty(window, '__USB_GAME__', { value: {
  snapshot: () => game.snapshot(),
  metrics: () => ({ ...desk?.metrics(), frameSamples: samples.length, medianFrameMs: samples.length ? [...samples].sort((a,b) => a-b)[Math.floor(samples.length/2)] : null, viewport: [innerWidth, innerHeight] })
} });
