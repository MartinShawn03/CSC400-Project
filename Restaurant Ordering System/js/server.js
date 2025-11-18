const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const { randomBytes } = require('crypto');
const formidable = require('formidable');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const dns = require('dns').promises;

const baseDir = path.resolve(__dirname, '..');

const PUBLIC_CUSTOMER_URL = 'http://136.113.3.49/Customer/customer_main.html';

const connection_pool = mysql.createPool({
  host: '136.113.3.49',
  user: 'nodeuser',
  password: 'csc400',
  database: 'restaurant_db',
  connectionLimit: 10
});

// Simple in-memory session store
const sessions = {};
const customerSessions = {};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // Default landing
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

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

// Validate that email domain has MX record (real mail server)
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

// ---------- EMPLOYEE LOGIN ----------
if (req.method === 'POST' && (reqPath === '/Employee/login' || reqPath === '/employee/login')) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { username, password } = JSON.parse(body);
      if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Missing username or password' }));
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

        // Compare hashed password
        bcrypt.compare(password, employee.password, (err, isMatch) => {
          if (err) {
            console.error('Compare Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Error verifying password' }));
          }

          if (!isMatch) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Invalid password' }));
          }

            // Create session token
            const token = randomBytes(16).toString('hex');
            sessions[token] = {
              id: employee.employee_id,
              username: employee.username,
              role: employee.role || 'Cashier'
            };
            res.writeHead(200, {
            'Content-Type': 'application/json',
            // FIX: Clear customer session when employee logs in
            'Set-Cookie': [
              `session=${token}; HttpOnly; Path=/; Max-Age=3600`,
              `cust_session=; HttpOnly; Path=/; Max-Age=0` // Clear customer session
            ]
          });
            res.end(JSON.stringify({ success: true, role: employee.role }));
          });
        });
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
    }
  });
  return;
}

  // ---------- EMPLOYEE LOGOUT ----------
  if (req.method === 'POST' && (reqPath === '/Employee/logout' || reqPath === '/employee/logout')) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    if (match) delete sessions[match[1]];
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0'
    });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Protect employee_main.html
  if (reqPath === '/Employee/employee_main.html') {
    const token = (req.headers.cookie || '').match(/session=([a-f0-9]+)/)?.[1];
    if (!token || !sessions[token]) {
      res.writeHead(302, { Location: '/Employee/employee_login.html' });
      return res.end();
    }
  }

  // Protect admin_main.html (Admin only)
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

  // ---------- ADMIN: Register New Employee ----------
 if (req.method === 'POST' && reqPath === '/Employee/register') {
  const session = getSessionFromCookie();
  if (!session || String(session.role).toLowerCase() !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { name, username, password, role, email, phone } = JSON.parse(body);

      if (!name || !username || !password || !email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Missing required fields' }));
      }

      // Email domain validation
      const validDomain = await isValidEmailDomain(email);
      if (!validDomain) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Invalid email domain — cannot receive mail' }));
      }

        // Check if email already exists
        const checkEmailSQL = 'SELECT employee_id FROM Employees WHERE email = ? LIMIT 1';
        connection_pool.query(checkEmailSQL, [email], (err, rows) => {
          if (err) {
            console.error('DB Error (email check):', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error during email check' }));
          }

          if (rows.length > 0) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Email already exists' }));
          }

          // Check if username already exists
          const checkUserSQL = 'SELECT employee_id FROM Employees WHERE username = ? LIMIT 1';
          connection_pool.query(checkUserSQL, [username], (err2, userRows) => {
            if (err2) {
              console.error('DB Error (username check):', err2);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, message: 'Database error during username check' }));
            }

            if (userRows.length > 0) {
              res.writeHead(409, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, message: 'Username already exists' }));
            }

            // Hash password before storing
            bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
              if (hashErr) {
                console.error('Hashing Error:', hashErr);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Password hashing failed' }));
              }

              // Insert new employee
              const insertSQL = `
                INSERT INTO Employees (name, username, password, role, email, phone)
                VALUES (?, ?, ?, ?, ?, ?)
              `;
              connection_pool.query(insertSQL, [name, username, hashedPassword, role || 'Employee', email, phone || null], (err3) => {
                if (err3) {
                  console.error('DB Insert Error:', err3);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  return res.end(JSON.stringify({ success: false, message: 'Database error during insert' }));
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Employee registered successfully!' }));
              });
            });
          });
        });

      } catch (e) {
        console.error('JSON Parse Error:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON format' }));
      }
    });
    return;
  }

  // ---------- ADMIN: Get all employees ----------
  if (req.method === 'GET' && reqPath === '/Employee/list') {
    const session = getSessionFromCookie();
    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    }

    connection_pool.query(
      'SELECT employee_id, name, username, email, role, phone, hire_date FROM Employees ORDER BY employee_id ASC',
      (err, rows) => {
        if (err) {
          console.error('DB Fetch Error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Database error' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, employees: rows }));
      }
    );
    return;
  }

  // ---------- ADMIN: Delete employee by ID ----------
  if (req.method === 'DELETE' && reqPath.startsWith('/Employee/delete/')) {
    const session = getSessionFromCookie();
    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    }

    const targetId = parseInt(reqPath.split('/').pop(), 10);
    if (targetId === session.id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'You cannot delete your own account' }));
    }

    connection_pool.query('DELETE FROM Employees WHERE employee_id = ?', [targetId], (err, result) => {
      if (err) {
        console.error('DB Delete Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Database error' }));
      }

      if (result.affectedRows === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Employee not found' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Employee deleted successfully' }));
    });
    return;
  }

  if (req.method === 'GET' && reqPath === '/Employee/menu') {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    const session = token ? sessions[token] : null;

    // Must be Admin
    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    }

    connection_pool.query('SELECT * FROM Menu', (err, rows) => {
      if (err) {
        console.error('DB Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Database error' }));
      }
      const items = rows.map(item => ({
          ...item,
          image: item.image ? `/image/${item.image}` : '/image/no_image.png'
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, items }));
    });
    return;
  }


  // ---------- ADMIN: Add new menu item  ----------
  
  if (req.method === 'POST' && reqPath === '/Employee/menu') {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([a-f0-9]+)/);
  const token = match ? match[1] : null;
  const session = token ? sessions[token] : null;

  // Only admins can access
  if (!session || String(session.role).toLowerCase() !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
  }

  // Use Formidable to handle text + image upload
  const form = new formidable.IncomingForm();
  const uploadDir = path.join(baseDir, 'public_html', 'image');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  form.uploadDir = uploadDir;
  form.keepExtensions = true;

  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Form parse error' }));
    }

    const item_name = Array.isArray(fields.item_name) ? fields.item_name[0] : fields.item_name || '';
    const description = Array.isArray(fields.description) ? fields.description[0] : fields.description || '';
    const price = Array.isArray(fields.price) ? fields.price[0] : fields.price || '';
    const category = Array.isArray(fields.category) ? fields.category[0] : fields.category || '';
    const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;


    if (!item_name || !price) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Missing item name or price' }));
    }
    let imageName = null;

