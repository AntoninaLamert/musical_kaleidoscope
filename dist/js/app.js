import { MusicSignal } from './audio-analysis.js';
import { AudioPlayer } from './audio-player.js';
import { Visualizer } from './visualizer.js';
import { SHAPES } from './shapes.js';
import { RhythmClock } from './rhythm-clock.js';
import { ShowDirector } from './director.js';
import { ShowRecorder } from './show-recorder.js';

const $ = selector => document.querySelector(selector);
const signal = new MusicSignal();
const player = new AudioPlayer(signal);
const rhythm = new RhythmClock(signal);
let visualizer;
let director,recorder;
let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}
function showKaleidoState({style,auto}) {
  for(const button of document.querySelectorAll('[data-style]'))button.setAttribute('aria-pressed',String(Number(button.dataset.style)===style));
  $('#kaleido-auto').setAttribute('aria-pressed',String(auto));
}
try {
  visualizer = new Visualizer($('#scene'), quality => { $('#quality').textContent = quality + ' КАЧЕСТВО'; },showKaleidoState);
} catch (error) {
  console.error(error);
  $('#scene-error').hidden = false;
  $('#scene-error').textContent = 'Не удалось запустить 3D-сцену. Включите аппаратное ускорение и WebGL в настройках браузера. Музыкальный проигрыватель остаётся доступен.';
}

function showShape(name){
  for(const button of document.querySelectorAll('[data-shape]'))button.setAttribute('aria-pressed',String(button.dataset.shape===name));
  $('#shape-name').textContent=SHAPES[name].toUpperCase();
}
if(visualizer){
  director=new ShowDirector(visualizer,showShape);
  let recordLabel='',recordUiState='';
  recorder=new ShowRecorder(visualizer,player,(active,seconds,paused)=>{
    const state=active+'/'+paused+'/'+Math.floor(seconds)+'/'+!!recorder?.stopping;
    if(state===recordUiState)return;recordUiState=state;
    const label=(paused?'ПАУЗА ':'● ')+Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
    if(label!==recordLabel){$('#record-status').textContent=label;recordLabel=label;}
    $('#record-status').hidden=!active;$('#record-stop').hidden=!active;
    $('#record-start').disabled=active||!!recorder?.stopping;
  },(url,name,mime)=>{
    const video=$('#record-preview');video.src=url;
    $('#record-download').href=url;$('#record-download').download=name;
    $('#record-format').textContent=mime.includes('mp4')?'Видео со звуком · MP4':'Видео со звуком · WebM';
    if(!document.body.classList.contains('meditation'))$('#record-result').showModal();else $('#record-result').dataset.pending='true';
  },toast);
}
for(const button of document.querySelectorAll('[data-style]'))button.addEventListener('click',()=>{director?.setAuto(false);visualizer?.kaleidoscope.select(Number(button.dataset.style));});
$('#kaleido-auto').addEventListener('click',()=>{if(visualizer)director?.setAuto(!visualizer.kaleidoscope.autoMode);});
$('#kaleido-symmetry').addEventListener('input',event=>{
  const value=Number(event.target.value);$('#symmetry-value').value=value;visualizer?.kaleidoscope.setSymmetry(value);
});
$('#kaleido-intensity').addEventListener('input',event=>{
  const value=Number(event.target.value);$('#intensity-value').value=value+'%';visualizer?.kaleidoscope.setIntensity(value/100);
});

for (const button of document.querySelectorAll('[data-shape]')) button.addEventListener('click', () => {
  director?.setAuto(false);if(director)director.shape=button.dataset.shape;
  showShape(button.dataset.shape);
  visualizer?.setShape(button.dataset.shape);
  $('#shape-name').textContent = SHAPES[button.dataset.shape].toUpperCase();
});

