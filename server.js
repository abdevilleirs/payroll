const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
// Removed tax rate - no tax calculations needed
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize data file if it doesn't exist
function initializeDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      employees: [],
      payrolls: [],
      nextEmployeeId: 1,
      nextPayrollId: 1
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Read data from JSON file
function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data file:', error);
    return { employees: [], payrolls: [], nextEmployeeId: 1, nextPayrollId: 1 };
  }
}

// Write data to JSON file
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing data file:', error);
    return false;
  }
}

// Authentication middleware for protected routes
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token || token !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Valid API key required.' });
  }
  next();
}

// Utility function to calculate net pay (no taxes)
function calculatePayroll(grossPay, deductions = 0) {
  const netPay = grossPay - deductions;
  return { netPay };
}

// Routes

// GET / - Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// GET /api/employees - List all employees (public)
app.get('/api/employees', (req, res) => {
  const data = readData();
  res.json(data.employees);
});

// POST /api/employees - Add new employee (protected)
app.post('/api/employees', authenticateAdmin, (req, res) => {
  const { employee_code, first_name, last_name, designation, department, email, bank_account, salary } = req.body;

  // Validation
  if (!employee_code || !first_name || !last_name || !designation || !department || !email || !bank_account || !salary) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (isNaN(salary) || salary <= 0) {
    return res.status(400).json({ error: 'Salary must be a positive number' });
  }

  const data = readData();

  // Check for duplicate employee code
  const existingEmployee = data.employees.find(emp => emp.employee_code === employee_code);
  if (existingEmployee) {
    return res.status(400).json({ error: 'Employee code already exists' });
  }

  const newEmployee = {
    id: data.nextEmployeeId,
    employee_code,
    first_name,
    last_name,
    designation,
    department,
    email,
    bank_account,
    salary: parseFloat(salary),
    created_at: new Date().toISOString()
  };

  data.employees.push(newEmployee);
  data.nextEmployeeId++;

  if (writeData(data)) {
    res.status(201).json(newEmployee);
  } else {
    res.status(500).json({ error: 'Failed to save employee data' });
  }
});

// GET /api/payrolls - List all payroll entries (public)
app.get('/api/payrolls', (req, res) => {
  const data = readData();
  res.json(data.payrolls);
});

// POST /api/payrolls - Create payroll entry (protected)
app.post('/api/payrolls', authenticateAdmin, (req, res) => {
  const { employee_id, pay_period_start, pay_period_end, gross_pay, deductions = 0 } = req.body;

  // Validation
  if (!employee_id || !pay_period_start || !pay_period_end || !gross_pay) {
    return res.status(400).json({ error: 'employee_id, pay_period_start, pay_period_end, and gross_pay are required' });
  }

  if (isNaN(gross_pay) || gross_pay <= 0) {
    return res.status(400).json({ error: 'Gross pay must be a positive number' });
  }

  if (isNaN(deductions) || deductions < 0) {
    return res.status(400).json({ error: 'Deductions must be a non-negative number' });
  }

  const data = readData();

  // Check if employee exists
  const employee = data.employees.find(emp => emp.id === parseInt(employee_id));
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const { netPay } = calculatePayroll(parseFloat(gross_pay), parseFloat(deductions));

  const newPayroll = {
    id: data.nextPayrollId,
    employee_id: parseInt(employee_id),
    pay_period_start,
    pay_period_end,
    gross_pay: parseFloat(gross_pay),
    deductions: parseFloat(deductions),
    net_pay: parseFloat(netPay.toFixed(2)),
    created_at: new Date().toISOString()
  };

  data.payrolls.push(newPayroll);
  data.nextPayrollId++;

  if (writeData(data)) {
    res.status(201).json(newPayroll);
  } else {
    res.status(500).json({ error: 'Failed to save payroll data' });
  }
});

// GET /api/payslip/:payroll_id - Get payslip with employee info (public)
app.get('/api/payslip/:payroll_id', (req, res) => {
  const payrollId = parseInt(req.params.payroll_id);
  const data = readData();

  const payroll = data.payrolls.find(p => p.id === payrollId);
  if (!payroll) {
    return res.status(404).json({ error: 'Payroll entry not found' });
  }

  const employee = data.employees.find(emp => emp.id === payroll.employee_id);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found for this payroll entry' });
  }

  const payslip = {
    payroll: payroll,
    employee: {
      id: employee.id,
      employee_code: employee.employee_code,
      first_name: employee.first_name,
      last_name: employee.last_name,
      designation: employee.designation,
      department: employee.department,
      email: employee.email,
      bank_account: employee.bank_account
    }
  };

  res.json(payslip);
});

// DELETE /api/employees/:id - Delete employee (protected)
app.delete('/api/employees/:id', authenticateAdmin, (req, res) => {
  const employeeId = parseInt(req.params.id);
  const data = readData();

  const employeeIndex = data.employees.findIndex(emp => emp.id === employeeId);
  if (employeeIndex === -1) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  // Remove employee and their payroll entries
  data.employees.splice(employeeIndex, 1);
  data.payrolls = data.payrolls.filter(p => p.employee_id !== employeeId);

  if (writeData(data)) {
    res.json({ message: 'Employee and associated payroll entries deleted successfully' });
  } else {
    res.status(500).json({ error: 'Failed to delete employee data' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize data file and start server
initializeDataFile();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Payroll server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Admin API key configured: ${ADMIN_KEY ? 'Yes' : 'No'}`);
});
