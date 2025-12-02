# CSC400-Project
Overview  
This project is a full-stack Restaurant Ordering System designed to streamline the ordering process for customers and restaurant staff. It supports menu browsing, online ordering, secure payments, real-time order tracking, and automated email notifications. The platform includes: 

      Customer Interface – Mobile-friendly pages for browsing menus, managing carts, and completing orders. 

      Employee Dashboard – Real-time order management with status updates and notifications. 

      Admin Dashboard – Tools for menu management, employee accounts, and dynamic sales reports with charts. 

Key features include secure authentication, Stripe payment integration, and a MySQL database for structured data storage. The system is built using a modular architecture with Node.js, Express.js, and React.js, styled with Tailwind CSS, and organized for maintainability and scalability. 

Installation & Setup 

Follow these steps to set up and run the Restaurant Ordering System locally: 

1. Clone the Repository: using git clone  		https://github.com/MartinShawn03/CSC400-Project.git 

2. Install Dependencies: Install all required packages for both the backend and 	frontend using npm install command. 

3. Configure Environment Variables (.env): Create a .env file in the backend 	directory and add the following: 

    STRIPE_SECRET_KEY=<your-stripe-secret-key>  

    EMAIL_USER=<your-gmail-address>  

    EMAIL_PASS=<your-gmail-app-password> 

4. Set Up the Database: Install MySQL and create a database using the provided 	schema. 

5. Start the Backend Server: navigate to the server.js file to run the server. 

6. Access the Application: Open the customer interface in your browser or scan 	the QR code provided. Use admin and employee credentials to log in to their 	respective dashboards. 

Usage Instructions 

Customer:  

1. Open the homepage or scan the QR code provided by the restaurant. 

2. Browse food categories and view item details (images, prices, descriptions). 

3. Add items to the shopping cart and review your order. 

4. Proceed to checkout and pay securely using Stripe. 

5. Receive an order confirmation email immediately after payment. 

6. Track order status updates via automated email notifications until completion. 

 

Employee: 

1. Log in using your employee credentials. 

2. Access the Order Management Dashboard to view incoming orders in real time. 

3. Update order statuses (e.g., Pending, In-Progress, Completed) to keep customers informed. 

4. Ensure smooth workflow by prioritizing and processing orders efficiently. 



Admin: 

1. Log in using admin credentials. 

2. Manage menu items (add, edit, delete) and upload images. 

3. Create and manage employee accounts securely. 

4. Generate sales reports and analytics with dynamic charts for 			performance insights. 

 

Code Module 

The Restaurant Ordering System is organized into modular components to ensure maintainability, scalability, and clarity. Below is a brief introduction to the major code modules: 

Frontend Modules (React.js) 

Customer Interface Components: Includes pages for Menu, Cart, Checkout, and Order History. Each component handles its own state and interact with backend APIs for dynamic data updates. 

Employee Dashboard Components: Displays real-time orders and allows status updates. Built with reusable UI elements for consistency. 

Admin Dashboard Components: Provides tools for menu management, employee accounts, and analytics reports. Uses Chart.js for dynamic graph rendering. 

Backend Modules (Node.js & Express.js) 

API Routes: Organized by feature (e.g., /orders, /menu, /auth). Each route handles CRUD operations and business logic for its respective domain. 

Authentication Module: Implements secure login for customers, employees, and admins using hashed passwords and session tokens. 

Payment Module: Integrates Stripe API for secure payment processing and updates order status upon successful transactions. 

Email Notification Module: Uses Nodemailer with Gmail SMTP to send order confirmations and status updates automatically. 

Database Layer (MySQL) 

Schema Design: Tables for Customers, Employees, Orders, OrderItems, Menu, and Payments. Relationships follow the ER diagram for data integrity. 

Data Access Layer: SQL queries and stored procedures for efficient data retrieval, especially for admin reports and analytics. 

Utility Modules 

QR Code Generator: Creates static and dynamic QR codes for customer access. 

Report Generator: Prepares summarized data for charts using SQL aggregation before sending it to the frontend. 