if (imageFile && imageFile.filepath) {
  // Detect original file extension (.jpg, .png, etc.)
  const ext = path.extname(imageFile.originalFilename || '') || '.jpg';
  // Generate a clean unique filename
  imageName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;

  const newPath = path.join(uploadDir, imageName);
  try {
    fs.renameSync(imageFile.filepath, newPath);
    console.log(' Image saved as:', imageName);
  } catch (err) {
    console.error(' Rename error:', err);
  }
} else {
  console.log('No image file uploaded.');
}



    // Insert new menu item into database
    const sql = 'INSERT INTO Menu (item_name, description, price, category, image, available) VALUES (?, ?, ?, ?, ?, 1)';
    connection_pool.query(sql, [item_name, description, price, category, imageName], (err) => {
      if (err) {
        console.error('Insert Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Database error' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Menu item added successfully!' }));
    });
  });
  return;
}




  // ---------- ADMIN: Delete menu item ----------
  if (req.method === 'DELETE' && reqPath.startsWith('/Employee/menu/')) {
    const session = getSessionFromCookie();
    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    }

    const itemId = reqPath.split('/').pop();
    connection_pool.query('DELETE FROM Menu WHERE item_id = ?', [itemId], (err) => {
      if (err) {
        console.error('Delete Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Database error' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

// ---------- ADMIN: Edit menu item ----------
if (req.method === 'PUT' 
    && reqPath.startsWith('/Employee/menu/')
    && reqPath.endsWith('/edit')) {

    const session = getSessionFromCookie();
    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    }

    const itemId = reqPath.split('/')[3];

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { item_name, description, price } = JSON.parse(body);

        const sql = `
          UPDATE Menu 
          SET item_name=?, description=?, price=? 
          WHERE item_id=?
        `;

        connection_pool.query(sql, [item_name, description, price, itemId], (err) => {
          if (err) {
            console.error('Update Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON format' }));
      }
    });
    return;
}

  // ---------- ADMIN: Toggle menu item availability (PUT /Employee/menu/:id) ----------
  if (req.method === 'PUT' && reqPath.startsWith('/Employee/menu/')) {
    const session = getSessionFromCookie();
    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    }

    const itemId = reqPath.split('/').pop();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { available } = JSON.parse(body);
        const sql = 'UPDATE Menu SET available = ? WHERE item_id = ?';
        connection_pool.query(sql, [available, itemId], (err) => {
          if (err) {
            console.error('Update Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON format' }));
      }
     });
    return;
  }


  // ---------- CUSTOMER: Register ----------
  if (req.method === 'POST' && req.url === '/api/register') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { name, phone, email, password } = JSON.parse(body);
        if (!name || !email || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Missing required fields' }));
        }
      // Email domain validation (real mail server)
        const validDomain = await isValidEmailDomain(email);
        if (!validDomain) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            message: 'Invalid email domain — cannot receive mail'
          }));
        }

        bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
          if (hashErr) {
            console.error('Hashing Error:', hashErr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Password hashing failed' }));
          }

          connection_pool.query(
            'INSERT INTO Customers (name, phone, email, password) VALUES (?, ?, ?, ?)',
            [name, phone, email, hashedPassword],
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
      } catch (e) {
        console.error('JSON Parse Error:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
      }
    });
    return;
  }

