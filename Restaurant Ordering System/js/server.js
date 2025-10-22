const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const { randomBytes } = require('crypto');
const bcrypt = require('bcrypt');
const formidable = require('formidable');


const baseDir = path.resolve(__dirname, '..');

const connection_pool = mysql.createPool({
  host: '136.113.3.49',
  user: 'nodeuser',
  password: 'csc400',
  database: 'restaurant_db',
  connectionLimit: 10
});

// Simple in-memory session store
const sessions = {};

// Email domain validation function
  function validateEmailDomain(email) {
  const domain = email.split('@')[1];
  
  // Simple domain format check
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return {
      isValid: false,
      reason: 'Invalid domain format',
      details: `Domain '${domain}' is not properly formatted`
    };
  }

  // Common disposable email domains
  const disposableDomains = [
    'tempmail.com', 'throwaway.com', 'fake.com', 'guerrillamail.com',
    'mailinator.com', '10minutemail.com', 'yopmail.com', 'trashmail.com'
  ];
  
  if (disposableDomains.includes(domain)) {
    return {
      isValid: false,
      reason: 'Disposable email domain',
      details: 'Temporary/disposable email addresses are not allowed'
    };
  }

  return {
    isValid: true,
    reason: 'Email format and domain appear valid',
    details: `Domain '${domain}' is recognized and should be able to receive emails`
  };
}

// Password generation function
function generateSecurePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // Default landing
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  //  EMPLOYEE LOGIN
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
              'Set-Cookie': `session=${token}; HttpOnly; Path=/; Max-Age=3600`
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

  //  EMPLOYEE LOGOUT
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

  //  Protect employee_main.html
  if (reqPath === '/Employee/employee_main.html') {
    const token = (req.headers.cookie || '').match(/session=([a-f0-9]+)/)?.[1];
    if (!token || !sessions[token]) {
      res.writeHead(302, { Location: '/Employee/employee_login.html' });
      return res.end();
    }
  }

  //  Protect admin_main.html (Admin only)
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

<<<<<<< HEAD

//Email Validation
if (req.method === 'POST' && reqPath === '/Employee/validate-email') {
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
  req.on('end', async () => {
    try {
      const { email } = JSON.parse(body);

      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Email is required' }));
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Invalid email format' }));
      }

      // Check if email already exists in database
      const checkEmailSQL = 'SELECT employee_id FROM Employees WHERE email = ? LIMIT 1';
      connection_pool.query(checkEmailSQL, [email], (err, rows) => {
        if (err) {
          console.error('DB Error (email check):', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Database error during email check' }));
        }

        if (rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Email already registered in system' }));
        }

        // Domain validation
        const validationResult = validateEmailDomain(email);
        if (validationResult.isValid) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: 'Email is valid and can receive messages',
            details: validationResult
          }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            message: 'Email validation failed',
            details: validationResult
          }));
        }
      });

    } catch (e) {
      console.error('JSON Parse Error:', e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid JSON format' }));
    }
  });
  return;
}

