const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const PORT = 3000;
const DB_CONFIG = {
  host: "localhost",
  user: "root",
  password: "",
  database: "chatdb",
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let pool;
(async function initDB() {
  pool = await mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
  console.log("✅ MySQL connected");
})();

app.get("/contacts/:userId", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name FROM users WHERE id != ?", [req.params.userId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/conversation/:userA/:userB", async (req, res) => {
  const { userA, userB } = req.params;
  try {
    const [rows] = await pool.query(
      "SELECT id FROM conversations WHERE (user1=? AND user2=?) OR (user1=? AND user2=?)",
      [userA, userB, userB, userA]
    );
    let conversationId;
    if (rows.length) {
      conversationId = rows[0].id;
    } else {
      const [r] = await pool.query("INSERT INTO conversations (user1,user2) VALUES (?,?)", [userA, userB]);
      conversationId = r.insertId;
    }
    res.json({ conversationId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/messages/:conversationId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT m.id,m.sender_id,m.text,m.created_at,u.name as sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE conversation_id=? ORDER BY m.created_at ASC",
      [req.params.conversationId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/message", async (req, res) => {
  const { conversation_id, sender_id, recipient_id, text } = req.body;
  if (!conversation_id || !sender_id || !recipient_id || !text) return res.status(400).json({ error: "Missing fields" });
  try {
    const [r] = await pool.query(
      "INSERT INTO messages (conversation_id,sender_id,text) VALUES (?,?,?)",
      [conversation_id, sender_id, text]
    );
    const [rows] = await pool.query(
      "SELECT m.id,m.sender_id,m.text,m.created_at,u.name as sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.id=?",
      [r.insertId]
    );
    const message = rows[0];
    io.to("user_" + sender_id).emit("message", message);
    io.to("user_" + recipient_id).emit("message", message);
    res.json(message);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

io.on("connection", (socket) => {
  console.log("🟢 Socket connected", socket.id);
  socket.on("register", (userId) => socket.join("user_" + userId));
  socket.on("disconnect", () => console.log("🔴 Socket disconnected", socket.id));
});

server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