// ---------- CUSTOMER: Login with session ----------
if (req.method === 'POST' && req.url === '/api/login') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { email, password } = JSON.parse(body);
      connection_pool.query(
        'SELECT customer_id, name, email, password FROM Customers WHERE email = ? LIMIT 1',
        [email],
        (err, rows) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }
          if (rows.length !== 1) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
          }

          const user = rows[0];
          bcrypt.compare(password, user.password, (cmpErr, match) => {
            if (cmpErr) {
              console.error('Compare Error:', cmpErr);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, message: 'Error checking password' }));
            }

            if (!match) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
            }

            delete user.password;

            // Create session token - FIX: Use cust_session consistently
            const token = randomBytes(16).toString('hex');
            customerSessions[token] = {
              id: user.customer_id,
              name: user.name,
              email: user.email,
              createdAt: Date.now()
            };

            res.writeHead(200, {
              'Content-Type': 'application/json',
              // FIX: Use cust_session and clear any existing session cookie
              'Set-Cookie': [
                `cust_session=${token}; HttpOnly; Path=/; Max-Age=86400`,
                `session=; HttpOnly; Path=/; Max-Age=0` // Clear employee session
              ]
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, user }));
          });
        }
      );
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
    }
  });
  return;
}

// ---------- CUSTOMER: Logout ----------
if (req.method === 'POST' && req.url === '/api/logout') {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/cust_session=([a-f0-9]+)/);
  if (match) delete customerSessions[match[1]];

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': 'cust_session=; HttpOnly; Path=/; Max-Age=0'
  });
  res.end(JSON.stringify({ success: true }));
  return;
}

  // ---------- EMPLOYEE: Create Order (manual entry) ----------
/*
  if (req.method === 'POST' && req.url === '/api/employee/createOrder') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { customer_id = null, item_id, quantity } = JSON.parse(body);

        if (!item_id || !quantity) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Missing fields' }));
        }

        const sql = `
          INSERT INTO Orders (customer_id, item_id, quantity, status)
          VALUES (?, ?, ?, 'Pending')
        `;

        connection_pool.query(sql, [customer_id, item_id, quantity], (err) => {
          if (err) {
            console.error('DB Insert Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Order created successfully' }));
        });

      } catch (e) {
        console.error('JSON Parse Error:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
      }
    });
    return;
  }
*/

