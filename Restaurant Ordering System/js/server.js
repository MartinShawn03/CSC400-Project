const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const { randomBytes } = require('crypto');

const baseDir = path.resolve(__dirname, '..');

const connection_pool = mysql.createPool({
  host: '136.113.3.49',
  user: 'nodeuser',
  password: 'csc400',
  database: 'restaurant_db',
  connectionLimit: 10
});

// In-memory session store
const sessions = {};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  /** ---------------- EMPLOYEE LOGIN ---------------- **/
  if (req.method === 'POST' && (reqPath === '/Employee/login' || reqPath === '/employee/login')) {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        if (!username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Missing credentials' }));
        }

        connection_pool.query('SELECT * FROM Employees WHERE username = ? LIMIT 1', [username], (err, results) => {
          if (err) {
            console.error('DB Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }

          if (!results.length) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'User not found' }));
          }

          const employee = results[0];
          if (employee.password !== password) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Invalid password' }));
          }

          const token = randomBytes(16).toString('hex');
          sessions[token] = {
            id: employee.employee_id,
            username: employee.username,
            role: employee.role || 'Cashier'
          };

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `session=${token}; HttpOnly; Path=/; Max-Age=3600`
          });
          res.end(JSON.stringify({ success: true, role: employee.role }));
        });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
      }
    });
    return;
  }

  /** ---------------- EMPLOYEE LOGOUT ---------------- **/
  if (req.method === 'POST' && (reqPath === '/Employee/logout' || reqPath === '/employee/logout')) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    if (match) delete sessions[match[1]];
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0'
    });
    return res.end(JSON.stringify({ success: true }));
  }

  /** ---------------- ADMIN & EMPLOYEE PAGES SECURITY ---------------- **/
  if (reqPath === '/Employee/employee_main.html') {
    const token = (req.headers.cookie || '').match(/session=([a-f0-9]+)/)?.[1];
    if (!token || !sessions[token]) {
      res.writeHead(302, { Location: '/Employee/employee_login.html' });
      return res.end();
    }
  }

  if (reqPath === '/Employee/admin_main.html') {
    const token = (req.headers.cookie || '').match(/session=([a-f0-9]+)/)?.[1];
    const session = token ? sessions[token] : null;

    if (!session) {
      res.writeHead(302, { Location: '/Employee/employee_login.html' });
      return res.end();
    }

    if (String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(302, { Location: '/Employee/employee_main.html' });
      return res.end();
    }
  }

// ✅ ADMIN: Add new menu item
if (req.method === 'POST' && reqPath === '/Employee/menu') {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([a-f0-9]+)/);
  const token = match ? match[1] : null;
  const session = token ? sessions[token] : null;

  if (!session || String(session.role).toLowerCase() !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { item_name, description, price, category, image_path } = JSON.parse(body);
      if (!item_name || !price) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Missing required fields' }));
      }

      const sql = `
        INSERT INTO Menu (item_name, description, price, category, image_path, available)
        VALUES (?, ?, ?, ?, ?, 1)
      `;
      connection_pool.query(sql, [item_name, description, price, category, image_path || null], (err) => {
        if (err) {
          console.error('DB Insert Error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Database error' }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Menu item added successfully' }));
      });
    } catch (e) {
      console.error('JSON Parse Error:', e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON format' }));
    }
  });
  return;
}


  /** ---------------- CUSTOMER REGISTER & LOGIN ---------------- **/
  if (req.method === 'POST' && req.url === '/api/register') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const { name, phone, email, password } = JSON.parse(body);
      connection_pool.query(
        'INSERT INTO Customers (name, phone, email, password, is_guest) VALUES (?, ?, ?, ?, FALSE)',
        [name, phone, email, password],
        (err) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        }
      );
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/login') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const { email, password } = JSON.parse(body);
      connection_pool.query(
        'SELECT customer_id, name, email FROM Customers WHERE email = ? AND password = ? LIMIT 1',
        [email, password],
        (err, rows) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }
          if (rows.length === 1) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, user: rows[0] }));
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
          }
        }
      );
    });
    return;
  }

  /** ---------------- CUSTOMER OR GUEST ORDER CREATION ---------------- **/
  if (req.method === 'POST' && req.url === '/api/employee/createOrder') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { customer, items, total } = JSON.parse(body);

        if (!items || items.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'No items provided' }));
        }

        // Ensure customer record exists (guest or registered)
        const custSql = `
          INSERT INTO Customers (name, email, phone, is_guest)
          VALUES (?, ?, ?, TRUE)
          ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone)
        `;
        connection_pool.query(custSql, [customer.name, customer.email, customer.phone || null], (err) => {
          if (err) console.error('Customer insert error:', err);
        });

        // Insert orders
        const orderSql = `
          INSERT INTO Orders (customer_id, item_id, quanity, total, status)
          VALUES (NULL, ?, ?, ?, 'Pending')
        `;
        items.forEach(item => {
          connection_pool.query(orderSql, [item.id, item.qty, total], (err) => {
            if (err) console.error('Order insert error:', err);
          });
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Order created successfully' }));

      } catch (e) {
        console.error('JSON Parse Error:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON format' }));
      }
    });
    return;
  }

  /** ---------------- MENU FOR CUSTOMERS ---------------- **/
  if (req.method === 'GET' && req.url === '/api/menu') {
    const sql = 'SELECT * FROM Menu WHERE available = 1 OR available IS NULL';
    connection_pool.query(sql, (err, rows) => {
      if (err) {
        console.error('DB Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Database error' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, items: rows }));
    });
    return;
  }

  /** ---------------- STATIC FILE HANDLER ---------------- **/
  const filePath = path.join(baseDir, 'public_html', reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.mp3': 'audio/mpeg',
    '.ico': 'image/x-icon'
  };
  const contentType = mimeTypes[ext] || 'text/html';

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

server.listen(80, () => console.log('✅ Server running on port 80'));