$('#artist-toggle').addEventListener('click',()=>{
  if(!visualizer)return;const enabled=!visualizer.artist.enabled;visualizer.artist.setEnabled(enabled);
  document.body.classList.toggle('artist-mode',enabled);$('#artist-toggle').setAttribute('aria-pressed',String(enabled));$('#artist-tools').hidden=!enabled;
});
$('#brush-color').addEventListener('input',e=>{if(visualizer)visualizer.artist.color=e.target.value;});
$('#brush-width').addEventListener('input',e=>{if(visualizer)visualizer.artist.width=Number(e.target.value);$('#brush-value').textContent=e.target.value;});
$('#artist-clear').addEventListener('click',()=>visualizer?.artist.clear());
$('#record-start').addEventListener('click',()=>recorder?.start());
$('#record-stop').addEventListener('click',()=>recorder?.stop());
$('#record-close').addEventListener('click',()=>{$('#record-preview').pause();$('#record-result').close();});
$('#record-result').addEventListener('close',()=>$('#record-preview').pause());
let revealTimer;
function setMeditation(hidden){
  document.body.classList.toggle('meditation',hidden);document.body.classList.remove('reveal-ui');
  if(hidden){togglePlaylist(false);$('#record-result').close();$('#toast').hidden=true;}
  else if($('#record-result').dataset.pending){delete $('#record-result').dataset.pending;$('#record-result').showModal();}
}
$('#hide-panels').addEventListener('click',()=>setMeditation(true));
$('#show-panels').addEventListener('click',()=>setMeditation(false));
document.addEventListener('pointermove',e=>{
  if(!document.body.classList.contains('meditation')||e.clientY>55)return;
  document.body.classList.add('reveal-ui');clearTimeout(revealTimer);revealTimer=setTimeout(()=>document.body.classList.remove('reveal-ui'),2200);
});
$('#reveal-zone').addEventListener('pointerdown',()=>document.body.classList.add('reveal-ui'));

const bars = Array.from({ length: 24 }, () => {
  const bar = document.createElement('i'); $('#spectrum').append(bar); return bar;
});
let listSignature = '';
function renderPlayer() {
  const hasTracks = player.tracks.length > 0;
  $('#play').disabled = !hasTracks || (player.busy && !player.playing);
  $('#previous').disabled = $('#next').disabled = !hasTracks || player.busy || !!player.fade;
  $('#seek').disabled = !player.duration || player.busy;
  $('#play').setAttribute('aria-label', player.playing ? 'Пауза' : 'Воспроизвести');
  $('#play-icon').innerHTML = player.playing ? '<path d="M7 5h4v14H7zm7 0h4v14h-4Z"/>' : '<path d="m9 5 11 7-11 7Z"/>';
  $('#playlist-count').textContent = player.tracks.length;
  $('#track-count').textContent = hasTracks ? `ТРЕК ${String(player.index + 1).padStart(2,'0')} / ${String(player.tracks.length).padStart(2,'0')}` : 'ВАША МУЗЫКА';
  if (hasTracks) {
    $('#track-title').textContent = player.tracks[player.index].name;
    $('#track-title').title = player.tracks[player.index].name;
    $('#track-subtitle').textContent = player.preparing ? 'Анализ ритма композиции…' : player.busy ? 'Подготовка звука…' : !player.playing ? 'Пауза · нажмите воспроизведение' : player.fade ? 'Плавный переход между треками' : 'Сейчас звучит · бесконечный плейлист';
  }
  const signature = `${player.tracks.length}:${player.index}`;
  if (signature !== listSignature) {
    listSignature = signature;
    $('#track-list').replaceChildren();
    player.tracks.forEach((track, index) => {
      const li = document.createElement('li'), button = document.createElement('button');
      const number = document.createElement('span'), name = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0'); name.textContent = track.name;
      button.append(number, name); button.setAttribute('aria-current', String(index === player.index));
      button.title = track.name;
      button.addEventListener('click', () => { if (player.fade) toast('Переход завершится через пару секунд.'); else player.select(index); });
      li.append(button); $('#track-list').append(li);
    });
  }
  $('#playlist-empty').hidden = hasTracks;
}
player.addEventListener('change', renderPlayer);
player.addEventListener('error', event => toast(event.detail));
$('#play').addEventListener('click', () => player.toggle());
$('#previous').addEventListener('click', () => player.previous());
$('#next').addEventListener('click', () => player.next());
$('#volume').addEventListener('input', event => player.setVolume(Number(event.target.value)));
let seeking = false;
$('#seek').addEventListener('input', () => { seeking = true; });
$('#seek').addEventListener('change', event => { player.seek(Number(event.target.value) / 1000); seeking = false; });
$('#upload').addEventListener('click', () => $('#files').click());
const addFiles = files => {
  const count = player.add(files);
  if (count) toast(`Добавлено треков: ${count}. Нажмите ▶, чтобы увидеть музыку.`);
};
$('#files').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
function togglePlaylist(open) { $('#playlist').hidden = !open; $('#playlist-toggle').setAttribute('aria-expanded', String(open)); }
$('#playlist-toggle').addEventListener('click', () => togglePlaylist($('#playlist').hidden));
$('#close-playlist').addEventListener('click', () => togglePlaylist(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape'){togglePlaylist(false);setMeditation(false);}
  const editing=document.activeElement.matches('textarea,input[type=text],input[type=search],[contenteditable=true]');
  if(event.code==='KeyH'&&!editing){event.preventDefault();setMeditation(!document.body.classList.contains('meditation'));}
  if (event.code === 'Space' && !['INPUT','BUTTON','A'].includes(document.activeElement.tagName)) { event.preventDefault(); player.toggle(); }
});
document.addEventListener('fullscreenchange',()=>{
  $('#fullscreen').textContent=document.fullscreenElement?'Выйти из экрана':'На весь экран';
  // Some browsers consume Escape while leaving fullscreen before keydown can
  // reach the page. Restore the hidden controls in that case as well.
  if(!document.fullscreenElement&&document.body.classList.contains('meditation'))setMeditation(false);
});
$('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('Полный экран недоступен в этом окне браузера.'); }
});
let dragDepth = 0;
document.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth++; $('#drop-overlay').hidden = false; } });
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
document.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; $('#drop-overlay').hidden = true; addFiles(event.dataTransfer.files); });
window.addEventListener('blur', () => { dragDepth = 0; $('#drop-overlay').hidden = true; });