if (req.method === 'POST' && req.url === '/api/employee/createOrder') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { customer_id = null, items } = JSON.parse(body);

      if (!items || !items.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Missing items' }));
      }

      // Start transaction
      connection_pool.getConnection((err, connection) => {
        if (err) return resError(500, 'Database connection error', err);

        connection.beginTransaction(err => {
          if (err) {
            connection.release();
            return resError(500, 'Transaction start error', err);
          }

          // Insert order
          const sqlOrder = 'INSERT INTO Orders (customer_id, status) VALUES (?, "Pending")';
          connection.query(sqlOrder, [customer_id], (err, result) => {
            if (err) {
              return connection.rollback(() => {
                connection.release();
                resError(500, 'Database error creating order', err);
              });
            }

            const orderId = result.insertId;

            const itemIds = items.map(i => i.item_id);
              connection.query(
               'SELECT item_id, price FROM Menu WHERE item_id IN (?)',
               [itemIds],
              (err, dbItems) => {
                if (err) {
                  return connection.rollback(() => {
                    connection.release();
                    resError(500, 'Database error fetching item prices', err);
                  });
                }

                // Map prices to the items sent
                const values = items.map(i => {
                  const dbItem = dbItems.find(db => db.item_id === i.item_id);
                  if (!dbItem) {
                    throw new Error(`Item ID ${i.item_id} not found`);
                  }
                  return [orderId, i.item_id, i.quantity, dbItem.price];
                });

                // Insert into OrderItems
                connection.query(
                  'INSERT INTO OrderItems (order_id, item_id, quantity, price) VALUES ?',
                  [values],
                  (err) => {
                    if (err) {
                      return connection.rollback(() => {
                        connection.release();
                        resError(500, 'Database error creating order items', err);
                      });
                    }

                    // Commit transaction
                    connection.commit(err => {
                      if (err) {
                        return connection.rollback(() => {
                          connection.release();
                          resError(500, 'Transaction commit error', err);
                        });
                      }

                      connection.release();
                      res.writeHead(200, { 'Content-Type': 'application/json' });
                      res.end(JSON.stringify({ success: true, message: 'Order created successfully', order_id: orderId }));
                    });
                  }
                );
              }
            );
          });
        });
      });

    } catch (e) {
      console.error('JSON Parse or Logic Error:', e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: e.message || 'Invalid JSON' }));
    }
  });

  return;
}


 
  // ---------- EMPLOYEE: Fetch all pending orders ----------
/*  if (req.method === 'GET' && req.url === '/api/orders/pending') {
    const sql = `
      SELECT order_id, customer_id, item_id,  quantity, status, order_time
      FROM Orders
      WHERE status = 'Pending'
      ORDER BY order_time DESC
    `;
    connection_pool.query(sql, (err, rows) => {
      if (err) {
        console.error('DB Fetch Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Database error' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, orders: rows }));
    });
    return;
  }
*/

  if (req.method === 'GET' && req.url === '/api/orders/pending') {
  const sql = `
    SELECT 
      o.order_id,
      o.customer_id,
      o.status,
      o.order_time,
      COALESCE(c.name, 'Walk-in') AS customer_name,
      oi.item_id,
      oi.quantity,
      m.item_name
    FROM Orders o
    LEFT JOIN Customers c ON o.customer_id = c.customer_id
    LEFT JOIN OrderItems oi ON o.order_id = oi.order_id
    LEFT JOIN Menu m ON oi.item_id = m.item_id
    WHERE o.status = 'Pending'
    ORDER BY o.order_time DESC
  `;

  connection_pool.query(sql, (err, rows) => {
    if (err) {
      console.error('DB Fetch Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Database error' }));
    }

    // Group items by order_id
    const orders = [];
    const map = {};

    rows.forEach(row => {
      if (!map[row.order_id]) {
        map[row.order_id] = {
          order_id: row.order_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          status: row.status,
          order_time: row.order_time,
          items: []
        };
        orders.push(map[row.order_id]);
      }

      if (row.item_id) {
        map[row.order_id].items.push({
          item_id: row.item_id,
          item_name: row.item_name,
          quantity: row.quantity
        });
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, orders }));
  });
  return;
}




   // ---------- Public: Fetch available menu items (for customers & employees) ----------
   if (req.method === 'GET' && req.url === '/api/menu') {
    const sql = 'SELECT * FROM Menu WHERE available = 1 OR available IS NULL';
    connection_pool.query(sql, (err, rows) => {
      if (err) {
        console.error('DB Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Database error' }));
      }
      const items = rows.map(item => ({
      ...item,
      image: item.image ? `/${item.image}` : '/image/no_image.png'
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, items}));
    });
    return;
  }

