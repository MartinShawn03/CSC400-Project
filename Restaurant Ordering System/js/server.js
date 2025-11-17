/********************************************************************
 *  RESTAURANT SERVER – Node.js + MySQL + Stripe Checkout
 *  ----------------------------------------------------
 *  Features:
 *   • Employee / Admin login & session management
 *   • Menu CRUD (admin only)
 *   • Customer registration / login / cart checkout via Stripe
 *   • QR code for customer portal
 *   • Secure webhook handling
 ********************************************************************/

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { randomBytes } = require('crypto');
const formidable = require('formidable');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// ------------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------------
const baseDir = path.resolve(__dirname, '..');
const PUBLIC_CUSTOMER_URL = 'http://136.113.3.49/Customer/customer_main.html';
const PORT = process.env.PORT || 80;

// ------------------------------------------------------------------
// DB POOL (promise version)
// ------------------------------------------------------------------
const pool = mysql.createPool({
  host: '136.113.3.49',
  user: 'nodeuser',
  password: 'csc400',
  database: 'restaurant_db',
  connectionLimit: 15,
  waitForConnections: true,
  queueLimit: 0,
});

// ------------------------------------------------------------------
// IN-MEMORY SESSIONS (replace with Redis in prod)
// ------------------------------------------------------------------
const sessions = {};          // employee sessions
const customerSessions = {};  // customer sessions

// ------------------------------------------------------------------
// MIDDLEWARE HELPERS
// ------------------------------------------------------------------
const getEmployeeSession = (req) => {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/session=([a-f0-9]+)/);
  return m ? sessions[m[1]] : null;
};

const requireAdmin = (req, res) => {
  const sess = getEmployeeSession(req);
  if (!sess || sess.role.toLowerCase() !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Admin only' }));
    return null;
  }
  return sess;
};

const getCustomerSession = (req) => {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/cust_session=([a-f0-9]+)/);
  return m ? customerSessions[m[1]] : null;
};

// ------------------------------------------------------------------
// SERVER
// ------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  // ----- CORS & Helmet ------------------------------------------------
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // ----- Rate limiting (public endpoints) ----------------------------
  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  // Apply only to public routes (you can move this out if you use Express)
  if (!req.url.startsWith('/Employee') && !req.url.startsWith('/admin')) {
    // simple inline limiter
    const now = Date.now();
    const key = req.socket.remoteAddress;
    // (skip real implementation for brevity – use express-rate-limit in prod)
  }

  // ----- URL parsing -------------------------------------------------
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // -----------------------------------------------------------------
  //  EMPLOYEE LOGIN
  // -----------------------------------------------------------------
  if (req.method === 'POST' && /^\/[Ee]mployee\/login$/.test(reqPath)) {
    const body = await readBody(req);
    let data;
    try { data = JSON.parse(body); } catch { return sendJSON(res, 400, { success: false, message: 'Invalid JSON' }); }

    const { username, password } = data;
    if (!username || !password) return sendJSON(res, 400, { success: false, message: 'Missing credentials' });

    const [rows] = await pool.query('SELECT * FROM Employees WHERE username = ? LIMIT 1', [username]);
    if (!rows.length) return sendJSON(res, 401, { success: false, message: 'Invalid credentials' });

    const emp = rows[0];
    const match = await bcrypt.compare(password, emp.password);
    if (!match) return sendJSON(res, 401, { success: false, message: 'Invalid credentials' });

    const token = randomBytes(16).toString('hex');
    sessions[token] = { id: emp.employee_id, username: emp.username, role: emp.role || 'Cashier' };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `session=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`,
    });
    return sendJSON(res, 200, { success: true, role: emp.role });
  }

  // -----------------------------------------------------------------
  //  EMPLOYEE LOGOUT
  // -----------------------------------------------------------------
  if (req.method === 'POST' && /^\/[Ee]mployee\/logout$/.test(reqPath)) {
    const m = (req.headers.cookie || '').match(/session=([a-f0-9]+)/);
    if (m) delete sessions[m[1]];
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0',
    });
    return sendJSON(res, 200, { success: true });
  }

  // -----------------------------------------------------------------
  //  PROTECTED STATIC PAGES
  // -----------------------------------------------------------------
  if (reqPath === '/Employee/employee_main.html' || reqPath === '/Employee/admin_main.html') {
    const token = (req.headers.cookie || '').match(/session=([a-f0-9]+)/)?.[1];
    const sess = token ? sessions[token] : null;

    if (!sess) {
      res.writeHead(302, { Location: '/Employee/employee_login.html' });
      return res.end();
    }
    if (reqPath.endsWith('admin_main.html') && sess.role.toLowerCase() !== 'admin') {
      res.writeHead(302, { Location: '/Employee/employee_main.html' });
      return res.end();
    }
  }

