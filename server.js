// server.js — safer startup and clearer logs
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mysql = require("mysql2/promise");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root",
  database: process.env.DB_NAME || "chatdb",
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let pool = null;

// Initialize DB and only then start the server
async function initDbAndStart() {
  try {
    console.log("Connecting to MySQL with:", {
      host: DB_CONFIG.host,
      user: DB_CONFIG.user,
      database: DB_CONFIG.database,
    });
    pool = await mysql.createPool({
      ...DB_CONFIG,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    // quick test query
    const [r] = await pool.query("SELECT 1 + 1 AS ok");
    if (!r || r.length === 0) throw new Error("DB test query failed");
    console.log("✅ MySQL pool created and tested");

    // start listening AFTER pool ready
    server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  } catch (err) {
    console.error("Failed to initialize DB:", err);
    process.exit(1);
  }
}

// Middleware to ensure pool exists
app.use((req, res, next) => {
  if (!pool) return res.status(503).json({ error: "DB not ready, try again shortly" });
  next();
});

// Simple test route
app.get("/", (req, res) => {
  res.send("✅ Chat server is running!");
});

// Contacts route
app.get("/contacts/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const [rows] = await pool.query("SELECT id, name FROM users WHERE id != ?", [userId]);
    res.json(rows);
  } catch (err) {
    console.error("GET /contacts error:", err);
    res.status(500).json({ error: "DB error", details: err.message });
  }
});

// Conversation route
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
  } catch (err) {
    console.error("GET /conversation error:", err);
    res.status(500).json({ error: "DB error", details: err.message });
  }
});

// Messages route
app.get("/messages/:conversationId", async (req, res) => {
  try {
    const convoId = req.params.conversationId;
    const [rows] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.text, m.created_at, u.name as sender_name
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE conversation_id = ? ORDER BY m.created_at ASC`,
      [convoId]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /messages error:", err);
    res.status(500).json({ error: "DB error", details: err.message });
  }
});

// Post a message
app.post("/message", async (req, res) => {
  const { conversation_id, sender_id, recipient_id, text } = req.body || {};
  if (!conversation_id || !sender_id || !recipient_id || !text) {
    return res.status(400).json({ error: "Missing fields", received: req.body });
  }
  try {
    const [r] = await pool.query(
      "INSERT INTO messages (conversation_id, sender_id, text) VALUES (?, ?, ?)",
      [conversation_id, sender_id, text]
    );
    const [rows] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.text, m.created_at, u.name AS sender_name
       FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?`,
      [r.insertId]
    );
    const message = rows[0];
    console.log("Saved message:", message);
    io.to("user_" + sender_id).emit("message", message);
    io.to("user_" + recipient_id).emit("message", message);
    res.json(message);
  } catch (err) {
    console.error("POST /message error:", err);
    res.status(500).json({ error: "DB error", details: err.message });
  }
});

// Socket
io.on("connection", (socket) => {
  console.log("🟢 Socket connected", socket.id);
  socket.on("register", (userId) => {
    console.log("Socket register request for user_", userId, "socket:", socket.id);
    socket.join("user_" + userId);
  });
  socket.on("disconnect", () => console.log("🔴 Socket disconnected", socket.id));
});

// Start init
initDbAndStart();