// ---------- CUSTOMER: Checkout ----------

// ---------- CUSTOMER: Checkout ----------
if (req.method === 'POST' && req.url === '/api/checkout') {
  let body = '';

  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { customer, items } = JSON.parse(body);

      if (!items || !items.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Cart is empty' }));
      }

      // Validate items
      for (const i of items) {
        if (!i.item_id || !i.quantity || i.quantity <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Invalid items' }));
        }
      }

      // Helper function for errors
      const resError = (code, message, err) => {
        if (err) console.error(err);
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message }));
      };

      // Check if customer exists
      connection_pool.query(
        'SELECT customer_id FROM Customers WHERE email = ? LIMIT 1',
        [customer.email],
        (err, rows) => {
          if (err) return resError(500, 'Database error checking customer', err);

          const proceedWithOrder = (customerId) => {
            connection_pool.getConnection((err, conn) => {
              if (err) return resError(500, 'Database connection error', err);

              conn.beginTransaction(err => {
                if (err) {
                  conn.release();
                  return resError(500, 'Failed to start transaction', err);
                }

                //Insert order
                const orderSQL = 'INSERT INTO Orders (customer_id, status) VALUES (?, "Pending")';
                conn.query(orderSQL, [customerId], (err, result) => {
                  if (err) return conn.rollback(() => resError(500, 'Failed to create order', err));

                  const orderId = result.insertId;

                  // Fetch item prices from Menu table
                  const itemIds = items.map(i => i.item_id);
                  conn.query(
                    'SELECT item_id, price FROM Menu WHERE item_id IN (?)',
                    [itemIds],
                    (err, itemRows) => {
                      if (err) return conn.rollback(() => resError(500, 'Failed to fetch item prices', err));

                      const priceMap = {};
                      itemRows.forEach(r => priceMap[r.item_id] = r.price);

                      const orderItemsValues = [];

                      for (const i of items) {
                        if (priceMap[i.item_id] === undefined) {
                          return conn.rollback(() => resError(400, `Item not found: ${i.item_id}`));
                        }
                        const price = priceMap[i.item_id];
                        orderItemsValues.push([orderId, i.item_id, i.quantity, price]);
                      }

                      // Insert order items
                      const orderItemsSQL = 'INSERT INTO OrderItems (order_id, item_id, quantity, price) VALUES ?';
                      conn.query(orderItemsSQL, [orderItemsValues], (err) => {
                        if (err) return conn.rollback(() => resError(500, 'Failed to insert order items', err));

                        // Commit transaction
                        conn.commit(err => {
                          if (err) return conn.rollback(() => resError(500, 'Failed to commit transaction', err));

                          res.writeHead(200, { 'Content-Type': 'application/json' });
                          res.end(JSON.stringify({
                            success: true,
                            message: 'Order placed successfully!',
                            order_id: orderId
                          }));

                          conn.release();
                        });
                      });
                    }
                  );
                });
              });
            });
          };

          // Customer exists?
          if (rows.length > 0) {
            proceedWithOrder(rows[0].customer_id);
          } else {
            // Create new customer first
            const insertCustomerSQL = 'INSERT INTO Customers (name, email, phone) VALUES (?, ?, ?)';
            connection_pool.query(
              insertCustomerSQL,
              [customer.name, customer.email, customer.phone || null],
              (err, result) => {
                if (err) return resError(500, 'Database error creating customer', err);
                proceedWithOrder(result.insertId);
              }
            );
          }
        }
      );

    } catch (e) {
      console.error('Checkout Parse Error:', e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
    }
  });
}













