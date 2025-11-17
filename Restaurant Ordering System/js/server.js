const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const { randomBytes } = require('crypto');
const formidable = require('formidable');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const dns = require('dns').promises;
require('dotenv').config(); // ← Add this if you use .env

// ADD STRIPE
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // sk_test_...

const baseDir = path.resolve(__dirname, '..');
const PUBLIC_CUSTOMER_URL = 'http://136.113.3.49/Customer/customer_main.html';

const connection_pool = mysql.createPool({
  host: '136.113.3.49',
  user: 'nodeuser',
  password: 'csc400',
  database: 'restaurant_db',
  connectionLimit: 10
});

const sessions = {};
const customerSessions = {};

const server = http.createServer(async (req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // ---------- Helpers ----------
  function getSessionFromCookie() {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    return token ? sessions[token] : null;
  }

  function requireAdmin() {
    const session = getSessionFromCookie();
    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
      return null;
    }
    return session;
  }

  function getCustomerSessionFromCookie(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/cust_session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    return token ? customerSessions[token] : null;
  }

  async function isValidEmailDomain(email) {
    const domain = email.split('@')[1];
    if (!domain) return false;
    try {
      const records = await dns.resolveMx(domain);
      return records && records.length > 0;
    } catch (err) {
      return false;
    }
  }

  // ====================== STRIPE: Create Checkout Session ======================
  if (req.method === 'POST' && req.url === '/api/create-checkout-session') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { customer, items } = JSON.parse(body);

        if (!customer?.email || !items?.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
        }

        // Resolve or create customer
        let customerId;
        const [custRows] = await connection_pool.promise().query(
          'SELECT customer_id FROM Customers WHERE email = ? LIMIT 1', [customer.email]
        );
        if (custRows.length) {
          customerId = custRows[0].customer_id;
        } else {
          const [result] = await connection_pool.promise().query(
            'INSERT INTO Customers (name, email, phone) VALUES (?, ?, ?)',
            [customer.name || 'Guest', customer.email, customer.phone || null]
          );
          customerId = result.insertId;
        }

        // Build line items + validate availability
        const line_items = [];
        for (const item of items) {
          const [menuRows] = await connection_pool.promise().query(
            'SELECT item_name, price FROM Menu WHERE item_id = ? AND available = 1 LIMIT 1',
            [item.item_id]
          );
          if (!menuRows.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: `Item ${item.item_id} not available` }));
          }
          const { item_name, price } = menuRows[0];
          line_items.push({
            price_data: {
              currency: 'usd',
              product_data: { name: item_name },
              unit_amount: Math.round(price * 100),
            },
            quantity: item.quantity || 1,
          });
        }

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items,
          mode: 'payment',
          success_url: `${PUBLIC_CUSTOMER_URL}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${PUBLIC_CUSTOMER_URL}?canceled=1`,
          customer_email: customer.email,
          metadata: { customer_id: customerId.toString() }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sessionId: session.id }));

      } catch (err) {
        console.error('Stripe session error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Payment setup failed' }));
      }
    });
    return;
  }

  // ====================== STRIPE WEBHOOK (Save Order on Success) ======================
  if (req.method === 'POST' && req.url === '/webhook/stripe') {
    const sig = req.headers['stripe-signature'];
    let event;

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.log(`Webhook signature failed:`, err.message);
        res.writeHead(400);
        return res.end();
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const customerId = session.metadata.customer_id;

        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const values = lineItems.data.map(item => [
          customerId,
          null, // item_id (optional)
          item.description,
          item.quantity,
          item.amount_total / 100,
          'Completed',
          new Date()
        ]);

        connection_pool.query(
          'INSERT INTO Orders (customer_id, item_id, item_name, quantity, price, status, order_time) VALUES ?',
          [values],
          (err) => {
            if (err) console.error('Webhook DB error:', err);
          }
        );
      }

      res.writeHead(200);
      res.end();
    });
    return;
  }

if (req.method === 'POST' && (reqPath === '/Employee/login' || reqPath === '/employee/login')) {
    // ... your existing code ...
  }

  // ... rest of your server code (menu, orders, static files, etc.) ...

  // Static file handler at the very end
  let filePath = path.join(baseDir, 'public_html', reqPath.replace(/^\/+/, ''));
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 - File Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(80, () => console.log('Server running on port 80'));
