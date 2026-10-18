'use strict';
const $ = id => document.getElementById(id);
const CONTACTS = 'rubrica.contacts.v1', AUTH = 'rubrica.auth.v1';
let contacts = [], selected = null, unlocked = false, ready = false, config = null;
function notice(text) { $('status').textContent = text; }
function initialize() {
  try {
    const probe = 'rubrica.storage.test'; localStorage.setItem(probe,'ok'); localStorage.removeItem(probe);
    const raw = localStorage.getItem(AUTH); config = raw ? JSON.parse(raw) : null;
    if (config && (!/^[a-f0-9]{32}$/.test(config.salt) || !/^[a-f0-9]{64}$/.test(config.hash))) throw Error('Configurazione password non valida.');
    $('confirm-label').classList.toggle('hidden', Boolean(config));
    $('confirm').required = !config;
    $('auth-title').textContent = config ? 'Bentornato!' : 'Scegli la tua password';
    $('auth-button').textContent = config ? 'Accedi' : 'Crea password e accedi';
    if (!crypto.subtle) throw Error('Apri la rubrica tramite un link HTTPS per usare la password.');
    ready = true;
  } catch (e) { $('auth-error').textContent = 'Accesso non disponibile: ' + e.message + ' I dati esistenti non sono stati modificati.'; $('auth-button').disabled = true; }
}
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bytes = Uint8Array.from(salt.match(/../g), part => parseInt(part,16));
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', salt:bytes, iterations:600000, hash:'SHA-256'}, key,256)));
}
function validate(data) {
  if (!Array.isArray(data) || data.length > 10000) throw Error('Il backup deve contenere una lista di massimo 10.000 contatti.');
  return data.map(c => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw Error('Contatto non valido.');
    const result = {};
    for (const [key,max] of [['nome',200],['telefono',100],['email',250]]) {
      const v = c[key] ?? ''; if (typeof v !== 'string' || v.length > max) throw Error('Campo non valido nel backup.'); result[key] = v;
    }
    if (!result.nome.trim() || !result.telefono.trim()) throw Error('Nome e telefono sono obbligatori.');
    return result;
  });
}
$('auth-form').addEventListener('submit', async e => {
  e.preventDefault(); if (!ready) return;
  $('auth-error').textContent=''; $('auth-button').disabled=true;
  try {
    const password = $('password').value;
    if (!password) throw Error('Inserisci la password.');
    if (!config && password !== $('confirm').value) throw Error('Le password non coincidono.');
    const salt = config ? config.salt : hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derive(password,salt);
    if (config && hash !== config.hash) throw Error('Password non corretta.');
    const raw = localStorage.getItem(CONTACTS); const loaded = raw ? validate(JSON.parse(raw)) : [];
    if (!config) { const created = {salt,hash}; localStorage.setItem(AUTH,JSON.stringify(created)); config=created; }
    contacts=loaded; unlocked=true; $('auth-form').reset(); $('login').classList.add('hidden'); $('app').classList.remove('hidden'); render(); $('name').focus();
  } catch(e) { $('auth-error').textContent=e.message; }
  finally { $('auth-button').disabled=false; }
});
$('show-password').addEventListener('change', () => { for(const id of ['password','confirm']) $(id).type=$('show-password').checked?'text':'password'; });
function save(next) {
  if (!unlocked) return false;
  try { localStorage.setItem(CONTACTS,JSON.stringify(next)); contacts=next; return true; }
  catch(e) { alert('Salvataggio non riuscito. Esporta un backup prima di chiudere.'); return false; }
}
function clear() { selected=null; $('contact-form').reset(); $('editor-title').textContent='Nuovo contatto'; $('update').disabled=true; $('delete').disabled=true; }
function render() {
  const query=$('search').value.trim().toLocaleLowerCase('it'); const rows=$('rows'); rows.replaceChildren(); let found=0;
  contacts.forEach((c,i) => {
    if (!`${c.nome} ${c.telefono} ${c.email}`.toLocaleLowerCase('it').includes(query)) return;
    found++; const tr=document.createElement('tr'); if(selected===i) tr.classList.add('selected');
    tr.tabIndex=0; tr.setAttribute('aria-label','Seleziona '+c.nome);
    for(const value of [i+1,c.nome,c.telefono,c.email]) { const td=document.createElement('td'); td.textContent=value; tr.append(td); }
    const choose=()=>{ selected=i; $('name').value=c.nome; $('phone').value=c.telefono; $('email').value=c.email; $('editor-title').textContent='Modifica contatto'; $('update').disabled=false; $('delete').disabled=false; render(); };
    tr.addEventListener('click',choose); tr.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();choose();}}); rows.append(tr);
  });
  if(!found){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.className='empty';td.textContent=query?'Nessun contatto trovato.':'La tua rubrica è pronta. Aggiungi il primo contatto!';tr.append(td);rows.append(tr);}
  $('count').textContent=`${found} visualizzati · ${contacts.length} contatti totali`;
}
function fields() { if(!$('contact-form').reportValidity()) return null; const c={nome:$('name').value.trim(),telefono:$('phone').value.trim(),email:$('email').value.trim()}; if(!c.nome||!c.telefono){alert('Inserisci nome e telefono.');return null;} return c; }
$('contact-form').addEventListener('submit',e=>{e.preventDefault();const c=fields();if(!c)return;if(save([...contacts,c])){clear();render();notice('Nuovo contatto salvato.');}});
$('update').addEventListener('click',()=>{if(selected===null)return;const c=fields();if(!c)return;const next=contacts.slice();next[selected]=c;if(save(next)){clear();render();notice('Modifiche salvate.');}});
$('clear').addEventListener('click',()=>{clear();render();$('name').focus();});
$('delete').addEventListener('click',()=>{if(selected===null||!confirm(`Vuoi eliminare «${contacts[selected].nome}»?`))return;if(save(contacts.filter((_,i)=>i!==selected))){clear();render();notice('Contatto eliminato.');}});
$('search').addEventListener('input',()=>{clear();render();});
$('show-all').addEventListener('click',()=>{$('search').value='';clear();render();});
$('export').addEventListener('click',()=>{if(!unlocked)return;const url=URL.createObjectURL(new Blob([JSON.stringify(contacts,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`rubrica-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);notice('Backup esportato: conservalo in un posto sicuro.');});
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5000000)throw Error('File troppo grande (massimo 5 MB).');const loaded=validate(JSON.parse(await file.text()));if(!confirm(`Aggiungere ${loaded.length} contatti alla rubrica? Gli esistenti restano; eventuali duplicati saranno aggiunti.`))return;if(save([...contacts,...loaded])){clear();$('search').value='';render();notice('Backup importato.');}}catch(e){alert('Importazione non riuscita: '+e.message);}finally{$('import-file').value='';}});
$('lock').addEventListener('click',()=>{unlocked=false;contacts=[];clear();$('rows').replaceChildren();$('count').textContent='';$('search').value='';notice('');$('app').classList.add('hidden');$('login').classList.remove('hidden');initialize();$('password').focus();});
window.addEventListener('storage',e=>{if(unlocked&&(e.key===CONTACTS||e.key===AUTH||e.key===null)){location.reload();}});
initialize();
if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
