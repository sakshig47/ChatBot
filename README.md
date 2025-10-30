How to Use

1. Open two browser windows (or normal + incognito mode).

2. Go to http://localhost:3000 in both.

3. In the first window:
   Enter Your ID = 1 → Click Load.
   Click on Bob (id:2) in contacts.

4. In the second window:
   Enter Your ID = 2 → Click Load.
   Click on Alice (id:1) in contacts.

5. Start chatting! Messages appear instantly in both windows.

How It Works

1. When a user logs in, their socket is registered with a unique room (user_<id>).

2. On sending a message:
   The server inserts it into the messages table.
   Then emits the message to both sender and receiver’s rooms.

3. On receiving a message, the client automatically updates the chat window.   
