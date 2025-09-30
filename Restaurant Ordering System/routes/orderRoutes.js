// Restaurant Ordering System/routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const {
  getOrdersByRestaurant,
  getOrderById,
  takeOrder,
  completeOrder,
} = require("../controllers/orderController");

// LIST orders for a restaurant: GET /api/orders?restaurant_id=1
router.get("/", getOrdersByRestaurant);

// SINGLE order: GET /api/orders/:id
router.get("/:id", getOrderById);

// TAKE order: PATCH /api/orders/:id/take  { employee_id }
router.patch("/:id/take", takeOrder);

//COMPLETE order :pATCH
router.patch("/:id/complete", completeOrder);

module.exports = router;