/*if (req.method === 'POST' && req.url === '/api/checkout') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { customer, items } = JSON.parse(body);

      if (!items || !items.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Cart is empty' }));
      }

      // Check if customer exists by email
      connection_pool.query(
        'SELECT customer_id FROM Customers WHERE email = ? LIMIT 1',
        [customer.email],
        (err, rows) => {
          if (err) {
            console.error('DB Error (customer check):', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }
          const createOrder = (customerId) => {

            // 1. Create ONE order in Orders
            const orderSQL = 'INSERT INTO Orders (customer_id, status) VALUES (?, "Pending")';
            connection_pool.query(orderSQL, [customerId], (err2, result) => {
              if (err2) {
                console.error('DB Error (insert order):', err2);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Database error creating order' }));
              }

              const orderId = result.insertId;

              // 2. Insert items into OrderItems
              const values = items.map(i => [orderId, i.item_id, i.quantity,i.price]);

              connection_pool.query(
               // 'INSERT INTO OrderItems (order_id, item_id, quantity) VALUES ?',
                'INSERT INTO OrderItems (order_id, item_id, quantity, price) VALUES ?',
                [values],
                (err3) => {
                  if (err3) {
                    console.error('DB Error (insert order items):', err3);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, message: 'Failed to save order items' }));
                  }

                  // Success
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    success: true,
                    message: 'Order placed successfully!',
                    order_id: orderId
                  }));
                }
              );
            });
          };

          if (rows.length > 0) {
            // Customer exists
            createOrder(rows[0].customer_id);
          } else {
            // Create new customer first
            const insertCustomerSQL = 'INSERT INTO Customers (name, email, phone) VALUES (?, ?, ?)';
            connection_pool.query(insertCustomerSQL, [customer.name, customer.email, customer.phone || null], (err3, result) => {
              if (err3) {
                console.error('DB Error (insert customer):', err3);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Database error creating customer' }));
              }
              createOrder(result.insertId);
            });
          }
        }
      );

    } catch (e) {
      console.error('Checkout Parse Error:', e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
    }
  });
  return;
}          

*/

          /*
          const createOrder = (customerId) => {
            // Insert all items into Orders table
            const values = items.map(i => [customerId, i.item_id, i.quantity, 'Pending']);
            connection_pool.query(
              'INSERT INTO Orders (customer_id, item_id, quantity, status) VALUES ?',
              [values],
              (err2) => {
                if (err2) {
                  console.error('DB Error (insert orders):', err2);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  return res.end(JSON.stringify({ success: false, message: 'Database error' }));
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Order placed successfully!' }));
              }
            );
          };

          if (rows.length > 0) {
            // Customer exists
            createOrder(rows[0].customer_id);
          } else {
            // Create new customer first
            const insertCustomerSQL = 'INSERT INTO Customers (name, email, phone) VALUES (?, ?, ?)';
            connection_pool.query(insertCustomerSQL, [customer.name, customer.email, customer.phone || null], (err3, result) => {
              if (err3) {
                console.error('DB Error (insert customer):', err3);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Database error creating customer' }));
              }
              createOrder(result.insertId);
            });
          }
        }
      );

    } catch (e) {
      console.error('Checkout Parse Error:', e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
    }
  });
  return;
}
*/



// ---------- CUSTOMER: Fetch their orders ----------
/*
if (req.method === 'POST' && req.url === '/api/orders/customer') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { email } = JSON.parse(body);

      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Email required' }));
      }

      const sql = `
        SELECT o.order_id, m.item_name, o.quantity AS quantity, o.status, o.order_time
        FROM Orders o
        JOIN Menu m ON o.item_id = m.item_id
        JOIN Customers c ON o.customer_id = c.customer_id
        WHERE c.email = ?
        ORDER BY o.order_time DESC
      `;

      connection_pool.query(sql, [email], (err, orders) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Database error' }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, orders }));
      });
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
    }
  });
  return;
}
*/
if (req.method === 'POST' && req.url === '/api/orders/customer') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { email } = JSON.parse(body);

      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Email required' }));
      }

      // Get orders and their items
      const sql = `
        SELECT 
         o.order_id, 
         o.status,
         o.order_time, 
         oi.item_id, 
         oi.quantity, 
         m.item_name
      FROM Orders o
      JOIN OrderItems oi ON o.order_id = oi.order_id
      JOIN Menu m ON oi.item_id = m.item_id
      JOIN Customers c ON o.customer_id = c.customer_id
      WHERE c.email = ?
      ORDER BY o.order_id DESC
      `;

      connection_pool.query(sql, [email], (err, rows) => {
        if (err) {
          console.error('DB Error (fetch orders):', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Database error' }));
        }

        // Group items by order_id
        const orders = [];
        const map = {};

        rows.forEach(row => {
          if (!map[row.order_id]) {
            map[row.order_id] = { order_id: row.order_id, status: row.status, order_time: row.order_time, items: [] };
            orders.push(map[row.order_id]);
          }
          map[row.order_id].items.push({
            item_id: row.item_id,
            item_name: row.item_name,
            quantity: row.quantity
          });
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, orders }));
      });

    } catch (e) {
      console.error('Parse Error:', e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
    }
  });
  return;
}