// -----------------------------------------------------------------
  //  ADMIN: Register Employee
  // -----------------------------------------------------------------
  if (req.method === 'POST' && reqPath === '/Employee/register') {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    let data;
    try { data = JSON.parse(body); } catch { return sendJSON(res, 400, { success: false, message: 'Invalid JSON' }); }

    const { name, username, password, role, email, phone } = data;
    if (!name || !username || !password || !email) return sendJSON(res, 400, { success: false, message: 'Missing fields' });

    const [emailRows] = await pool.query('SELECT 1 FROM Employees WHERE email = ? LIMIT 1', [email]);
    if (emailRows.length) return sendJSON(res, 409, { success: false, message: 'Email taken' });

    const [userRows] = await pool.query('SELECT 1 FROM Employees WHERE username = ? LIMIT 1', [username]);
    if (userRows.length) return sendJSON(res, 409, { success: false, message: 'Username taken' });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO Employees (name, username, password, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [name, username, hashed, role || 'Employee', email, phone || null]
    );

    return sendJSON(res, 200, { success: true, message: 'Employee created' });
  }

  // -----------------------------------------------------------------
  //  ADMIN: List Employees
  // -----------------------------------------------------------------
  if (req.method === 'GET' && reqPath === '/Employee/list') {
    if (!requireAdmin(req, res)) return;
    const [rows] = await pool.query(
      'SELECT employee_id, name, username, email, role, phone, hire_date FROM Employees ORDER BY employee_id'
    );
    return sendJSON(res, 200, { success: true, employees: rows });
  }

  // -----------------------------------------------------------------
  //  ADMIN: Delete Employee
  // -----------------------------------------------------------------
  if (req.method === 'DELETE' && /^\/Employee\/delete\/\d+$/.test(reqPath)) {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const targetId = Number(reqPath.split('/').pop());
    if (targetId === admin.id) return sendJSON(res, 403, { success: false, message: 'Cannot delete yourself' });

    const [result] = await pool.query('DELETE FROM Employees WHERE employee_id = ?', [targetId]);
    if (!result.affectedRows) return sendJSON(res, 404, { success: false, message: 'Not found' });

    return sendJSON(res, 200, { success: true });
  }

  // -----------------------------------------------------------------
  //  MENU CRUD (admin only)
  // -----------------------------------------------------------------
  if (req.method === 'GET' && reqPath === '/Employee/menu') {
    if (!requireAdmin(req, res)) return;
    const [rows] = await pool.query('SELECT * FROM Menu');
    return sendJSON(res, 200, { success: true, items: rows });
  }

  if (req.method === 'POST' && reqPath === '/Employee/menu') {
    if (!requireAdmin(req, res)) return;

    const form = formidable({ multiples: false, uploadDir: path.join(baseDir, 'public_html', 'image'), keepExtensions: true });
    form.parse(req, async (err, fields, files) => {
      if (err) return sendJSON(res, 400, { success: false, message: 'Parse error' });

      const item_name = String(fields.item_name || '');
      const description = String(fields.description || '');
      const price = parseFloat(fields.price);
      const category = String(fields.category || '');
      const imageFile = files.image?.[0] || files.image;

      if (!item_name || isNaN(price)) return sendJSON(res, 400, { success: false, message: 'Name & price required' });

      let imageName = null;
      if (imageFile) {
        imageName = path.basename(imageFile.filepath || imageFile.path);
        const dest = path.join(form.uploadDir, imageName);
        try { fs.renameSync(imageFile.filepath || imageFile.path, dest); } catch { /* ignore */ }
      }

      await pool.query(
        'INSERT INTO Menu (item_name, description, price, category, image, available) VALUES (?, ?, ?, ?, ?, 1)',
        [item_name, description, price, category, imageName]
      );

      return sendJSON(res, 200, { success: true, message: 'Item added' });
    });
    return;
  }

  if (req.method === 'DELETE' && /^\/Employee\/menu\/\d+$/.test(reqPath)) {
    if (!requireAdmin(req, res)) return;
    const id = Number(reqPath.split('/').pop());
    await pool.query('DELETE FROM Menu WHERE item_id = ?', [id]);
    return sendJSON(res, 200, { success: true });
  }

  if (req.method === 'PUT' && /^\/Employee\/menu\/\d+$/.test(reqPath)) {
    if (!requireAdmin(req, res)) return;
    const id = Number(reqPath.split('/').pop());
    const body = await readBody(req);
    let data;
    try { data = JSON.parse(body); } catch { return sendJSON(res, 400, { success: false, message: 'Invalid JSON' }); }
    const { available } = data;
    await pool.query('UPDATE Menu SET available = ? WHERE item_id = ?', [available ? 1 : 0, id]);
    return sendJSON(res, 200, { success: true });
  }

  // -----------------------------------------------------------------
  //  CUSTOMER: Register
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/api/register') {
    const body = await readBody(req);
    let data;
    try { data = JSON.parse(body); } catch { return sendJSON(res, 400, { success: false, message: 'Invalid JSON' }); }

    const { name, phone, email, password } = data;
    if (!name || !email || !password) return sendJSON(res, 400, { success: false, message: 'Missing fields' });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO Customers (name, phone, email, password) VALUES (?, ?, ?, ?)',
      [name, phone || null, email, hashed]
    );
    return sendJSON(res, 200, { success: true });
  }

  // -----------------------------------------------------------------
  //  CUSTOMER: Login
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/api/login') {
    const body = await readBody(req);
    let data;
    try { data = JSON.parse(body); } catch { return sendJSON(res, 400, { success: false, message: 'Invalid JSON' }); }

    const { email, password } = data;
    const [rows] = await pool.query('SELECT * FROM Customers WHERE email = ? LIMIT 1', [email]);
    if (!rows.length) return sendJSON(res, 401, { success: false, message: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return sendJSON(res, 401, { success: false, message: 'Invalid credentials' });

    const token = randomBytes(16).toString('hex');
    customerSessions[token] = { id: user.customer_id, name: user.name, email: user.email, createdAt: Date.now() };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `cust_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`,
    });
    delete user.password;
    return sendJSON(res, 200, { success: true, user });
  }

 // -----------------------------------------------------------------
  //  CUSTOMER: Logout
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/api/logout') {
    const m = (req.headers.cookie || '').match(/cust_session=([a-f0-9]+)/);
    if (m) delete customerSessions[m[1]];
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'cust_session=; HttpOnly; Path=/; Max-Age=0',
    });
    return sendJSON(res, 200, { success: true });
  }

