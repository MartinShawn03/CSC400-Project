// Core modules & libs
const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const { randomBytes } = require('crypto');
const bcrypt = require('bcrypt');
const formidable = require('formidable');
const QRCode = require('qrcode');

// --------- Config ---------
const baseDir = path.resolve(__dirname, '..'); // project root above this file
const PUBLIC_CUSTOMER_URL = 'http://136.113.3.49/Customer/customer_main.html';

const pool = mysql.createPool({
  host: '136.113.3.49',
  user: 'nodeuser',
  password: 'csc400',
  database: 'restaurant_db',
  connectionLimit: 10
});

// In-memory sessions
const empSessions = {};        // employee/admin sessions
const customerSessions = {};   // customer sessions

// --------- Helpers ---------
function getEmpSession(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/session=([a-f0-9]+)/);
  const t = m ? m[1] : null;
  return t ? empSessions[t] : null;
}

function requireAdmin(req, res) {
  const s = getEmpSession(req);
  if (!s || String(s.role).toLowerCase() !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    return null;
  }
  return s;
}

function okJSON(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function badJSON(res, code, msg) {
  res.writeHead(code || 400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, message: msg || 'Bad Request' }));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// --------- Server ---------
const server = http.createServer(async (req, res) => {
  try {
    let reqPath = decodeURIComponent((req.url || '').split('?')[0] || '/');
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    // ===================== EMPLOYEE AUTH =====================

    // Employee login
    if (req.method === 'POST' && (reqPath === '/Employee/login' || reqPath === '/employee/login')) {
      const { username, password } = await parseBody(req).catch(() => ({}));
      if (!username || !password) return badJSON(res, 400, 'Missing username or password');

      pool.query('SELECT * FROM Employees WHERE username = ? LIMIT 1', [username], (err, rows) => {
        if (err) return badJSON(res, 500, 'Database error');
        if (!rows.length) return badJSON(res, 401, 'User not found');

        const emp = rows[0];
        bcrypt.compare(password, emp.password, (cmpErr, match) => {
          if (cmpErr) return badJSON(res, 500, 'Error verifying password');
          if (!match) return badJSON(res, 401, 'Invalid password');

          const token = randomBytes(16).toString('hex');
          empSessions[token] = {
            id: emp.employee_id,
            username: emp.username,
            role: emp.role || 'Employee'
          };

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': [
              `session=${token}; HttpOnly; Path=/; Max-Age=3600`,
              `cust_session=; HttpOnly; Path=/; Max-Age=0` // clear any customer session
            ]
          });
          res.end(JSON.stringify({ success: true, role: emp.role || 'Employee' }));
        });
      });
      return;
    }

    // Employee logout
    if (req.method === 'POST' && (reqPath === '/Employee/logout' || reqPath === '/employee/logout')) {
      const cookie = req.headers.cookie || '';
      const m = cookie.match(/session=([a-f0-9]+)/);
      if (m) delete empSessions[m[1]];

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0'
      });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Guard Employee pages
    if (reqPath === '/Employee/employee_main.html') {
      const cookie = req.headers.cookie || '';
      const t = cookie.match(/session=([a-f0-9]+)/)?.[1];
      if (!t || !empSessions[t]) {
        res.writeHead(302, { Location: '/Employee/employee_login.html' });
        return res.end();
      }
    }

    if (reqPath === '/Employee/admin_main.html') {
      const cookie = req.headers.cookie || '';
      const t = cookie.match(/session=([a-f0-9]+)/)?.[1];
      const s = t ? empSessions[t] : null;
      if (!s) {
        res.writeHead(302, { Location: '/Employee/employee_login.html' });
        return res.end();
      }
      if (String(s.role).toLowerCase() !== 'admin') {
        res.writeHead(302, { Location: '/Employee/employee_main.html' });
        return res.end();
      }
    }

    // ===================== ADMIN: EMPLOYEE MGMT =====================

    // Create employee (explicit password)
    if (req.method === 'POST' && reqPath === '/Employee/register') {
      const session = requireAdmin(req, res);
      if (!session) return;

      const { name, username, password, role, email, phone } = await parseBody(req).catch(() => ({}));
      if (!name || !username || !password || !email) {
        return badJSON(res, 400, 'Missing required fields');
      }

      // Unique checks
      pool.query('SELECT employee_id FROM Employees WHERE email = ? LIMIT 1', [email], (e1, r1) => {
        if (e1) return badJSON(res, 500, 'Database error (email check)');
        if (r1.length) return badJSON(res, 409, 'Email already exists');

        pool.query('SELECT employee_id FROM Employees WHERE username = ? LIMIT 1', [username], (e2, r2) => {
          if (e2) return badJSON(res, 500, 'Database error (username check)');
          if (r2.length) return badJSON(res, 409, 'Username already exists');

          bcrypt.hash(password, 10, (hErr, hash) => {
            if (hErr) return badJSON(res, 500, 'Password hashing failed');

            const sql = `
              INSERT INTO Employees (name, username, password, role, email, phone)
              VALUES (?, ?, ?, ?, ?, ?)
            `;
            pool.query(
              sql,
              [name, username, hash, role || 'Employee', email, phone || null],
              (insErr) => {
                if (insErr) return badJSON(res, 500, 'Database error during insert');
                okJSON(res, { success: true, message: 'Employee registered successfully!' });
              }
            );
          });
        });
      });
      return;
    }

    // List employees
    if (req.method === 'GET' && reqPath === '/Employee/list') {
      const session = requireAdmin(req, res);
      if (!session) return;

      pool.query(
        'SELECT employee_id, name, username, email, role, phone, hire_date FROM Employees ORDER BY employee_id ASC',
        (err, rows) => {
          if (err) return badJSON(res, 500, 'Database error');
          okJSON(res, { success: true, employees: rows });
        }
      );
      return;
    }

    // Delete employee
    if (req.method === 'DELETE' && reqPath.startsWith('/Employee/delete/')) {
      const session = requireAdmin(req, res);
      if (!session) return;

      const id = parseInt(reqPath.split('/').pop(), 10);
      if (id === session.id) return badJSON(res, 403, 'You cannot delete your own account');

      pool.query('DELETE FROM Employees WHERE employee_id = ?', [id], (err, result) => {
        if (err) return badJSON(res, 500, 'Database error');
        if (!result.affectedRows) return badJSON(res, 404, 'Employee not found');
        okJSON(res, { success: true, message: 'Employee deleted successfully' });
      });
      return;
    }

    // ===================== ADMIN: MENU (with Image Upload) =====================

    // Get all menu (admin)
    if (req.method === 'GET' && reqPath === '/Employee/menu') {
      const session = requireAdmin(req, res);
      if (!session) return;

      pool.query('SELECT * FROM Menu', (err, rows) => {
        if (err) return badJSON(res, 500, 'Database error');
        okJSON(res, { success: true, items: rows });
      });
      return;
    }

    // Add new menu item (image upload)
    if (req.method === 'POST' && reqPath === '/Employee/menu') {
      const session = requireAdmin(req, res);
      if (!session) return;

      const uploadDir = path.join(baseDir, 'public_html', 'image');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const form = new formidable.IncomingForm();
      form.uploadDir = uploadDir;
      form.keepExtensions = true;
      form.multiples = false;

      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Form parse error:', err);
          return badJSON(res, 400, 'Form parse error');
        }

        const item_name = (fields.item_name && fields.item_name.toString()) || '';
        const description = (fields.description && fields.description.toString()) || '';
        const price = (fields.price && fields.price.toString()) || '';
        const category = (fields.category && fields.category.toString()) || '';
        const imageFile = files.image;

        if (!item_name || !price) {
          return badJSON(res, 400, 'Missing item name or price');
        }

        let imageName = null;
        if (imageFile && imageFile.filepath) {
          const ext = path.extname(imageFile.originalFilename || '') || '.jpg';
          imageName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
          const newPath = path.join(uploadDir, imageName);
          try {
            fs.renameSync(imageFile.filepath, newPath);
          } catch (moveErr) {
            console.error('Image move error:', moveErr);
            imageName = null;
          }
        }

        const sql =
          'INSERT INTO Menu (item_name, description, price, category, image, available) VALUES (?, ?, ?, ?, ?, 1)';
        pool.query(sql, [item_name, description, price, category, imageName], (insErr) => {
          if (insErr) {
            console.error('Insert Error:', insErr);
            return badJSON(res, 500, 'Database error');
          }
          okJSON(res, { success: true, message: 'Menu item added successfully!' });
        });
      });
      return;
    }

    // Delete menu item
    if (req.method === 'DELETE' && reqPath.startsWith('/Employee/menu/')) {
      const session = requireAdmin(req, res);
      if (!session) return;

      const itemId = reqPath.split('/').pop();
      pool.query('DELETE FROM Menu WHERE item_id = ?', [itemId], (err) => {
        if (err) return badJSON(res, 500, 'Database error');
        okJSON(res, { success: true });
      });
      return;
    }

    // Toggle availability
    if (req.method === 'PUT' && reqPath.startsWith('/Employee/menu/')) {
      const session = requireAdmin(req, res);
      if (!session) return;

      const itemId = reqPath.split('/').pop();
      const { available } = await parseBody(req).catch(() => ({}));
      if (available === undefined) return badJSON(res, 400, 'Missing availability');

      pool.query('UPDATE Menu SET available = ? WHERE item_id = ?', [available, itemId], (err) => {
        if (err) return badJSON(res, 500, 'Database error');
        okJSON(res, { success: true });
      });
      return;
    }

    // ===================== CUSTOMER AUTH =====================

    // Register
    if (req.method === 'POST' && reqPath === '/api/register') {
      const { name, phone, email, password } = await parseBody(req).catch(() => ({}));
      if (!name || !email || !password) {
        return badJSON(res, 400, 'Missing required fields');
      }

      bcrypt.hash(password, 10, (hErr, hash) => {
        if (hErr) return badJSON(res, 500, 'Password hashing failed');

        pool.query(
          'INSERT INTO Customers (name, phone, email, password) VALUES (?, ?, ?, ?)',
          [name, phone || null, email, hash],
          (insErr) => {
            if (insErr) return badJSON(res, 500, 'Database error');
            okJSON(res, { success: true });
          }
        );
      });
      return;
    }

    // Login
    if (req.method === 'POST' && reqPath === '/api/login') {
      const { email, password } = await parseBody(req).catch(() => ({}));
      if (!email || !password) return badJSON(res, 400, 'Missing email or password');

      pool.query(
        'SELECT customer_id, name, email, password FROM Customers WHERE email = ? LIMIT 1',
        [email],
        (err, rows) => {
          if (err) return badJSON(res, 500, 'Database error');
          if (rows.length !== 1) return badJSON(res, 401, 'Invalid email or password');

          const user = rows[0];
          bcrypt.compare(password, user.password, (cmpErr, match) => {
            if (cmpErr) return badJSON(res, 500, 'Error checking password');
            if (!match) return badJSON(res, 401, 'Invalid email or password');

            const token = randomBytes(16).toString('hex');
            customerSessions[token] = {
              id: user.customer_id,
              name: user.name,
              email: user.email
            };

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Set-Cookie': [
                `cust_session=${token}; HttpOnly; Path=/; Max-Age=86400`,
                `session=; HttpOnly; Path=/; Max-Age=0` // clear employee session
              ]
            });
            res.end(JSON.stringify({
              success: true,
              user: { customer_id: user.customer_id, name: user.name, email: user.email }
            }));
          });
        }
      );
      return;
    }

    // Logout
    if (req.method === 'POST' && reqPath === '/api/logout') {
      const cookie = req.headers.cookie || '';
      const m = cookie.match(/cust_session=([a-f0-9]+)/);
      if (m) delete customerSessions[m[1]];

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'cust_session=; HttpOnly; Path=/; Max-Age=0'
      });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // ===================== ORDERS =====================

    // Employee creates order (walk-in or known customer)
    if (req.method === 'POST' && reqPath === '/api/employee/createOrder') {
      const { customer_id = null, item_id, quantity } = await parseBody(req).catch(() => ({}));
      if (!item_id || !quantity) return badJSON(res, 400, 'Missing fields');

      const sql =
        'INSERT INTO Orders (customer_id, item_id, quantity, status) VALUES (?, ?, ?, \'Pending\')';
      pool.query(sql, [customer_id, item_id, quantity], (err) => {
        if (err) return badJSON(res, 500, 'Database error');
        okJSON(res, { success: true, message: 'Order created successfully' });
      });
      return;
    }

    // Public menu (available items only) – used by both customers & employees
    if (req.method === 'GET' && reqPath === '/api/menu') {
      pool.query(
        'SELECT * FROM Menu WHERE available = 1 OR available IS NULL',
        (err, rows) => {
          if (err) return badJSON(res, 500, 'Database error');
          const items = rows.map(r => ({
            ...r,
            image: r.image ? `/image/${r.image}` : '/image/no_image.png'
          }));
          okJSON(res, { success: true, items });
        }
      );
      return;
    }

    // Customer checkout: creates order rows per item
    if (req.method === 'POST' && reqPath === '/api/checkout') {
      const { customer = {}, items = [] } = await parseBody(req).catch(() => ({}));
      if (!Array.isArray(items) || items.length === 0) return badJSON(res, 400, 'Cart is empty');
      if (!customer.email) return badJSON(res, 400, 'Customer email required');

      pool.query('SELECT customer_id FROM Customers WHERE email = ? LIMIT 1', [customer.email], (err, rows) => {
        if (err) return badJSON(res, 500, 'Database error (customer check)');

        const createFor = (customerId) => {
          const values = items.map(i => [customerId, i.item_id, i.quantity, 'Pending']);
          pool.query(
            'INSERT INTO Orders (customer_id, item_id, quantity, status) VALUES ?',
            [values],
            (insErr) => {
              if (insErr) return badJSON(res, 500, 'Database error (insert orders)');
              okJSON(res, { success: true, message: 'Order placed successfully!' });
            }
          );
        };

        if (rows.length) {
          createFor(rows[0].customer_id);
        } else {
          pool.query(
            'INSERT INTO Customers (name, email, phone) VALUES (?, ?, ?)',
            [customer.name || 'Customer', customer.email, customer.phone || null],
            (insErr, result) => {
              if (insErr) return badJSON(res, 500, 'Database error creating customer');
              createFor(result.insertId);
            }
          );
        }
      });
      return;
    }

    // Customer: fetch their orders
    if (req.method === 'POST' && reqPath === '/api/orders/customer') {
      const { email } = await parseBody(req).catch(() => ({}));
      if (!email) return badJSON(res, 400, 'Email required');

      const sql = `
        SELECT o.order_id, m.item_name, o.quantity AS quantity, o.status, o.order_time
        FROM Orders o
        JOIN Menu m ON o.item_id = m.item_id
        JOIN Customers c ON o.customer_id = c.customer_id
        WHERE c.email = ?
        ORDER BY o.order_time DESC
      `;
      pool.query(sql, [email], (err, rows) => {
        if (err) return badJSON(res, 500, 'Database error');
        okJSON(res, { success: true, orders: rows });
      });
      return;
    }

    // Employee: get pending orders
    if (req.method === 'GET' && reqPath === '/api/orders/pending') {
      const sql = `
        SELECT order_id, customer_id, item_id, quantity, status, order_time
        FROM Orders
        WHERE status = 'Pending'
        ORDER BY order_time DESC
      `;
      pool.query(sql, (err, rows) => {
        if (err) return badJSON(res, 500, 'Database error');
        okJSON(res, { success: true, orders: rows });
      });
      return;
    }

    // Employee: get active (Pending + In Progress)
    if (req.method === 'GET' && reqPath === '/api/orders/active') {
      const sql = `
        SELECT
          o.order_id,
          o.customer_id,
          o.item_id,
          o.quantity,
          o.status,
          o.order_time,
          COALESCE(c.name, 'Walk-in') AS customer_name,
          m.item_name
        FROM Orders o
        LEFT JOIN Customers c ON o.customer_id = c.customer_id
        LEFT JOIN Menu m ON o.item_id = m.item_id
        WHERE o.status IN ('Pending', 'In Progress')
        ORDER BY o.order_time DESC
      `;
      pool.query(sql, (err, rows) => {
        if (err) return badJSON(res, 500, 'Database error');
        okJSON(res, { success: true, orders: rows });
      });
      return;
    }

    // Update order status
    if (req.method === 'PUT' && reqPath === '/api/orders/updateStatus') {
      const { order_id, status } = await parseBody(req).catch(() => ({}));
      if (!order_id || !status) return badJSON(res, 400, 'Missing order_id or status');

      pool.query('UPDATE Orders SET status = ? WHERE order_id = ?', [status, order_id], (err) => {
        if (err) return badJSON(res, 500, 'Database error');
        okJSON(res, { success: true, message: 'Order status updated' });
      });
      return;
    }

    // ===================== QR CODE =====================
    if (req.method === 'GET' && (reqPath === '/qr.png' || reqPath === '/qr')) {
      QRCode.toBuffer(
        PUBLIC_CUSTOMER_URL,
        { type: 'png', width: 512, margin: 1, errorCorrectionLevel: 'M' },
        (err, buffer) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            return res.end('QR generation error');
          }
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=31536000, immutable'
          });
          res.end(buffer);
        }
      );
      return;
    }

    // ===================== STATIC FILES =====================
    const staticPath = path.join(
      baseDir,
      'public_html',
      reqPath.replace(/^\/+/, '')
    );
    const ext = path.extname(staticPath).toLowerCase();
    const mime =
      {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.mp3': 'audio/mpeg',
        '.ico': 'image/x-icon'
      }[ext] || 'application/octet-stream';

    if (staticPath.startsWith(path.join(baseDir, 'public_html'))) {
      fs.readFile(staticPath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 - File Not Found');
        }
        res.writeHead(200, { 'Content-Type': mime });
        return res.end(data);
      });
      return;
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 - Not Found');
  } catch (err) {
    console.error('SERVER ERROR:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Server error' }));
  }
});

// --------- Start ---------
server.listen(80, () => console.log('Server running on port 80'));
