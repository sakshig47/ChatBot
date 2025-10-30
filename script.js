const socket = io();
let myId = 1;
let currentConversationId = null;
let currentContactId = null;

function debugLog(...args) {
  // shows logs both in console and optionally in page (for easier debugging)
  console.log(...args);
}

// Register function (joins socket.io room for this user)
function registerSocketForUser(userId) {
  if (!userId) return;
  socket.emit('register', userId);
  debugLog('socket: register emitted for user', userId);
}

// Load contacts when user clicks Load
document.getElementById('loadContacts').addEventListener('click', async () => {
  myId = parseInt(document.getElementById('myId').value, 10);
  if (!myId) return alert('Enter your user id (e.g., 1)');
  registerSocketForUser(myId);
  await loadContacts();
});

// Also register socket on page load using default myId (so socket rooms exist)
window.addEventListener('load', () => {
  myId = parseInt(document.getElementById('myId').value, 10) || 1;
  registerSocketForUser(myId);
});

// Fetch contacts from server
async function loadContacts() {
  const res = await fetch('/contacts/' + myId);
  if (!res.ok) {
    debugLog('Failed to load contacts', res.status);
    return;
  }
  const contacts = await res.json();
  const ul = document.getElementById('contactsList');
  ul.innerHTML = '';
  contacts.forEach(c => {
    const li = document.createElement('li');
    li.textContent = `${c.name} (id:${c.id})`;
    li.dataset.userid = c.id;
    li.addEventListener('click', () => startChatWith(c));
    ul.appendChild(li);
  });
  debugLog('Contacts loaded for', myId, contacts);
}

async function startChatWith(contact) {
  currentContactId = contact.id;
  document.getElementById('chatHeader').textContent = contact.name;
  // get or create conversation id
  const res = await fetch(`/conversation/${myId}/${contact.id}`);
  const data = await res.json();
  currentConversationId = data.conversationId;
  debugLog('Open conversation', currentConversationId, 'with', contact.id);
  await loadMessages(currentConversationId);
}

async function loadMessages(convId) {
  if (!convId) return;
  const res = await fetch('/messages/' + convId);
  if (!res.ok) {
    debugLog('Failed to load messages', res.status);
    return;
  }
  const msgs = await res.json();
  const container = document.getElementById('messages');
  container.innerHTML = '';
  msgs.forEach(addMessage);
  container.scrollTop = container.scrollHeight;
  debugLog('Messages loaded for conv', convId, msgs.length);
}

function addMessage(m) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  const senderIsMe = m.sender_id === myId;
  div.className = 'message ' + (senderIsMe ? 'me' : 'other');
  div.innerHTML = `<div><strong>${m.sender_name}</strong></div>
                   <div>${m.text}</div>
                   <div style="font-size:10px;color:#666">${new Date(m.created_at).toLocaleString()}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Send message
document.getElementById('msgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = document.getElementById('msgInput').value.trim();
  if (!text) return;
  if (!currentConversationId || !currentContactId) return alert('Open a contact to chat with first.');
  // clear input immediately
  document.getElementById('msgInput').value = '';
  const payload = {
    conversation_id: currentConversationId,
    sender_id: myId,
    recipient_id: currentContactId,
    text
  };
  try {
    const res = await fetch('/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      debugLog('Message POST failed', res.status);
      const err = await res.json().catch(()=>({}));
      alert('Failed to send message: ' + (err.error || res.status));
    } else {
      // do nothing — server will emit and the socket listener will append the message
      debugLog('Message POST ok, waiting for socket emit');
    }
  } catch (err) {
    debugLog('Send message error', err);
    alert('Network error when sending message.');
  }
});

// Handle incoming socket messages
socket.on('message', (m) => {
  debugLog('Socket message received', m);
  // If message contains conversation_id, check it
  if (m && m.conversation_id) {
    if (+m.conversation_id === +currentConversationId) {
      addMessage(m);
      return;
    } else {
      // message for another conversation — you could show a badge for unread count
      debugLog('Incoming message for another conversation', m.conversation_id);
      return;
    }
  }

  // Fallback: if message sender is currentContactId, reload messages
  if (m && (m.sender_id === currentContactId || m.sender_id === myId)) {
    if (currentConversationId) loadMessages(currentConversationId);
  }
});