const formatTime = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
let previousTime = performance.now(), uiElapsed = 0, stopped = false;
document.addEventListener('visibilitychange', () => { previousTime = performance.now();if(document.hidden&&recorder?.active){recorder.stop();toast('Запись завершена при скрытии вкладки. Видео готово к сохранению.');} });
function frame(now) {
  if(stopped)return;
  const rawDt = (now - previousTime) / 1000;
  const dt = Math.min(.05, rawDt);
  previousTime = now;
  player.update();
  rhythm.update(player.rhythmSource());
  const music = signal.step(dt, player.playing);
  if (!document.hidden&&visualizer){
    visualizer.show=director.update(Math.min(rawDt,.25),music);
    visualizer.update(dt,music,rawDt);recorder.capture(now);
  }
  uiElapsed += dt;
  if (uiElapsed > .08) {
    uiElapsed = 0;
    bars.forEach((bar, i) => { bar.style.transform = `scaleY(${Math.max(.035, signal.spectrum[i])})`; });
    $('#bpm').textContent = music.active && music.bpm ? music.bpm : '—';
    $('#analysis-status').textContent = music.active ? music.bpm ? 'Ритм синхронизирован' : 'Импульсы по атакам баса' : 'В ожидании музыки';
    $('#elapsed').textContent = formatTime(player.time);
    $('#duration').textContent = formatTime(player.duration);
    $('#seek').disabled = !player.duration || player.busy;
    if (!seeking) $('#seek').value = player.duration ? player.time / player.duration * 1000 : 0;
  }
  requestAnimationFrame(frame);
}
renderPlayer();
requestAnimationFrame(frame);
// Background playback must advance even when the browser suspends rendering.
const backgroundTimer = setInterval(() => { if (document.hidden) player.update(); }, 200);
window.addEventListener('pagehide', event => { if (!event.persisted) { stopped=true; clearInterval(backgroundTimer);recorder?.dispose(); player.dispose(); visualizer?.dispose(); } });
