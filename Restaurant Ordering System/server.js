// Restaurant Ordering System/server.js
const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (your HTML/CSS/JS/images) from public_html/
app.use(express.static(path.join(__dirname, "public_html")));

// API routes
const orderRoutes = require("./routes/orderRoutes"); // uses your controllers/orderController.js
app.use("/api/orders", orderRoutes);

// Default route (go to customer page)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public_html", "customer_main.html"));
});

const PORT = process.env.PORT || 5000;
const pool = require("./db/connection");

app.get("/api/health/db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ db: "ok", result: rows[0] });
  } catch (e) {
    console.error("DB health check failed:", e);
    res.status(500).json({ db: "error", error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
  console.log(`Customer page: http://localhost:${PORT}/customer_main.html`);
  console.log(`Employee dashboard: http://localhost:${PORT}/employee_main.html`);
});
