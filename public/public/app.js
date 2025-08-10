// Global state
let isAuthenticated = false;
let currentApiKey = '';
let employees = [];
let payrolls = [];

// DOM elements
const authToggle = document.getElementById('authToggle');
const authState = document.getElementById('authState');
const authIndicator = document.getElementById('authIndicator');
const messageDiv = document.getElementById('message');

// API base URL
const API_BASE = window.location.origin + '/api';

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeTabs();
    initializeAuth();
    initializeForms();
    loadInitialData();
});

// Tab management
function initializeTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            // Update active states
            navButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(tabName).classList.add('active');
            
            // Load tab-specific data
            if (tabName === 'payroll') {
                populateEmployeeSelect();
            } else if (tabName === 'payslips') {
                populatePayrollSelect();
            }
        });
    });
}

// Authentication management
function initializeAuth() {
    authToggle.addEventListener('click', () => {
        if (isAuthenticated) {
            logout();
        } else {
            promptForApiKey();
        }
    });
}

function promptForApiKey() {
    const apiKey = prompt('Enter Admin API Key:');
    if (apiKey) {
        currentApiKey = apiKey;
        isAuthenticated = true;
        updateAuthUI();
        showMessage('Logged in successfully', 'success');
    }
}

function logout() {
    isAuthenticated = false;
    currentApiKey = '';
    updateAuthUI();
    showMessage('Logged out successfully', 'info');
}

function updateAuthUI() {
    authState.textContent = isAuthenticated ? 'On' : 'Off';
    authToggle.textContent = isAuthenticated ? 'Logout' : 'Login';
    authIndicator.style.color = isAuthenticated ? '#38a169' : '#e53e3e';
}

// Form initialization
function initializeForms() {
    // Employee form
    const employeeForm = document.getElementById('employeeForm');
    employeeForm.addEventListener('submit', handleEmployeeSubmit);

    // Payroll form
    const payrollForm = document.getElementById('payrollForm');
    payrollForm.addEventListener('submit', handlePayrollSubmit);

    // Payroll select for payslips
    const payrollSelect = document.getElementById('payrollSelect');
    payrollSelect.addEventListener('change', handlePayslipView);
}

// API request helper
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    };

    // Add authorization header if authenticated and making write request
    if (isAuthenticated && (options.method === 'POST' || options.method === 'DELETE')) {
        config.headers.Authorization = `Bearer ${currentApiKey}`;
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API Request failed:', error);
        throw error;
    }
}

// Load initial data
async function loadInitialData() {
    await loadEmployees();
    await loadPayrolls();
}

// Employee management
async function loadEmployees() {
    try {
        const employeesListDiv = document.getElementById('employeesList');
        employeesListDiv.innerHTML = '<div class="loading" data-testid="loading-employees">Loading employees...</div>';

        employees = await apiRequest('/employees');
        displayEmployees(employees);
    } catch (error) {
        showMessage(`Failed to load employees: ${error.message}`, 'error');
        document.getElementById('employeesList').innerHTML = '<div class="no-data">Failed to load employees</div>';
    }
}

