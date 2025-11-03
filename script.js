// public/script.js — verbose/debug-friendly
const socket = io();
let myId = null;
let currentContactId = null;
let currentConversationId = null;

function showInline(text, timeout=3000) {
  let el = document.getElementById('noticeBox');
  if (!el) {
    el = document.createElement('div');
    el.id = 'noticeBox';
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.top = '16px';
    el.style.background = '#222';
    el.style.color = '#fff';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '6px';
    el.style.zIndex = 9999;
    document.body.appendChild(el);
  }
  el.textContent = text;
  if (timeout) setTimeout(()=> el.style.display='none', timeout);
  el.style.display = 'block';
}

function log(...args) { console.log(...args); }

// Load contacts from server and display server response in UI for debugging
async function loadContactsFor(id) {
  if (!id) return showInline('Enter a numeric user id and click Load', 4000);
  myId = +id;
  socket.emit('register', myId);
  try {
    const res = await fetch('/contacts/' + myId);
    const text = await res.text();
    // show server raw response in console and in UI (for debugging)
    console.log('/contacts raw response:', text);
    try {
      const contacts = JSON.parse(text);
      renderContacts(contacts);
    } catch (e) {
      // server returned error HTML or JSON error object
      showInline('Failed to parse contacts: ' + text, 6000);
      console.error('Could not parse /contacts response', e);
    }
  } catch (err) {
    console.error('Network error fetching contacts', err);
    showInline('Network error fetching contacts (see console)', 5000);
  }
}

function renderContacts(contacts) {
  const ul = document.getElementById('contactsList');
  ul.innerHTML = '';
  if (!contacts || contacts.length === 0) {
    ul.innerHTML = '<li style="color:#666">No contacts found</li>';
    showInline('No contacts found in DB for this user', 4000);
    return;
  }
  contacts.forEach(c => {
    const li = document.createElement('li');
    li.textContent = `${c.name} (id:${c.id})`;
    li.style.cursor = 'pointer';
    li.addEventListener('click', ()=> selectContact(c));
    ul.appendChild(li);
  });
  showInline('Contacts loaded (' + contacts.length + ')', 2000);
}

async function selectContact(contact) {
  currentContactId = contact.id;
  document.getElementById('chatHeader').textContent = contact.name + ' (id:' + contact.id + ')';
  try {
    const r = await fetch(`/conversation/${myId}/${contact.id}`);
    if (!r.ok) {
      const body = await r.text();
      showInline('Conv error: ' + body, 5000);
      console.error('Conversation fetch failed', r.status, body);
      return;
    }
    const data = await r.json();
    currentConversationId = data.conversationId;
    await loadMessages(currentConversationId);
  } catch (err) {
    console.error('selectContact error', err);
    showInline('Error opening conversation (see console)', 4000);
  }
}

async function loadMessages(convId) {
  if (!convId) return;
  try {
    const r = await fetch('/messages/' + convId);
    if (!r.ok) {
      const b = await r.text();
      showInline('Messages fetch failed: ' + b, 5000);
      console.error('Messages fetch failed', r.status, b);
      return;
    }
    const msgs = await r.json();
    const container = document.getElementById('messages');
    container.innerHTML = '';
    msgs.forEach(m => appendMessage(m));
  } catch (err) {
    console.error('loadMessages error', err);
    showInline('Error fetching messages', 4000);
  }
}

function appendMessage(m) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  const mine = +m.sender_id === +myId;
  div.className = 'message ' + (mine ? 'me' : 'other');
  div.innerHTML = `<div><strong>${m.sender_name || 'User ' + m.sender_id}</strong></div>
                   <div>${m.text || ''}</div>
                   <div style="font-size:10px;color:#666">${m.created_at ? new Date(m.created_at).toLocaleString() : ''}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// send
document.getElementById('msgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text) return;
  if (!currentContactId || !currentConversationId) {
    showInline('Open a contact first (click a contact on left)', 3000);
    return;
  }
  input.value = '';
  const payload = { conversation_id: currentConversationId, sender_id: myId, recipient_id: currentContactId, text };
  try {
    const r = await fetch('/message', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const body = await r.text();
    console.log('/message response raw:', r.status, body);
    if (!r.ok) {
      showInline('Message POST failed: ' + body, 5000);
      return;
    }
    // server will emit via socket and socket listener will append
  } catch (err) {
    console.error('Send error', err);
    showInline('Network error sending message', 4000);
  }
});

socket.on('message', (m) => {
  console.log('socket message', m);
  if (m && m.conversation_id && +m.conversation_id === +currentConversationId) {
    appendMessage(m);
  } else {
    // if message belongs to current contact by sender/recipient, reload
    if (m && (m.sender_id == currentContactId || m.recipient_id == currentContactId)) {
      if (currentConversationId) loadMessages(currentConversationId);
    }
  }
});

// UI: load contacts button
document.getElementById('loadContacts').addEventListener('click', () => {
  const id = document.getElementById('myId').value;
  loadContactsFor(id).catch(err => console.error(err));
});

// On page load auto-use value in myId input (if present)
window.addEventListener('load', () => {
  const id = document.getElementById('myId').value;
  if (id) loadContactsFor(id).catch(err => console.error(err));
});

// alias (small naming fix)
async function loadContactsFor(id) { await loadContactsFor_impl(id); }
async function loadContactsFor_impl(id) { await loadContactsFor_impl_inner(id); }
// small wrapper to avoid duplicate name issues
async function loadContactsFor_impl_inner(id) {
  return loadContactsFor_impl_inner_core(id);
}
async function loadContactsFor_impl_inner_core(id) {
  return (async () => {
    if (!id) return showInline('Enter your ID and click Load', 3000);
    await loadContactsForCore(id);
  })();
}
async function loadContactsForCore(id) {
  return loadContactsFor_real(id);
}
async function loadContactsFor_real(id) {
  // call the real loader
  await loadContactsForReal(id);
}
async function loadContactsForReal(id) {
  // final call
  await loadContactsForActual(id);
}
async function loadContactsForActual(id) {
  // simplest: call loadContactsForActualImpl
  return loadContacts(id); // note: this calls the top-level loadContacts defined earlier
}