// ADMIN: Register New Employee
if (req.method === 'POST' && reqPath === '/Employee/register') {
  // ADMIN: Register New Employee
  if (req.method === 'POST' && reqPath === '/Employee/register') {
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
      const { name, username, role, email, phone } = JSON.parse(body);

      if (!name || !username || !email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Missing required fields' }));
      }

      // Auto-generate secure password
      const generatedPassword = generateSecurePassword();

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

          // 🔹 Hash the auto-generated password before storing
          bcrypt.hash(generatedPassword, 10, (hashErr, hashedPassword) => {
            if (hashErr) {
              console.error('Hashing Error:', hashErr);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, message: 'Password hashing failed' }));
            }

            // Insert new employee with auto-generated hashed password
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

              // Return success with the generated password for display
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                success: true, 
                message: 'Employee registered successfully!',
                tempPassword: generatedPassword,
                note: 'Please provide this temporary password to the employee'
              }));
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
    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, username, password, role, email, phone } = JSON.parse(body);

        if (!name || !username || !password || !email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Missing required fields' }));
        }

        // 🔹 Hash password before storing
        bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
          if (hashErr) {
            console.error('Hashing Error:', hashErr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Password hashing failed' }));
          }

          const sql = 'INSERT INTO Employees (name, username, password, role, email, phone) VALUES (?, ?, ?, ?, ?, ?)';
          connection_pool.query(sql, [name, username, hashedPassword, role || 'Employee', email || null, phone || null], (err) => {
            if (err) {
              console.error('DB Insert Error:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, message: 'Database error' }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Employee added successfully!' }));
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

            // 🔹 Hash password before storing
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

  //  ADMIN: Get all employees
  if (req.method === 'GET' && reqPath === '/Employee/list') {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    const session = token ? sessions[token] : null;

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

  }

  //  ADMIN: Get all employees
  if (req.method === 'GET' && reqPath === '/Employee/list') {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    const session = token ? sessions[token] : null;

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

  //  ADMIN: Delete employee by ID
  if (req.method === 'DELETE' && reqPath.startsWith('/Employee/delete/')) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    const session = token ? sessions[token] : null;

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

  //  ADMIN: GET all menu items
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
>>>>>>> a278101 (fixed server.js merge)
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Database error' }));
      }

      if (result.affectedRows === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Employee not found' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Employee deleted successfully' }));
      res.end(JSON.stringify({ success: true, items: rows }));
    });
    return;
  }

  //  ADMIN: GET all menu items
  if (req.method === 'GET' && reqPath === '/Employee/menu') {
  //  ADMIN: Add new menu item
  if (req.method === 'POST' && reqPath === '/Employee/menu') {
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


//  ADMIN: Add new menu item (with image upload)
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



  //  ADMIN: Delete menu item
  if (req.method === 'DELETE' && reqPath.startsWith('/Employee/menu/')) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    const session = token ? sessions[token] : null;

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

    if (!session || String(session.role).toLowerCase() !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Admins only' }));
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { item_name, description, price, category } = JSON.parse(body);
        if (!item_name || !price) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Missing fields' }));
        }

        const sql = 'INSERT INTO Menu (item_name, description, price, category) VALUES (?, ?, ?, ?)';
        connection_pool.query(sql, [item_name, description, price, category], (err) => {
          if (err) {
            console.error('Insert Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Database error' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid request format' }));
      }
    });
    return;
  }

  // ADMIN: Toggle menu item availability (PUT /Employee/menu/:id)
  if (req.method === 'PUT' && reqPath.startsWith('/Employee/menu/')) {
  //  ADMIN: Delete menu item
  if (req.method === 'DELETE' && reqPath.startsWith('/Employee/menu/')) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    const session = token ? sessions[token] : null;

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

  // ADMIN: Toggle menu item availability (PUT /Employee/menu/:id)
  if (req.method === 'PUT' && reqPath.startsWith('/Employee/menu/')) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([a-f0-9]+)/);
    const token = match ? match[1] : null;
    const session = token ? sessions[token] : null;

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

  //  Customer registration and login
  if (req.method === 'POST' && req.url === '/api/register') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { name, phone, email, password } = JSON.parse(body);
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
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
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
    });
        );
      });
    });
    return;
  }


  if (req.method === 'POST' && req.url === '/api/login') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
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
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, user }));
          });
        }
      );
    });
    return;
  }

  // ✅ EMPLOYEE: Create Order (manual entry)
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
          INSERT INTO Orders (customer_id, item_id, quanity, status)
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

  // ✅ EMPLOYEE: Fetch all pending orders
  if (req.method === 'GET' && req.url === '/api/orders/pending') {
    const sql = `
      SELECT order_id, customer_id, item_id,  quantity, status, order_time
      SELECT order_id, customer_id, item_id, quanity AS quantity, status, order_time
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

  // ✅ Public: Fetch available menu items (for customers & employees)
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



  // Public: Fetch available menu items (for customers & employees)
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

  //  Static file handler (includes images and Employee folder)
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
server.listen(80, () => console.log(' Server running on port 80'));