function displayEmployees(employeeList) {
    const employeesListDiv = document.getElementById('employeesList');
    
    if (employeeList.length === 0) {
        employeesListDiv.innerHTML = '<div class="no-data" data-testid="text-no-employees">No employees found</div>';
        return;
    }

    employeesListDiv.innerHTML = employeeList.map(employee => `
        <div class="employee-card" data-testid="card-employee-${employee.id}">
            <div class="employee-header">
                <div>
                    <div class="employee-name" data-testid="text-employee-name-${employee.id}">${employee.first_name} ${employee.last_name}</div>
                    <div class="employee-code" data-testid="text-employee-code-${employee.id}">${employee.employee_code}</div>
                </div>
                ${isAuthenticated ? `<button class="btn btn-danger btn-sm" onclick="deleteEmployee(${employee.id})" data-testid="button-delete-employee-${employee.id}">Delete</button>` : ''}
            </div>
            <div class="employee-details">
                <div class="detail-item">
                    <span class="detail-label">Designation:</span> <span data-testid="text-designation-${employee.id}">${employee.designation}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Department:</span> <span data-testid="text-department-${employee.id}">${employee.department}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Email:</span> <span data-testid="text-email-${employee.id}">${employee.email}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Bank Account:</span> <span data-testid="text-bank-account-${employee.id}">${employee.bank_account}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Salary:</span> <span class="amount positive" data-testid="text-salary-${employee.id}">$${employee.salary.toLocaleString()}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function handleEmployeeSubmit(e) {
    e.preventDefault();
    
    if (!isAuthenticated) {
        showMessage('Please login to add employees', 'error');
        return;
    }

    const formData = new FormData(e.target);
    const employeeData = Object.fromEntries(formData.entries());

    try {
        const newEmployee = await apiRequest('/employees', {
            method: 'POST',
            body: JSON.stringify(employeeData)
        });

        employees.push(newEmployee);
        displayEmployees(employees);
        e.target.reset();
        showMessage('Employee added successfully', 'success');
    } catch (error) {
        showMessage(`Failed to add employee: ${error.message}`, 'error');
    }
}

async function deleteEmployee(employeeId) {
    if (!isAuthenticated) {
        showMessage('Please login to delete employees', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this employee? This will also delete all their payroll records.')) {
        return;
    }

    try {
        await apiRequest(`/employees/${employeeId}`, {
            method: 'DELETE'
        });

        employees = employees.filter(emp => emp.id !== employeeId);
        displayEmployees(employees);
        showMessage('Employee deleted successfully', 'success');
    } catch (error) {
        showMessage(`Failed to delete employee: ${error.message}`, 'error');
    }
}

// Payroll management
async function loadPayrolls() {
    try {
        const payrollsListDiv = document.getElementById('payrollsList');
        payrollsListDiv.innerHTML = '<div class="loading" data-testid="loading-payrolls">Loading payrolls...</div>';

        payrolls = await apiRequest('/payrolls');
        displayPayrolls(payrolls);
    } catch (error) {
        showMessage(`Failed to load payrolls: ${error.message}`, 'error');
        document.getElementById('payrollsList').innerHTML = '<div class="no-data">Failed to load payrolls</div>';
    }
}

function displayPayrolls(payrollList) {
    const payrollsListDiv = document.getElementById('payrollsList');
    
    if (payrollList.length === 0) {
        payrollsListDiv.innerHTML = '<div class="no-data" data-testid="text-no-payrolls">No payroll entries found</div>';
        return;
    }

    payrollsListDiv.innerHTML = payrollList.map(payroll => {
        const employee = employees.find(emp => emp.id === payroll.employee_id);
        const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown Employee';
        
        return `
            <div class="payroll-card" data-testid="card-payroll-${payroll.id}">
                <div class="payroll-header">
                    <div>
                        <div class="payroll-title" data-testid="text-payroll-employee-${payroll.id}">${employeeName}</div>
                        <div class="detail-item" data-testid="text-payroll-period-${payroll.id}">
                            <span class="detail-label">Period:</span> ${payroll.pay_period_start} to ${payroll.pay_period_end}
                        </div>
                    </div>
                </div>
                <div class="payroll-details">
                    <div class="detail-item">
                        <span class="detail-label">Gross Pay:</span> <span class="amount positive" data-testid="text-gross-pay-${payroll.id}">$${payroll.gross_pay.toLocaleString()}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Deductions:</span> <span class="amount negative" data-testid="text-deductions-${payroll.id}">-$${payroll.deductions.toLocaleString()}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Net Pay:</span> <span class="amount positive" data-testid="text-net-pay-${payroll.id}">$${payroll.net_pay.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function populateEmployeeSelect() {
    const employeeSelect = document.getElementById('employeeSelect');
    employeeSelect.innerHTML = '<option value="">Choose an employee...</option>';
    
    employees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = `${employee.first_name} ${employee.last_name} (${employee.employee_code})`;
        option.setAttribute('data-testid', `option-employee-${employee.id}`);
        employeeSelect.appendChild(option);
    });
}

async function handlePayrollSubmit(e) {
    e.preventDefault();
    
    if (!isAuthenticated) {
        showMessage('Please login to create payroll entries', 'error');
        return;
    }

    const formData = new FormData(e.target);
    const payrollData = Object.fromEntries(formData.entries());

    try {
        const newPayroll = await apiRequest('/payrolls', {
            method: 'POST',
            body: JSON.stringify(payrollData)
        });

        payrolls.push(newPayroll);
        displayPayrolls(payrolls);
        e.target.reset();
        showMessage('Payroll entry created successfully', 'success');
    } catch (error) {
        showMessage(`Failed to create payroll entry: ${error.message}`, 'error');
    }
}

// Payslip management
function populatePayrollSelect() {
    const payrollSelect = document.getElementById('payrollSelect');
    payrollSelect.innerHTML = '<option value="">Choose a payroll entry...</option>';
    
    payrolls.forEach(payroll => {
        const employee = employees.find(emp => emp.id === payroll.employee_id);
        const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown Employee';
        
        const option = document.createElement('option');
        option.value = payroll.id;
        option.textContent = `${employeeName} - ${payroll.pay_period_start} to ${payroll.pay_period_end}`;
        option.setAttribute('data-testid', `option-payroll-${payroll.id}`);
        payrollSelect.appendChild(option);
    });
}

async function handlePayslipView(e) {
    const payrollId = e.target.value;
    const payslipDisplay = document.getElementById('payslipDisplay');
    
    if (!payrollId) {
        payslipDisplay.innerHTML = '<div class="no-data" data-testid="text-no-payslip">Select a payroll entry to view the payslip</div>';
        return;
    }

    try {
        payslipDisplay.innerHTML = '<div class="loading">Loading payslip...</div>';
        
        const payslipData = await apiRequest(`/payslip/${payrollId}`);
        displayPayslip(payslipData);
    } catch (error) {
        showMessage(`Failed to load payslip: ${error.message}`, 'error');
        payslipDisplay.innerHTML = '<div class="no-data">Failed to load payslip</div>';
    }
}

function displayPayslip(payslipData) {
    const { payroll, employee } = payslipData;
    const payslipDisplay = document.getElementById('payslipDisplay');
    
    payslipDisplay.innerHTML = `
        <div class="payslip-header">
            <div class="payslip-title" data-testid="text-payslip-title">PAYSLIP</div>
            <div class="payslip-period" data-testid="text-payslip-period">${payroll.pay_period_start} to ${payroll.pay_period_end}</div>
        </div>
        
        <div class="payslip-section">
            <h3>Employee Information</h3>
            <div class="payslip-grid">
                <div class="payslip-item">
                    <span>Employee Name:</span>
                    <span data-testid="text-payslip-employee-name">${employee.first_name} ${employee.last_name}</span>
                </div>
                <div class="payslip-item">
                    <span>Employee Code:</span>
                    <span data-testid="text-payslip-employee-code">${employee.employee_code}</span>
                </div>
                <div class="payslip-item">
                    <span>Designation:</span>
                    <span data-testid="text-payslip-designation">${employee.designation}</span>
                </div>
                <div class="payslip-item">
                    <span>Department:</span>
                    <span data-testid="text-payslip-department">${employee.department}</span>
                </div>
                <div class="payslip-item">
                    <span>Email:</span>
                    <span data-testid="text-payslip-email">${employee.email}</span>
                </div>
                <div class="payslip-item">
                    <span>Bank Account:</span>
                    <span data-testid="text-payslip-bank-account">${employee.bank_account}</span>
                </div>
            </div>
        </div>
        
        <div class="payslip-section">
            <h3>Payment Details</h3>
            <div class="payslip-item">
                <span>Gross Pay:</span>
                <span class="amount positive" data-testid="text-payslip-gross-pay">$${payroll.gross_pay.toLocaleString()}</span>
            </div>
            <div class="payslip-item">
                <span>Deductions:</span>
                <span class="amount negative" data-testid="text-payslip-deductions">-$${payroll.deductions.toLocaleString()}</span>
            </div>
            <div class="payslip-item total">
                <span>Net Pay:</span>
                <span class="amount positive" data-testid="text-payslip-net-pay">$${payroll.net_pay.toLocaleString()}</span>
            </div>
        </div>
    `;
}

// Utility functions
function showMessage(text, type = 'info') {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.classList.add('show');
    
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 4000);
}

// Make deleteEmployee available globally for onclick handlers
window.deleteEmployee = deleteEmployee;
