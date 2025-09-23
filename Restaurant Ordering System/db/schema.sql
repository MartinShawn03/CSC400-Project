-- Create the Database --
CREATE  DATABASE IF NOT EXITS ordering_system;

USE ordering_system

--Employee table for login
CREATE TABLE employee (
    employee_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    employee_dob DATE,

);

--Product table-- 