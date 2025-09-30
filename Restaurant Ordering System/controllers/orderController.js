// Restaurant Ordering System/controllers/orderController.js
const pool = require("../db/connection");

/**
 * GET /api/orders?restaurant_id=1
 * Returns all orders for a restaurant (newest first) with their items.
 * Optional filters to extend later: status, since, limit, etc.
 */
exports.getOrdersByRestaurant = async (req, res) => {
  const { restaurant_id } = req.query;
  if (!restaurant_id) {
    return res.status(400).json({ error: "restaurant_id is required" });
  }

  try {
    const [orders] = await pool.query(
      `
      SELECT
        o.order_id,
        o.status,
        o.payment_status,
        o.created_at,
        o.updated_at,
        o.employee_id,
        e.employee_name,
        c.customer_id,
        c.username AS customer_name
      FROM orders o
      JOIN customer c ON o.customer_id = c.customer_id
      LEFT JOIN employee e ON o.employee_id = e.employee_id
      WHERE o.restaurant_id = ?
      ORDER BY o.created_at DESC
      `,
      [restaurant_id]
    );

    // attach items for each order
    // (You can replace this per-order query with a single join/group if needed later)
    for (const order of orders) {
      const [items] = await pool.query(
        `
        SELECT
          m.item_name,
          oi.quantity,
          oi.price
        FROM order_items oi
        JOIN menu m ON oi.item_id = m.item_id
        WHERE oi.order_id = ?
        `,
        [order.order_id]
      );
      order.items = items;
    }

    res.json(orders);
  } catch (err) {
    console.error("getOrdersByRestaurant error:", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * GET /api/orders/:id
 * Returns a single order with items.
 */
exports.getOrderById = async (req, res) => {
  const orderId = req.params.id;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        o.order_id,
        o.status,
        o.payment_status,
        o.created_at,
        o.updated_at,
        o.employee_id,
        e.employee_name,
        o.restaurant_id,
        c.customer_id,
        c.username AS customer_name
      FROM orders o
      JOIN customer c ON o.customer_id = c.customer_id
      LEFT JOIN employee e ON o.employee_id = e.employee_id
      WHERE o.order_id = ?
      `,
      [orderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = rows[0];

    const [items] = await pool.query(
      `
      SELECT
        m.item_name,
        oi.quantity,
        oi.price
      FROM order_items oi
      JOIN menu m ON oi.item_id = m.item_id
      WHERE oi.order_id = ?
      `,
      [orderId]
    );

    order.items = items;

    res.json(order);
  } catch (err) {
    console.error("getOrderById error:", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * PATCH /api/orders/:id/take
 * Body: { employee_id: number }
 * Sets status = 'in_progress' and assigns the employee,
 * but ONLY if the order is currently 'pending'.
 */
exports.takeOrder = async (req, res) => {
  const orderId = req.params.id;
  const { employee_id } = req.body;

  if (!employee_id) {
    return res.status(400).json({ error: "employee_id is required" });
  }

  try {
    const [result] = await pool.query(
      `
      UPDATE orders
      SET status = 'in_progress',
          employee_id = ?
      WHERE order_id = ?
        AND status = 'pending'
      `,
      [employee_id, orderId]
    );

    if (result.affectedRows === 0) {
      // Either order doesn't exist or not in 'pending' state
      return res.status(409).json({
        error: "Order not found or not in 'pending' state",
      });
    }

    res.json({
      message: "Order taken",
      order_id: Number(orderId),
      employee_id: Number(employee_id),
    });
  } catch (err) {
    console.error("takeOrder error:", err);
    res.status(500).json({ error: "Database error" });
  }
};

/**
 * PATCH /api/orders/:id/complete
 * Body: { employee_id: number } (optional, can be ignored if already assigned)
 * Sets status = 'completed' but ONLY if the order is currently 'in_progress'.
 */
exports.completeOrder = async (req, res) => {
  const orderId = req.params.id;

  try {
    const [result] = await pool.query(
      `
      UPDATE orders
      SET status = 'completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
        AND status = 'in_progress'
      `,
      [orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        error: "Order not found or not in 'in_progress' state",
      });
    }

    res.json({
      message: `Order #${orderId} marked as completed`,
      order_id: Number(orderId),
    });
  } catch (err) {
    console.error("completeOrder error:", err);
    res.status(500).json({ error: "Database error" });
  }
};