// -----------------------------------------------------------------
  //  PUBLIC: Menu (available items)
  // -----------------------------------------------------------------
  if (req.method === 'GET' && req.url === '/api/menu') {
    const [rows] = await pool.query('SELECT * FROM Menu WHERE available = 1');
    return sendJSON(res, 200, { success: true, items: rows });
  }

  // -----------------------------------------------------------------
  //  STRIPE CHECKOUT – Create Session
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/api/checkout') {
    const body = await readBody(req);
    let payload;
    try { payload = JSON.parse(body); } catch { return sendJSON(res, 400, { success: false, message: 'Invalid JSON' }); }

    const { customer, items } = payload;
    if (!customer?.email || !items?.length) return sendJSON(res, 400, { success: false, message: 'Invalid payload' });

    // ---- 1. Resolve / create customer record ----
    let customerId;
    const [custRows] = await pool.query('SELECT customer_id FROM Customers WHERE email = ? LIMIT 1', [customer.email]);
    if (custRows.length) {
      customerId = custRows[0].customer_id;
    } else {
      const [ins] = await pool.query(
        'INSERT INTO Customers (name, email, phone) VALUES (?, ?, ?)',
        [customer.name || 'Guest', customer.email, customer.phone || null]
      );
      customerId = ins.insertId;
    }

    // ---- 2. Validate items & compute line items for Stripe ----
    const line_items = [];
    let total = 0;

    for (const it of items) {
      const [menuRows] = await pool.query('SELECT item_name, price FROM Menu WHERE item_id = ? AND available = 1 LIMIT 1', [it.item_id]);
      if (!menuRows.length) return sendJSON(res, 400, { success: false, message: `Item ${it.item_id} not available` });

      const { item_name, price } = menuRows[0];
      const qty = Number(it.quantity) || 1;
      const amount = Math.round(price * 100); // cents

      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: item_name },
          unit_amount: amount,
        },
        quantity: qty,
      });
      total += amount * qty;
    }

    if (total === 0) return sendJSON(res, 400, { success: false, message: 'Cart total is zero' });

    // ---- 3. Create Stripe Checkout Session ----
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${PUBLIC_CUSTOMER_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_CUSTOMER_URL}?canceled=1`,
      customer_email: customer.email,
      metadata: { customer_id: customerId.toString() },
    });

    // ---- 4. Return session ID to frontend ----
    return sendJSON(res, 200, { success: true, sessionId: session.id });
  }

  // -----------------------------------------------------------------
  //  STRIPE WEBHOOK – Confirm payment & record orders
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/webhook/stripe') {
    const sig = req.headers['stripe-signature'];
    const buf = await readBody(req, true); // raw buffer

    let event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed.', err.message);
      res.writeHead(400);
      return res.end('Invalid signature');
    }

    if (event.type === 'checkout.session.completed') {
      const sess = event.data.object;
      const customerId = sess.metadata.customer_id;
      const lineItems = await stripe.checkout.sessions.listLineItems(sess.id, { limit: 100 });

      const orderValues = lineItems.data.map(li => {
        // li.price.product is an object; name is inside metadata or product_data
        const name = li.description;
        // We need the original menu item_id – we stored it in metadata when possible.
        // For simplicity we’ll just record the name & price.
        // If you need item_id, add it to line_item metadata in create session.
        return [customerId, li.description, li.quantity, li.amount_total / 100, 'Completed', new Date()];
      });

      // Insert orders
      await pool.query(
        `INSERT INTO Orders (customer_id, item_name, quantity, price, status, order_time)
         VALUES ?`,
        [orderValues]
      );
    }

    res.writeHead(200);
    res.end('OK');
    return;
  }

  // -----------------------------------------------------------------
  //  CUSTOMER: Get own orders
  // -----------------------------------------------------------------
  if (req.method === 'POST' && req.url === '/api/orders/customer') {
    const body = await readBody(req);
    let { email } = {};
    try { ({ email } = JSON.parse(body)); } catch {}
    if (!email) return sendJSON(res, 400, { success: false, message: 'email required' });

    const [rows] = await pool.query(`
      SELECT o.order_id, o.item_name, o.quantity, o.price, o.status, o.order_time
      FROM Orders o
      JOIN Customers c ON o.customer_id = c.customer_id
      WHERE c.email = ?
      ORDER BY o.order_time DESC
    `, [email]);

    return sendJSON(res, 200, { success: true, orders: rows });
  }

  // -----------------------------------------------------------------
  //  QR CODE (static)
  // -----------------------------------------------------------------
  if (req.method === 'GET' && (reqPath === '/qr.png' || reqPath === '/qr')) {
    const buffer = await QRCode.toBuffer(PUBLIC_CUSTOMER_URL, {
      type: 'png',
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' });
    return res.end(buffer);
  }

// -----------------------------------------------------------------
  //  STATIC FILES
  // -----------------------------------------------------------------
  const filePath = path.join(baseDir, 'public_html', reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
  }[ext] || 'text/html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 – Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    }
  });
});

// -----------------------------------------------------------------
//  UTILS
// -----------------------------------------------------------------
function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function readBody(req, raw = false) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(raw ? Buffer.concat(chunks) : Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// -----------------------------------------------------------------
//  START SERVER
// -----------------------------------------------------------------
server.listen(80, () => console.log(`Server listening on port 80`));