// ---------- UPDATE ORDER STATUS ----------
if (req.method === 'PUT' && req.url === '/api/orders/updateStatus') {
  let body = '';
  req.on('data', chunk => body += chunk);

  req.on('end', () => {
    try {
      const { order_id, status } = JSON.parse(body);

      if (!order_id || !status) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          message: 'Missing order_id or status'
        }));
      }

      const sql = `UPDATE Orders SET status = ? WHERE order_id = ?`;

      connection_pool.query(sql, [status, order_id], (err) => {
        if (err) {
          console.error('DB Error updateStatus:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            message: 'Database error'
          }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Order status updated'
        }));
      });

    } catch (err) {
      console.error("JSON Error:", err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: 'Invalid JSON'
      }));
    }
  });
  return;
}



// ---------- QR: Static PNG for this restaurant’s customer_main ----------
if (req.method === 'GET' && (reqPath === '/qr.png' || reqPath === '/qr')) {
  QRCode.toBuffer(
    PUBLIC_CUSTOMER_URL,
    { type: 'png', width: 512, margin: 1, errorCorrectionLevel: 'M' },
    (err, buffer) => {
      if (err) {
        console.error('QR gen error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('QR generation error');
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable' // cache forever
      });
      res.end(buffer);
    }
  );
  return;
}


// ---------- EMPLOYEE: Fetch active orders (Pending + In Progress) ----------
/* if (req.method === 'GET' && req.url === '/api/orders/active') {
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
  connection_pool.query(sql, (err, rows) => {
    if (err) {
      console.error('DB Fetch Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, orders: rows }));
  });
  return;
}
*/


// ---------- EMPLOYEE: Fetch active orders (Pending + In Progress) ----------
if (req.method === 'GET' && req.url === '/api/orders/active') {
  const sql = `
    SELECT
      o.order_id,
      o.customer_id,
      o.status,
      o.order_time,
      COALESCE(c.name, 'Walk-in') AS customer_name,
      oi.item_id,
      oi.quantity,
      m.item_name
    FROM Orders o
    LEFT JOIN Customers c ON o.customer_id = c.customer_id
    LEFT JOIN OrderItems oi ON o.order_id = oi.order_id
    LEFT JOIN Menu m ON oi.item_id = m.item_id
    WHERE o.status IN ('Pending', 'In Progress')
    ORDER BY o.order_time DESC
  `;

  connection_pool.query(sql, (err, rows) => {
    if (err) {
      console.error('DB Fetch Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false }));
    }

    // Group items by order
    const orders = [];
    const map = {};

    rows.forEach(row => {
      if (!map[row.order_id]) {
        map[row.order_id] = {
          order_id: row.order_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          status: row.status,
          order_time: row.order_time,
          items: []
        };
        orders.push(map[row.order_id]);
      }

      if (row.item_id) {
        map[row.order_id].items.push({
          item_id: row.item_id,
          item_name: row.item_name,
          quantity: row.quantity
        });
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, orders }));
  });
  return;
}



  // ---------- Static file handler ----------
  let filePath = path.join(baseDir, 'public_html', reqPath.replace(/^\/+/, ''));

  // Allow serving images and Employee HTML under public_html
  if (
    reqPath.startsWith('/image/') ||
    reqPath.startsWith('/Employee/') ||
    reqPath.endsWith('.html') ||
    reqPath.endsWith('.css') ||
    reqPath.endsWith('.js') ||
    reqPath.match(/\.(jpg|jpeg|png|gif|mp3|ico)$/)
  ) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.mp3': 'audio/mpeg',
      '.ico': 'image/x-icon'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        console.error('Static file error:', err);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - File Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
    return;
  }
});



// Run server on port 80
server.listen(80, () => console.log(' Server running on port 80'));
