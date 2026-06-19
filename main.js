// Utility Functions
function capitalizeWords(str) {
  return (str||"").replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function formatMoney(num) {
  if (isNaN(num)) return "0";
  return Number(num).toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0});
}

function getStatus(due, paid) {
  due = Number(due)||0; 
  paid = Number(paid)||0;
  if (paid > due) {
    paid = due;
  }
  if (paid >= due) return "Paid";
  if (paid > 0 && paid < due) return "Partial Paid";
  return "Due";
}

function getCustomerId() {
  return "c" + Date.now() + Math.floor(Math.random()*100000);
}

// Data Management
const STORAGE_KEY = "roza_customers";
const SIDEBAR_STATE_KEY = "roza_sidebar_state";
const PAGE_SIZE_KEY = "roza_page_size";

function loadCustomers() {
  let data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    let arr = JSON.parse(data);
    arr.forEach(c => {
        if (typeof c.note === 'undefined') c.note = "";
        if (typeof c.contact === 'undefined') c.contact = "";
    });
    if (Array.isArray(arr)) return arr;
  } catch {}
  return [];
}

function saveCustomers(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

function saveSidebarState(expanded) {
  localStorage.setItem(SIDEBAR_STATE_KEY, expanded ? "expanded" : "collapsed");
}

function loadSidebarState() {
  return localStorage.getItem(SIDEBAR_STATE_KEY) === "expanded";
}

function savePageSize(size) {
  localStorage.setItem(PAGE_SIZE_KEY, size);
}

function loadPageSize() {
  const saved = localStorage.getItem(PAGE_SIZE_KEY);
  return saved ? parseInt(saved) : 35;
}

// Global State
let customers = loadCustomers();
let searchQuery = "";
let addressFilter = "";
let statusFilter = "";
let sourceFilter = "";
let currentPage = 1;
let pageSize = loadPageSize();
let currentDisplayCustomers = customers;
let currentReceiptCustomer = null;
let currentPaymentCustomer = null;
let currentTransactionType = "payment";
let currentAdjustmentType = "increase";
let lastPaymentDetails = null;
let selectedCopyType = "both";

document.getElementById("pageSizeSelect").value = pageSize.toString();

// Sorting State & Logic
let currentSortColumn = 'addedAt';
let sortDirection = 'asc';

function sortCustomers(customers, column, direction) {
  return customers.sort((a, b) => {
    let aVal, bVal;
    let multiplier = direction === 'asc' ? 1 : -1;

    if (column === 'currentDue') {
        aVal = (Number(a.due) || 0) - (Number(a.paid) || 0);
        bVal = (Number(b.due) || 0) - (Number(b.paid) || 0);
        return (aVal - bVal) * multiplier;
    }
    if (['due', 'paid', 'addedAt'].includes(column)) {
        aVal = Number(a[column]) || 0;
        bVal = Number(b[column]) || 0;
        return (aVal - bVal) * multiplier;
    }
    aVal = String(a[column] || "").toLowerCase();
    bVal = String(b[column] || "").toLowerCase();
    
    if (aVal < bVal) return -1 * multiplier;
    if (aVal > bVal) return 1 * multiplier;
    return 0;
  });
}

// Dashboard Statistics
function renderHeaderStats() {
  const total = customers.length;
  let paid = 0, partial = 0, due = 0;
  let totalDue = 0, totalPaid = 0;
  
  customers.forEach(c => {
    let s = getStatus(c.due, c.paid);
    if (s === "Paid") paid++;
    else if (s === "Partial Paid") partial++;
    else due++;
    
    totalDue += Number(c.due)||0;
    totalPaid += Number(c.paid)||0;
  });
  
  document.getElementById("statTotalCustomers").textContent = total;
  document.getElementById("statTotalPaid").textContent = paid;
  document.getElementById("statPartialPaid").textContent = partial;
  document.getElementById("statTotalDue").textContent = due;
  
  document.getElementById("sidebarCustomerCountValue").textContent = total;
}

// Due Info Modal with Password Protection
function renderDueInfo() {
  let totalDue = customers.reduce((s,c)=>s+(Number(c.due)||0),0);
  let totalPaid = customers.reduce((s,c)=>s+(Number(c.paid)||0),0);
  let currentDue = Math.max(0, totalDue-totalPaid);
  
  document.getElementById("modalTotalDue").textContent = formatMoney(totalDue);
  document.getElementById("modalTotalPaid").textContent = formatMoney(totalPaid);
  document.getElementById("modalCurrentDue").textContent = formatMoney(currentDue);
}

function showDueInfoModal() {
  document.getElementById("dueInfoModal").style.display = "flex";
  document.getElementById("dueInfoPasswordSection").style.display = "block";
  document.getElementById("dueInfoDetailsSection").style.display = "none";
  document.getElementById("dueInfoPasswordInput").value = "";
  document.getElementById("dueInfoPasswordWarning").classList.remove("show");
  
  setTimeout(() => {
    document.getElementById("dueInfoPasswordInput").focus();
  }, 100);
}

function showDueInfoDetails() {
  document.getElementById("dueInfoPasswordSection").style.display = "none";
  document.getElementById("dueInfoDetailsSection").style.display = "block";
  renderDueInfo();
}

// Edit Customer Modal
let currentEditCustomerId = null;

function showEditModal(customer) {
  currentEditCustomerId = customer.id;
  
  document.getElementById("editCustomerName").textContent = capitalizeWords(customer.name || "");
  document.getElementById("editNameInput").value = customer.name || "";
  document.getElementById("editPhoneInput").value = customer.phone || "";
  
  const addressSelect = document.getElementById("editAddressSelect");
  const addressCustom = document.getElementById("editAddressCustomInput");
  const addressOptions = Array.from(addressSelect.options).map(opt => opt.value);
  
  if (addressOptions.includes(customer.address)) {
    addressSelect.value = customer.address;
    addressCustom.value = "";
  } else {
    addressSelect.value = "";
    addressCustom.value = customer.address || "";
  }
  
  document.getElementById("editSourceSelect").value = customer.source || "";
  document.getElementById("editDueInput").value = customer.due || 0;
  document.getElementById("editPaidInput").value = customer.paid || 0;
  
  document.getElementById("editCustomerModal").style.display = "flex";
  setTimeout(() => {
    document.getElementById("editNameInput").focus();
  }, 100);
}

function saveEditChanges() {
  if (!currentEditCustomerId) return;
  
  const customer = customers.find(c => c.id === currentEditCustomerId);
  if (!customer) return;
  
  customer.name = capitalizeWords(document.getElementById("editNameInput").value.trim());
  customer.phone = document.getElementById("editPhoneInput").value.trim();
  
  const addressSelect = document.getElementById("editAddressSelect").value;
  const addressCustom = document.getElementById("editAddressCustomInput").value.trim();
  customer.address = addressCustom || addressSelect;
  customer.address = capitalizeWords(customer.address);
  
  customer.source = document.getElementById("editSourceSelect").value;
  customer.due = Math.max(0, Number(document.getElementById("editDueInput").value) || 0);
  customer.paid = Math.max(0, Number(document.getElementById("editPaidInput").value) || 0);
  
  if (customer.paid > customer.due) {
    customer.paid = customer.due;
  }
  
  saveCustomers(customers);
  renderTable();
  closeEditModal();
  showToast("Customer updated successfully!", "success");
}

function closeEditModal() {
  document.getElementById("editCustomerModal").style.display = "none";
  currentEditCustomerId = null;
}

// Payment Modal Functions
function showPaymentModal(customer) {
  currentPaymentCustomer = customer;
  currentTransactionType = "payment";
  currentAdjustmentType = "increase";
  
  const dueAmount = Number(customer.due) || 0;
  const paidAmount = Number(customer.paid) || 0;
  const currentDue = Math.max(0, dueAmount - paidAmount);
  
  document.getElementById("paymentCustomerName").textContent = capitalizeWords(customer.name || "");
  
  document.getElementById("paymentDueAmount").textContent = formatMoney(dueAmount);
  document.getElementById("paymentPaidAmount").textContent = formatMoney(paidAmount);
  document.getElementById("paymentCurrentDueAmount").textContent = formatMoney(currentDue);
  
  document.querySelectorAll('.transaction-type-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  document.querySelector('.transaction-type-btn[data-type="payment"]').classList.add('selected');
  
  document.getElementById("adjustmentTypeSelector").style.display = "none";
  
  document.querySelectorAll('.adjustment-type-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  document.querySelector('.adjustment-type-btn[data-adjustment-type="increase"]').classList.add('selected');
  
  document.getElementById("paymentAmountInput").value = "";
  document.getElementById("paymentNoteInput").value = "";
  
  document.getElementById("printPaymentReceiptBtn").style.display = "none";
  
  document.getElementById("paymentModal").style.display = "flex";
  
  setTimeout(() => {
    document.getElementById("paymentAmountInput").focus();
  }, 100);
}

function savePayment() {
  if (!currentPaymentCustomer) return;
  
  const customer = customers.find(c => c.id === currentPaymentCustomer.id);
  if (!customer) return;
  
  const amount = Math.max(0, Number(document.getElementById("paymentAmountInput").value) || 0);
  const note = document.getElementById("paymentNoteInput").value.trim();
  
  if (amount <= 0) {
    showToast("Please enter a valid amount!", "error");
    return;
  }
  
  const oldDue = Number(customer.due) || 0;
  const oldPaid = Number(customer.paid) || 0;
  const oldCurrentDue = Math.max(0, oldDue - oldPaid);
  
  let transactionTypeText = "";
  
  switch(currentTransactionType) {
    case "payment":
      const newPaid = oldPaid + amount;
      if (newPaid > oldDue) {
        customer.paid = oldDue;
        const excess = newPaid - oldDue;
        showToast(`Payment of ${formatMoney(amount)} received. ${formatMoney(excess)} is excess and will not be recorded.`, "warning");
      } else {
        customer.paid = newPaid;
        showToast(`Payment of ${formatMoney(amount)} received`, "success");
      }
      transactionTypeText = "Payment Received";
      break;
      
    case "due":
      customer.due = oldDue + amount;
      transactionTypeText = "Due Added";
      showToast(`Due of ${formatMoney(amount)} added`, "warning");
      break;
      
    case "adjustment":
      if (currentAdjustmentType === "increase") {
        customer.due = oldDue + amount;
        transactionTypeText = "Due Increased";
        showToast(`Due increased by ${formatMoney(amount)}`, "info");
      } else if (currentAdjustmentType === "decrease") {
        customer.due = Math.max(0, oldDue - amount);
        transactionTypeText = "Due Decreased";
        showToast(`Due decreased by ${formatMoney(amount)}`, "info");
      }
      break;
  }
  
  const newDue = Number(customer.due) || 0;
  const newPaid = Number(customer.paid) || 0;
  const newCurrentDue = Math.max(0, newDue - newPaid);
  
  if (note) {
    customer.note = (customer.note ? customer.note + "\n" : "") + 
      `[${new Date().toLocaleDateString()}] ${transactionTypeText}: ${formatMoney(amount)} - ${note}`;
  }
  
  saveCustomers(customers);
  renderTable();
  
  lastPaymentDetails = {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone || "",
      address: customer.address || "",
      source: customer.source || ""
    },
    transaction: {
      type: currentTransactionType,
      typeText: transactionTypeText,
      amount: amount,
      note: note,
      date: new Date().toLocaleString(),
      oldDue: oldDue,
      oldPaid: oldPaid,
      oldCurrentDue: oldCurrentDue,
      newDue: newDue,
      newPaid: newPaid,
      newCurrentDue: newCurrentDue
    }
  };
  
  document.getElementById("printPaymentReceiptBtn").style.display = "block";
  document.getElementById("savePaymentBtn").style.display = "none";
  document.getElementById("cancelPaymentBtn").textContent = "Close";
}

function closePaymentModal() {
  document.getElementById("paymentModal").style.display = "none";
  currentPaymentCustomer = null;
  document.getElementById("printPaymentReceiptBtn").style.display = "none";
  document.getElementById("savePaymentBtn").style.display = "block";
  document.getElementById("cancelPaymentBtn").textContent = "Cancel";
}

// Main Table Rendering
function renderTable() {
  let filtered = customers.filter(c => {
    let match = true;
    if (searchQuery) {
      let q = searchQuery.toLowerCase();
      match = (c.name||"").toLowerCase().includes(q) ||
              (c.address||"").toLowerCase().includes(q);
    }
    if (match && addressFilter) {
      match = (c.address||"") === addressFilter;
    }
    if (match && statusFilter) {
      let status = getStatus(c.due, c.paid);
      match = (statusFilter === "Paid") ? (status === "Paid") :
              (statusFilter === "Partial") ? (status === "Partial Paid") :
              (status !== "Paid" && status !== "Partial Paid");
    }
    if (match && sourceFilter) {
      match = (c.source||"") === sourceFilter;
    }
    return match;
  });
  
  let sorted = sortCustomers(filtered, currentSortColumn, sortDirection);
  currentDisplayCustomers = sorted;

  let total = sorted.length;
  let totalPages = Math.ceil(total / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  let start = (currentPage-1)*pageSize;
  let end = start + pageSize;
  let pageData = sorted.slice(start, end);
  
  const customerTableBody = document.getElementById("customerTableBody");
  customerTableBody.innerHTML = "";
  
  document.querySelectorAll('.customer-table th.sortable').forEach(th => {
      let col = th.getAttribute('data-sort');
      th.setAttribute('data-sort-active', col === currentSortColumn ? 'true' : 'false');
      th.setAttribute('data-sort-direction', col === currentSortColumn ? sortDirection : 'asc');
  });
  
  pageData.forEach((c, idx) => {
    let row = document.createElement("tr");
    row.className = "";
    let status = getStatus(c.due, c.paid);
    if (status === "Paid") row.classList.add("paid");
    if (status === "Due") row.classList.add("overdue");
    
    row.innerHTML = `
      <td>${start+idx+1}</td>
      <td>${capitalizeWords(c.name||"")}</td>
      <td>${capitalizeWords(c.address||"")}</td>
      <td>${c.source||""}</td>
      <td class="status-col" data-status="${status}">${status}</td>
      <td>${formatMoney(c.due)}</td>
      <td>${formatMoney(c.paid)}</td>
      <td>${formatMoney(Math.max(0, (Number(c.due)||0)-(Number(c.paid)||0)))}</td>
      <td class="actions-col">
        <div class="action-icons">
          <button class="action-btn payment" data-id="${c.id}" title="Add Payment">Pay</button>
          <button class="action-btn preview" data-id="${c.id}" title="Preview Details">View</button>
          <button class="action-btn edit" data-id="${c.id}" title="Edit">Edit</button>
          <button class="action-btn delete" data-id="${c.id}" title="Delete">Del</button>
        </div>
      </td>
    `;
    customerTableBody.appendChild(row);
  });
  
  const showingStart = total > 0 ? start + 1 : 0;
  const showingEnd = Math.min(end, total);
  document.getElementById("paginationInfo").textContent = 
    `Showing ${showingStart} to ${showingEnd} of ${total} customers`;
  
  renderPagination(total, totalPages);
  renderHeaderStats();
}

// Enhanced Pagination System
function renderPagination(total, totalPages) {
  const pagination = document.getElementById("pagination");
  pagination.innerHTML = "";
  if (totalPages <= 1) return;
  
  let prev = document.createElement("button");
  prev.className = "pagination-arrow";
  prev.textContent = "<";
  prev.disabled = currentPage === 1;
  prev.onclick = () => { if (currentPage > 1) { currentPage--; renderTable(); } };
  pagination.appendChild(prev);
  
  for (let i=1; i<=totalPages; ++i) {
    if (i === 1 || i === totalPages || Math.abs(i-currentPage)<=1) {
      let btn = document.createElement("button");
      btn.className = "pagination-btn" + (i===currentPage ? " active" : "");
      btn.textContent = i;
      btn.onclick = () => { currentPage = i; renderTable(); };
      pagination.appendChild(btn);
    } else if (i === 2 && currentPage > 3) {
      let dots = document.createElement("span");
      dots.textContent = "...";
      dots.style.margin = "0 5px";
      dots.style.color = "#aaa";
      pagination.appendChild(dots);
    } else if (i === totalPages-1 && currentPage < totalPages-2) {
      let dots = document.createElement("span");
      dots.textContent = "...";
      dots.style.margin = "0 5px";
      dots.style.color = "#aaa";
      pagination.appendChild(dots);
    }
  }
  
  let next = document.createElement("button");
  next.className = "pagination-arrow";
  next.textContent = ">";
  next.disabled = currentPage === totalPages;
  next.onclick = () => { if (currentPage < totalPages) { currentPage++; renderTable(); } };
  pagination.appendChild(next);
}

// DOM Elements
const customerTableBody = document.getElementById("customerTableBody");
const previewModal = document.getElementById("customerPreviewModal");
const editModal = document.getElementById("editCustomerModal");
const paymentModal = document.getElementById("paymentModal");

// Auto Cursor Flow System
const nameInput = document.getElementById("nameInput");
const phoneInput = document.getElementById("phoneInput");
const addressSelect = document.getElementById("addressSelect");
const addressCustomInput = document.getElementById("addressCustomInput");
const sourceSelect = document.getElementById("sourceSelect");
const dueInput = document.getElementById("dueInput");
const paidInput = document.getElementById("paidInput");
const quickAddBtn = document.querySelector(".quick-add-btn");

function setupQuickAddFlow() {
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); phoneInput.focus(); } });
  phoneInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addressSelect.focus(); } });
  addressSelect.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addressCustomInput.focus(); } });
  addressCustomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sourceSelect.focus(); } });
  sourceSelect.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); dueInput.focus(); } });
  dueInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); quickAddBtn.focus(); } });
}

// Search and Filter Event Listeners
document.getElementById("mainSearchInput").addEventListener("input", e => {
  searchQuery = e.target.value.trim();
  currentPage = 1;
  renderTable();
});

document.getElementById("addressFilter").addEventListener("change", e => {
  addressFilter = e.target.value;
  currentPage = 1;
  renderTable();
});

document.getElementById("statusFilter").addEventListener("change", e => {
  statusFilter = e.target.value;
  currentPage = 1;
  renderTable();
});

document.getElementById("sourceFilter").addEventListener("change", e => {
  sourceFilter = e.target.value;
  currentPage = 1;
  renderTable();
});

// Page Size Selector Event Listener
document.getElementById("pageSizeSelect").addEventListener("change", e => {
  pageSize = parseInt(e.target.value);
  savePageSize(pageSize);
  currentPage = 1;
  renderTable();
  showToast(`Showing ${pageSize} customers per page`, "info");
});

// Sorting Event Listener
document.getElementById("customerTable").querySelector("thead").addEventListener("click", function(e){
    let th = e.target.closest("th.sortable");
    if (!th) return;

    const column = th.getAttribute('data-sort');

    if (column === currentSortColumn) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        sortDirection = 'asc';
    }
    
    currentPage = 1;
    renderTable();
    showToast(`Sorted by ${column} (${sortDirection})`, "info");
});

// Quick Add Form Submission
document.getElementById("quickAddForm").addEventListener("submit", function(e){
  e.preventDefault();
  if (customers.length >= 10000) {
    showToast("Maximum 10,000 customers allowed.", "error");
    return;
  }
  
  let name = capitalizeWords(document.getElementById("nameInput").value.trim());
  let phone = document.getElementById("phoneInput").value.trim();
  let address = document.getElementById("addressCustomInput").value.trim() ||
                document.getElementById("addressSelect").value.trim();
  address = capitalizeWords(address);
  let source = document.getElementById("sourceSelect").value.trim();
  let due = Math.max(0, Number(document.getElementById("dueInput").value)||0);
  let paid = Math.max(0, Number(document.getElementById("paidInput").value)||0);
  
  if (paid > due) {
    paid = due;
  }
  
  let newCustomer = {
    id: getCustomerId(),
    name, phone, address, due, paid, source,
    note: "",
    contact: phone,
    addedAt: Date.now()
  };
  customers.push(newCustomer);
  saveCustomers(customers);
  this.reset();
  renderTable();
  nameInput.focus();
  showToast("Customer added successfully!", "success");
});

// Customer Preview Modal
function showCustomerPreview(customer) {
  const detailsDiv = document.getElementById("previewDetails");
  const status = getStatus(customer.due, customer.paid);
  const currentDue = Math.max(0, (Number(customer.due)||0)-(Number(customer.paid)||0));

  detailsDiv.innerHTML = `
    <div style="margin-bottom: 15px; padding: 12px; background: var(--table-row-alt); border-radius: 6px;">
      <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px; color: var(--main-txt);">${capitalizeWords(customer.name||"")}</div>
      <div style="font-size: 0.95rem; color: var(--accent);">Customer ID: ${customer.id}</div>
    </div>
    <div><strong>Phone/Contact:</strong> ${customer.phone || "Not provided"}</div>
    <div><strong>Address:</strong> ${capitalizeWords(customer.address||"")}</div>
    <div><strong>Source:</strong> ${customer.source||"-"}</div>
    <div style="margin-top: 15px; border-top: 1px dashed var(--border); padding-top: 10px;">
      <strong style="color: var(--overdue);">Due Amount:</strong> <span style="font-weight: bold; color: var(--overdue);">${formatMoney(customer.due)}</span>
    </div>
    <div>
      <strong style="color: var(--paid);">Paid Amount:</strong> <span style="font-weight: bold; color: var(--paid);">${formatMoney(customer.paid)}</span>
    </div>
    <div>
      <strong style="color: var(--accent);">Current Due:</strong> <span style="font-weight: bold; color: var(--accent);">${formatMoney(currentDue)}</span>
    </div>
    <div style="margin-top: 10px;">
      <strong>Status:</strong> <span style="font-weight: bold;">${status}</span>
    </div>
    ${customer.note ? `
    <div style="margin-top: 15px; border-top: 1px dashed var(--border); padding-top: 10px;">
      <strong style="display: block; margin-bottom: 5px; color: var(--adjustment);">Note:</strong> 
      <span style="font-weight: 500; white-space: pre-wrap; font-size: 0.9em;" class="note-text">${customer.note}</span>
    </div>` : ''}
  `;
  
  currentReceiptCustomer = customer;
  
  document.getElementById("receiptActionButtons").style.display = "flex";
  
  document.getElementById("printReceiptBtn").onclick = function() {
    showPrintCopyModal(customer);
  };
  
  document.getElementById("downloadReceiptBtn").onclick = function() {
    showDownloadReceiptModal(customer);
  };
  
  document.getElementById("clearNotesBtn").onclick = function() {
    clearCustomerNotes(customer);
  };
  
  document.getElementById("clearAmountsBtn").onclick = function() {
    clearCustomerAmounts(customer);
  };
  
  if (!customer.note || customer.note.trim() === "") {
    document.getElementById("clearNotesBtn").style.display = "none";
  } else {
    document.getElementById("clearNotesBtn").style.display = "flex";
  }
  
  if ((!customer.due || customer.due == 0) && (!customer.paid || customer.paid == 0)) {
    document.getElementById("clearAmountsBtn").style.display = "none";
  } else {
    document.getElementById("clearAmountsBtn").style.display = "flex";
  }
  
  previewModal.style.display = "flex";
}

// Clear Customer Notes Function
function clearCustomerNotes(customer) {
  if (!customer || !customer.id) return;
  
  if (!confirm("Are you sure you want to clear all notes for this customer?")) {
    return;
  }
  
  const customerIndex = customers.findIndex(c => c.id === customer.id);
  if (customerIndex !== -1) {
    customers[customerIndex].note = "";
    saveCustomers(customers);
    renderTable();
    showToast("Customer notes cleared successfully!", "success");
    
    previewModal.style.display = "none";
    currentReceiptCustomer = null;
  }
}

// Clear Customer Amounts Function
function clearCustomerAmounts(customer) {
  if (!customer || !customer.id) return;
  
  if (!confirm("Are you sure you want to clear all amounts (due and paid) for this customer? This will reset amounts to zero but keep other information intact.")) {
    return;
  }
  
  const customerIndex = customers.findIndex(c => c.id === customer.id);
  if (customerIndex !== -1) {
    customers[customerIndex].due = 0;
    customers[customerIndex].paid = 0;
    saveCustomers(customers);
    renderTable();
    showToast("Customer amounts cleared successfully!", "success");
    
    previewModal.style.display = "none";
    currentReceiptCustomer = null;
  }
}

// Print Copy Selection Modal
function showPrintCopyModal(customer) {
  currentReceiptCustomer = customer;
  document.getElementById("printCopyCustomerName").textContent = capitalizeWords(customer.name || "");
  
  selectedCopyType = "both";
  document.querySelectorAll('.copy-option').forEach(option => {
    option.classList.remove('selected');
    if (option.getAttribute('data-copy') === selectedCopyType) {
      option.classList.add('selected');
    }
  });
  
  document.getElementById("printCopyModal").style.display = "flex";
}

// Print Receipt with Copy Selection
function printReceipt(customer, copyType = "both") {
  const receiptArea = document.getElementById("receiptPrintArea");
  const status = getStatus(customer.due, customer.paid);
  const currentDue = Math.max(0, (Number(customer.due)||0)-(Number(customer.paid)||0));
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();
  const printTime = now.toLocaleString();

  const printCustomerCopy = true;
  const printStoreCopy = copyType === "both";

  let receiptHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Invoice - ${customer.name}</title>
        <style>
            @page { 
                size: A4;
                margin: 8mm;
            }
            body { 
                font-family: 'Arial', sans-serif;
                color: #000;
                margin: 0;
                padding: 0;
                background: #fff;
                font-size: 10pt;
                line-height: 1.2;
            }
            .invoice-container {
                width: 100%;
                max-width: 800px;
                margin: 0 auto;
                box-sizing: border-box;
                position: relative;
                page-break-inside: avoid;
            }
            .invoice-header {
                text-align: center;
                padding: 6px 4px;
                border-bottom: 2px solid #000;
                margin-bottom: 6px;
            }
            .invoice-title {
                font-size: 14pt;
                font-weight: bold;
                margin: 0 0 3px 0;
                text-transform: uppercase;
            }
            .invoice-subtitle {
                font-size: 9pt;
                margin: 1px 0;
            }
            .invoice-body {
                padding: 6px 4px;
            }
            .customer-info, .invoice-details {
                margin-bottom: 6px;
            }
            .info-section {
                margin-bottom: 6px;
            }
            .info-title {
                font-size: 11pt;
                font-weight: bold;
                border-bottom: 1px solid #000;
                padding-bottom: 2px;
                margin-bottom: 4px;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 4px;
            }
            .info-item {
                margin-bottom: 2px;
            }
            .info-label {
                font-weight: bold;
                display: inline-block;
                width: 75px;
            }
            .financial-summary {
                background: #f0f0f0;
                padding: 4px;
                border: 1px solid #000;
                margin: 6px 0;
            }
            .financial-grid {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 4px;
                text-align: center;
            }
            .financial-item {
                padding: 4px;
            }
            .financial-value {
                font-size: 11pt;
                font-weight: bold;
                margin-top: 1px;
            }
            .due-amount { color: #000; }
            .paid-amount { color: #000; }
            .current-due { color: #000; }
            .notes-section {
                background: #fff;
                padding: 4px;
                border: 1px solid #000;
                margin: 6px 0;
                font-size: 9pt;
            }
            .copy-separator {
                border-top: 2px dashed #000;
                margin: 25px 0;
                text-align: center;
                position: relative;
                height: 15px;
            }
            .copy-separator::after {
                content: "✂️ Cut Here ✂️";
                background: white;
                padding: 0 4px;
                position: absolute;
                top: -7px;
                left: 50%;
                transform: translateX(-50%);
                color: #000;
                font-size: 7pt;
            }
            .copy-label {
                text-align: center;
                font-size: 11pt;
                font-weight: bold;
                background: #e0e0e0;
                padding: 2px;
                margin: 6px 0;
                border: 1px solid #000;
            }
            .invoice-footer {
                background: #f0f0f0;
                padding: 8px 4px;
                text-align: center;
                border-top: 1px solid #000;
                margin-top: 8px;
                font-size: 9pt;
            }
            .footer-text {
                margin: 3px 0;
                font-size: 9pt;
            }
            .thank-you {
                font-size: 10pt;
                font-weight: bold;
                margin: 6px 0;
            }
            .copyright-section {
                font-size: 8pt;
                color: #666;
                margin-top: 4px;
                border-top: 1px dotted #666;
                padding-top: 4px;
            }
            .page-break {
                page-break-after: always;
            }
            @media print {
                body { margin: 0; padding: 0; }
                .invoice-container { border: none; box-shadow: none; }
                .page-break { page-break-after: always; }
            }
        </style>
    </head>
    <body>
  `;

  receiptHtml += `
        <!-- Customer Copy -->
        <div class="invoice-container">
            <div class="invoice-header">
                <div class="invoice-title">ROZA GIFT CORNER & ELECTRIC</div>
                <div class="invoice-subtitle">Moshjid Market, Naohata Mor, Mohadevpur, Naogaon</div>
                <div class="invoice-subtitle">Contact: +8801715986646</div>
            </div>
            
            <div class="invoice-body">
                <div class="copy-label">CUSTOMER COPY</div>
                
                <div class="info-grid">
                    <div class="customer-info">
                        <div class="info-title">CUSTOMER INFORMATION</div>
                        <div class="info-item"><span class="info-label">Name:</span> ${capitalizeWords(customer.name||"")}</div>
                        ${customer.phone ? `<div class="info-item"><span class="info-label">Phone:</span> ${customer.phone}</div>` : ''}
                        <div class="info-item"><span class="info-label">Address:</span> ${capitalizeWords(customer.address||"")}</div>
                        <div class="info-item"><span class="info-label">Source:</span> ${customer.source||"-"}</div>
                        <div class="info-item"><span class="info-label">Customer ID:</span> ${customer.id}</div>
                    </div>
                    
                    <div class="invoice-details">
                        <div class="info-title">INVOICE DETAILS</div>
                        <div class="info-item"><span class="info-label">Date:</span> ${dateStr}</div>
                        <div class="info-item"><span class="info-label">Time:</span> ${timeStr}</div>
                        <div class="info-item"><span class="info-label">Status:</span> <span class="status-col-print">${status}</span></div>
                        <div class="info-item"><span class="info-label">Invoice No:</span> INV-${customer.id.slice(-6).toUpperCase()}</div>
                    </div>
                </div>
                
                <div class="financial-summary">
                    <div class="info-title" style="text-align: center;">FINANCIAL SUMMARY</div>
                    <div class="financial-grid">
                        <div class="financial-item">
                            <div>DUE AMOUNT</div>
                            <div class="financial-value due-amount">${formatMoney(customer.due)}</div>
                        </div>
                        <div class="financial-item">
                            <div>PAID AMOUNT</div>
                            <div class="financial-value paid-amount">${formatMoney(customer.paid)}</div>
                        </div>
                        <div class="financial-item">
                            <div>CURRENT DUE</div>
                            <div class="financial-value current-due">${formatMoney(currentDue)}</div>
                        </div>
                    </div>
                </div>
                
                ${customer.note ? `
                <div class="notes-section">
                    <div style="font-weight: bold; margin-bottom: 2px;">CUSTOMER NOTES:</div>
                    <div style="white-space: pre-wrap;">${customer.note}</div>
                </div>
                ` : ''}
                
                <div class="invoice-footer">
                    <div class="thank-you">THANK YOU FOR YOUR BUSINESS!</div>
                    <div class="footer-text">This is a computer generated invoice</div>
                    <div class="footer-text">Printed on: ${printTime}</div>
                    <div class="footer-text" style="font-size: 8.5pt;">
                        Software: RGCE SparkDesk v1.4 &nbsp; | &nbsp; Powered by Farhan Tanzid Shiyam
                    </div>
                    <div class="copyright-section">
                        &copy; 2025 Roza Gift Corner & Electric. All rights reserved.
                    </div>
                </div>
            </div>
        </div>
  `;

  if (printStoreCopy) {
    receiptHtml += `
        <!-- Copy Separator -->
        <div class="copy-separator"></div>
        
        <!-- Store Copy (Compact - No Header) -->
        <div class="invoice-container">
            <div class="invoice-body">
                <div class="copy-label">STORE COPY - KEEP FOR RECORDS</div>
                
                <div class="info-grid">
                    <div class="customer-info">
                        <div class="info-title">CUSTOMER INFORMATION</div>
                        <div class="info-item"><span class="info-label">Name:</span> ${capitalizeWords(customer.name||"")}</div>
                        ${customer.phone ? `<div class="info-item"><span class="info-label">Phone:</span> ${customer.phone}</div>` : ''}
                        <div class="info-item"><span class="info-label">Address:</span> ${capitalizeWords(customer.address||"")}</div>
                        <div class="info-item"><span class="info-label">Source:</span> ${customer.source||"-"}</div>
                        <div class="info-item"><span class="info-label">Customer ID:</span> ${customer.id}</div>
                    </div>
                    
                    <div class="invoice-details">
                        <div class="info-title">INVOICE DETAILS</div>
                        <div class="info-item"><span class="info-label">Date:</span> ${dateStr}</div>
                        <div class="info-item"><span class="info-label">Time:</span> ${timeStr}</div>
                        <div class="info-item"><span class="info-label">Status:</span> <span class="status-col-print">${status}</span></div>
                        <div class="info-item"><span class="info-label">Invoice No:</span> INV-${customer.id.slice(-6).toUpperCase()}</div>
                    </div>
                </div>
                
                <div class="financial-summary">
                    <div class="info-title" style="text-align: center;">FINANCIAL SUMMARY</div>
                    <div class="financial-grid">
                        <div class="financial-item">
                            <div>DUE AMOUNT</div>
                            <div class="financial-value due-amount">${formatMoney(customer.due)}</div>
                        </div>
                        <div class="financial-item">
                            <div>PAID AMOUNT</div>
                            <div class="financial-value paid-amount">${formatMoney(customer.paid)}</div>
                        </div>
                        <div class="financial-item">
                            <div>CURRENT DUE</div>
                            <div class="financial-value current-due">${formatMoney(currentDue)}</div>
                        </div>
                    </div>
                </div>
                
                ${customer.note ? `
                <div class="notes-section">
                    <div style="font-weight: bold; margin-bottom: 2px;">CUSTOMER NOTES:</div>
                    <div style="white-space: pre-wrap;">${customer.note}</div>
                </div>
                ` : ''}
                
                <div class="invoice-footer">
                    <div class="thank-you">STORE COPY - KEEP FOR ACCOUNTING</div>
                    <div class="footer-text">Roza Gift Corner & Electric - Moshjid Market, Naohata Mor, Mohadevpur, Naogaon</div>
                    <div class="footer-text">Contact: +8801715986646 | Printed on: ${printTime}</div>
                    <div class="footer-text" style="font-size: 8.5pt;">
                        Software: RGCE SparkDesk v1.4 &nbsp; | &nbsp; Powered by Farhan Tanzid Shiyam
                    </div>
                    <div class="copyright-section">
                        &copy; 2025 Roza Gift Corner & Electric. All rights reserved.
                    </div>
                </div>
            </div>
        </div>
    `;
  }

  receiptHtml += `
    </body>
    </html>
  `;

  receiptArea.style.display = 'block';
  receiptArea.innerHTML = receiptHtml;
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast("Pop-up blocked! Please allow pop-ups for printing.", "error");
    return;
  }
  
  printWindow.document.write(receiptArea.innerHTML);
  printWindow.document.close();
  printWindow.focus();
  
  setTimeout(() => {
    printWindow.print();
    setTimeout(() => {
      printWindow.close();
      receiptArea.style.display = 'none';
      receiptArea.innerHTML = '';
      showToast(`Receipt printed (${copyType === "both" ? "Both copies" : "Customer copy only"})!`, "success");
    }, 500);
  }, 300);
}

// Payment Receipt Printing Function
function printPaymentReceipt() {
  if (!lastPaymentDetails) return;
  
  const { customer, transaction } = lastPaymentDetails;
  const receiptArea = document.getElementById("receiptPrintArea");
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();
  const printTime = now.toLocaleString();
  
  let transColor = "#28a745";
  let transIcon = "💰";
  if (transaction.type === "due") {
    transColor = "#dc3545";
    transIcon = "📈";
  } else if (transaction.type === "adjustment") {
    transColor = "#ffc107";
    transIcon = "⚖️";
  }
  
  receiptArea.innerHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Payment Receipt - ${customer.name}</title>
        <style>
            @page { 
                size: A4;
                margin: 10mm;
            }
            body { 
                font-family: 'Arial', sans-serif;
                color: #000;
                margin: 0;
                padding: 0;
                background: #fff;
                font-size: 11pt;
                line-height: 1.3;
            }
            .receipt-container {
                width: 100%;
                max-width: 800px;
                margin: 0 auto;
                box-sizing: border-box;
            }
            .receipt-header {
                text-align: center;
                padding: 15px 10px;
                border-bottom: 3px solid #1a2c5b;
                margin-bottom: 20px;
            }
            .receipt-title {
                font-size: 24px;
                font-weight: bold;
                margin: 0 0 8px 0;
                text-transform: uppercase;
                color: #1a2c5b;
            }
            .receipt-subtitle {
                font-size: 14px;
                margin: 3px 0;
                color: #333;
            }
            .receipt-body {
                padding: 15px 10px;
            }
            .transaction-header {
                text-align: center;
                padding: 15px;
                background: ${transColor}15;
                border: 2px solid ${transColor};
                border-radius: 8px;
                margin-bottom: 20px;
            }
            .transaction-icon {
                font-size: 40px;
                margin-bottom: 10px;
            }
            .transaction-title {
                font-size: 20px;
                font-weight: bold;
                color: ${transColor};
                margin-bottom: 5px;
            }
            .transaction-amount {
                font-size: 28px;
                font-weight: bold;
                color: #000;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
                margin-bottom: 20px;
            }
            .info-section {
                margin-bottom: 15px;
            }
            .section-title {
                font-size: 16px;
                font-weight: bold;
                border-bottom: 2px solid #1a2c5b;
                padding-bottom: 5px;
                margin-bottom: 10px;
                color: #1a2c5b;
            }
            .info-item {
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
            }
            .info-label {
                font-weight: bold;
                min-width: 140px;
            }
            .info-value {
                text-align: right;
                flex: 1;
            }
            .amount-change {
                display: flex;
                justify-content: space-between;
                margin: 15px 0;
                padding: 12px;
                background: #f8f9fa;
                border-radius: 6px;
                border: 1px solid #dee2e6;
            }
            .amount-old {
                text-align: center;
                flex: 1;
            }
            .amount-arrow {
                display: flex;
                align-items: center;
                padding: 0 20px;
                font-size: 24px;
                color: #6c757d;
            }
            .amount-new {
                text-align: center;
                flex: 1;
            }
            .amount-label {
                font-size: 12px;
                color: #6c757d;
                margin-bottom: 3px;
            }
            .amount-value {
                font-size: 18px;
                font-weight: bold;
            }
            .old-value {
                color: #dc3545;
            }
            .new-value {
                color: #28a745;
            }
            .receipt-footer {
                text-align: center;
                padding: 20px 10px;
                border-top: 2px solid #1a2c5b;
                margin-top: 30px;
            }
            .thank-you {
                font-size: 18px;
                font-weight: bold;
                margin: 15px 0;
                color: #1a2c5b;
            }
            .footer-text {
                margin: 5px 0;
                font-size: 12px;
                color: #666;
            }
            .copyright {
                font-size: 10px;
                color: #999;
                margin-top: 15px;
                border-top: 1px dotted #999;
                padding-top: 10px;
            }
            @media print {
                body { margin: 0; padding: 0; }
                .receipt-container { border: none; }
            }
        </style>
    </head>
    <body>
        <div class="receipt-container">
            <div class="receipt-header">
                <div class="receipt-title">ROZA GIFT CORNER & ELECTRIC</div>
                <div class="receipt-subtitle">Moshjid Market, Naohata Mor, Mohadevpur, Naogaon</div>
                <div class="receipt-subtitle">Contact: +8801715986646</div>
            </div>
            
            <div class="receipt-body">
                <div class="transaction-header">
                    <div class="transaction-icon">${transIcon}</div>
                    <div class="transaction-title">${transaction.typeText}</div>
                    <div class="transaction-amount">${formatMoney(transaction.amount)} BDT</div>
                </div>
                
                <div class="info-grid">
                    <div class="info-section">
                        <div class="section-title">CUSTOMER DETAILS</div>
                        <div class="info-item">
                            <span class="info-label">Name:</span>
                            <span class="info-value">${capitalizeWords(customer.name)}</span>
                        </div>
                        ${customer.phone ? `
                        <div class="info-item">
                            <span class="info-label">Phone:</span>
                            <span class="info-value">${customer.phone}</span>
                        </div>
                        ` : ''}
                        <div class="info-item">
                            <span class="info-label">Address:</span>
                            <span class="info-value">${capitalizeWords(customer.address)}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Customer ID:</span>
                            <span class="info-value">${customer.id}</span>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <div class="section-title">TRANSACTION DETAILS</div>
                        <div class="info-item">
                            <span class="info-label">Receipt No:</span>
                            <span class="info-value">TXN-${customer.id.slice(-8).toUpperCase()}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Date:</span>
                            <span class="info-value">${dateStr}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Time:</span>
                            <span class="info-value">${timeStr}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Transaction Type:</span>
                            <span class="info-value" style="color:${transColor}; font-weight:bold;">${transaction.typeText}</span>
                        </div>
                    </div>
                </div>
                
                <div class="amount-change">
                    <div class="amount-old">
                        <div class="amount-label">PREVIOUS DUE</div>
                        <div class="amount-value old-value">${formatMoney(transaction.oldCurrentDue)} BDT</div>
                    </div>
                    <div class="amount-arrow">→</div>
                    <div class="amount-new">
                        <div class="amount-label">CURRENT DUE</div>
                        <div class="amount-value new-value">${formatMoney(transaction.newCurrentDue)} BDT</div>
                    </div>
                </div>
                
                ${transaction.note ? `
                <div class="info-section">
                    <div class="section-title">TRANSACTION NOTE</div>
                    <div style="padding: 10px; background: #f8f9fa; border-radius: 4px; border-left: 4px solid ${transColor};">
                        ${transaction.note}
                    </div>
                </div>
                ` : ''}
                
                <div class="receipt-footer">
                    <div class="thank-you">THANK YOU FOR YOUR BUSINESS!</div>
                    <div class="footer-text">This is a computer generated payment receipt</div>
                    <div class="footer-text">Printed on: ${printTime}</div>
                    <div class="footer-text">Authorized Signature: ___________________</div>
                    <div class="copyright">
                        Software: RGCE SparkDesk v1.4 | Powered by Farhan Tanzid Shiyam<br>
                        &copy; 2025 Roza Gift Corner & Electric. All rights reserved.
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  receiptArea.style.display = 'block';
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast("Pop-up blocked! Please allow pop-ups for printing.", "error");
    return;
  }
  
  printWindow.document.write(receiptArea.innerHTML);
  printWindow.document.close();
  printWindow.focus();
  
  setTimeout(() => {
    printWindow.print();
    setTimeout(() => {
      printWindow.close();
      receiptArea.style.display = "none";
      receiptArea.innerHTML = "";
      showToast("Payment receipt printed successfully!", "success");
    }, 500);
  }, 300);
}

// DOWNLOAD RECEIPT AS IMAGE (JPG)
function downloadReceiptAsImage(customer) {
  const status = getStatus(customer.due, customer.paid);
  const currentDue = Math.max(0, (Number(customer.due)||0)-(Number(customer.paid)||0));
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();
  const printTime = now.toLocaleString();

  const receiptHtml = `
    <div id="receiptForImage" style="
      width: 800px;
      background: white;
      font-family: 'Arial', sans-serif;
      color: #000;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    ">
      <div style="
        border: 1px solid #000;
        padding: 15px;
        margin-bottom: 20px;
        page-break-inside: avoid;
      ">
        <div style="
          text-align: center;
          padding-bottom: 10px;
          border-bottom: 2px solid #000;
          margin-bottom: 15px;
        ">
          <div style="
            font-size: 24px;
            font-weight: bold;
            margin: 0 0 5px 0;
            text-transform: uppercase;
            color: #1a2c5b;
          ">
            ROZA GIFT CORNER & ELECTRIC
          </div>
          <div style="font-size: 14px; margin: 3px 0; color: #333;">
            Moshjid Market, Naohata Mor, Mohadevpur, Naogaon
          </div>
          <div style="font-size: 14px; margin: 3px 0; color: #333;">
            Contact: +8801715986646
          </div>
        </div>
        
        <div style="
          text-align: center;
          font-size: 18px;
          font-weight: bold;
          background: #e0e0e0;
          padding: 8px;
          margin: 10px 0 20px 0;
          border: 1px solid #000;
        ">
          CUSTOMER COPY
        </div>
        
        <div style="display: flex; margin-bottom: 20px; gap: 20px;">
          <div style="flex: 1;">
            <div style="
              font-size: 16px;
              font-weight: bold;
              border-bottom: 1px solid #000;
              padding-bottom: 5px;
              margin-bottom: 10px;
            ">
              CUSTOMER INFORMATION
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Name:</span>
              <span>${capitalizeWords(customer.name||"")}</span>
            </div>
            ${customer.phone ? `
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Phone:</span>
              <span>${customer.phone}</span>
            </div>
            ` : ''}
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Address:</span>
              <span>${capitalizeWords(customer.address||"")}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Source:</span>
              <span>${customer.source||"-"}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Customer ID:</span>
              <span>${customer.id}</span>
            </div>
          </div>
          
          <div style="flex: 1;">
            <div style="
              font-size: 16px;
              font-weight: bold;
              border-bottom: 1px solid #000;
              padding-bottom: 5px;
              margin-bottom: 10px;
            ">
              INVOICE DETAILS
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Date:</span>
              <span>${dateStr}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Time:</span>
              <span>${timeStr}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Status:</span>
              <span style="font-style: italic;">${status}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; display: inline-block; width: 100px;">Invoice No:</span>
              <span>INV-${customer.id.slice(-6).toUpperCase()}</span>
            </div>
          </div>
        </div>
        
        <div style="
          background: #f0f0f0;
          padding: 15px;
          border: 1px solid #000;
          margin: 20px 0;
        ">
          <div style="
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 15px;
            color: #1a2c5b;
          ">
            FINANCIAL SUMMARY
          </div>
          
          <div style="display: flex; text-align: center; gap: 10px;">
            <div style="flex: 1;">
              <div style="font-weight: bold; margin-bottom: 5px;">DUE AMOUNT</div>
              <div style="
                font-size: 20px;
                font-weight: bold;
                color: #000;
              ">
                ${formatMoney(customer.due)}
              </div>
            </div>
            
            <div style="flex: 1;">
              <div style="font-weight: bold; margin-bottom: 5px;">PAID AMOUNT</div>
              <div style="
                font-size: 20px;
                font-weight: bold;
                color: #000;
              ">
                ${formatMoney(customer.paid)}
              </div>
            </div>
            
            <div style="flex: 1;">
              <div style="font-weight: bold; margin-bottom: 5px;">CURRENT DUE</div>
              <div style="
                font-size: 20px;
                font-weight: bold;
                color: #000;
              ">
                ${formatMoney(currentDue)}
              </div>
            </div>
          </div>
        </div>
        
        ${customer.note ? `
        <div style="
          background: #fff;
          padding: 12px;
          border: 1px solid #000;
          margin: 15px 0;
          font-size: 14px;
        ">
          <div style="font-weight: bold; margin-bottom: 8px; color: #1a2c5b;">
            CUSTOMER NOTES:
          </div>
          <div style="white-space: pre-wrap;">${customer.note}</div>
        </div>
        ` : ''}
        
        <div style="
          background: #f0f0f0;
          padding: 15px;
          text-align: center;
          border-top: 1px solid #000;
          margin-top: 20px;
          font-size: 14px;
        ">
          <div style="
            font-size: 18px;
            font-weight: bold;
            margin: 10px 0;
            color: #1a2c5b;
          ">
            THANK YOU FOR YOUR BUSINESS!
          </div>
          <div style="margin: 5px 0;">This is a computer generated invoice</div>
          <div style="margin: 5px 0;">Printed on: ${printTime}</div>
          <div style="
            margin: 10px 0 5px 0;
            font-size: 12px;
            color: #555;
          ">
            Software: RGCE SparkDesk v1.4 &nbsp; | &nbsp; Powered by Farhan Tanzid Shiyam
          </div>
          <div style="
            font-size: 11px;
            color: #666;
            margin-top: 10px;
            border-top: 1px dotted #666;
            padding-top: 5px;
          ">
            &copy; 2025 Roza Gift Corner & Electric. All rights reserved.
          </div>
        </div>
      </div>
      
      <div style="height: 50px;"></div>
    </div>
  `;

  const container = document.getElementById('receiptImageContainer');
  container.innerHTML = receiptHtml;
  
  const receiptElement = document.getElementById('receiptForImage');
  
  html2canvas(receiptElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: receiptElement.offsetWidth,
    height: receiptElement.offsetHeight,
    windowWidth: receiptElement.scrollWidth,
    windowHeight: receiptElement.scrollHeight
  }).then(canvas => {
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `Receipt_${customer.name || 'Customer'}_${Date.now()}.jpg`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    container.innerHTML = '';
    
    document.getElementById("downloadReceiptModal").style.display = "none";
    
    showToast("Receipt downloaded successfully as JPG!", "success");
  }).catch(error => {
    console.error('Error generating receipt image:', error);
    showToast('Error generating receipt image. Please try again.', 'error');
    container.innerHTML = '';
  });
}

// Toast Notification System
function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "error") icon = "❌";
  if (type === "warning") icon = "⚠️";
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close">&times;</button>
  `;
  
  toastContainer.appendChild(toast);
  
  const autoRemove = setTimeout(() => {
    toast.classList.add("hiding");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 4000);
  
  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.onclick = function() {
    clearTimeout(autoRemove);
    toast.classList.add("hiding");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  };
}

// Table Action Handlers
customerTableBody.addEventListener("click", function(e){
  let btn = e.target;
  let tr = btn.closest("tr");
  if (!tr) return;
  let id = btn.getAttribute("data-id");
  let idx = customers.findIndex(c => c.id === id);

  if (btn.closest(".action-icons")) {
    if (btn.classList.contains("payment")) {
      if (idx < 0) return;
      showPaymentModal(customers[idx]);
    }
    else if (btn.classList.contains("preview")) {
      if (idx < 0) return;
      showCustomerPreview(customers[idx]);
    }
    else if (btn.classList.contains("edit")) {
      if (idx < 0) return;
      showEditModal(customers[idx]);
    }
    else if (btn.classList.contains("delete")) {
      if (idx < 0) return;
      if (!window.confirm("Delete this customer?")) return;
      customers.splice(idx,1);
      saveCustomers(customers);
      renderTable();
      showToast("Customer deleted successfully!", "success");
    }
  }
});

// Modal Event Listeners
document.getElementById("closePreviewModal").addEventListener('click', () => {
  previewModal.style.display = 'none';
  currentReceiptCustomer = null;
});

previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) {
    previewModal.style.display = 'none';
    currentReceiptCustomer = null;
  }
});

document.getElementById("closeEditModal").addEventListener('click', () => {
  closeEditModal();
});

editModal.addEventListener('click', (e) => {
  if (e.target === editModal) {
    closeEditModal();
  }
});

document.getElementById("cancelEditBtn").addEventListener('click', () => {
  closeEditModal();
});

document.getElementById("saveEditBtn").addEventListener('click', () => {
  saveEditChanges();
});

// Edit form enter key support
document.getElementById("editNameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("editPhoneInput").focus();
  }
});

document.getElementById("editPhoneInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("editAddressSelect").focus();
  }
});

document.getElementById("editAddressSelect").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("editAddressCustomInput").focus();
  }
});

document.getElementById("editAddressCustomInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("editSourceSelect").focus();
  }
});

document.getElementById("editSourceSelect").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("editDueInput").focus();
  }
});

document.getElementById("editDueInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("editPaidInput").focus();
  }
});

document.getElementById("editPaidInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveEditChanges();
  }
});

// Payment Modal Event Listeners
document.getElementById("closePaymentModal").addEventListener('click', () => {
  closePaymentModal();
});

paymentModal.addEventListener('click', (e) => {
  if (e.target === paymentModal) {
    closePaymentModal();
  }
});

document.getElementById("cancelPaymentBtn").addEventListener('click', () => {
  closePaymentModal();
});

document.getElementById("savePaymentBtn").addEventListener('click', () => {
  savePayment();
});

// Transaction type selection
document.querySelectorAll('.transaction-type-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.transaction-type-btn').forEach(b => b.classList.remove('selected'));
    this.classList.add('selected');
    currentTransactionType = this.getAttribute('data-type');
    
    const adjustmentSelector = document.getElementById("adjustmentTypeSelector");
    if (currentTransactionType === "adjustment") {
      adjustmentSelector.style.display = "flex";
    } else {
      adjustmentSelector.style.display = "none";
    }
  });
});

// Adjustment type selection
document.querySelectorAll('.adjustment-type-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.adjustment-type-btn').forEach(b => b.classList.remove('selected'));
    this.classList.add('selected');
    currentAdjustmentType = this.getAttribute('data-adjustment-type');
  });
});

// Payment amount enter key support
document.getElementById("paymentAmountInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("paymentNoteInput").focus();
  }
});

document.getElementById("paymentNoteInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    savePayment();
  }
});

// Print payment receipt button
document.getElementById("printPaymentReceiptBtn").addEventListener('click', function() {
  printPaymentReceipt();
  closePaymentModal();
});

document.getElementById("closeDueInfoModal").addEventListener('click', () => {
  document.getElementById("dueInfoModal").style.display = 'none';
});

document.getElementById("dueInfoModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("dueInfoModal")) {
    document.getElementById("dueInfoModal").style.display = 'none';
  }
});

// Due Info Print Summary Button
document.getElementById("dueInfoPrintSummaryBtn").addEventListener('click', () => {
  document.getElementById("dueInfoModal").style.display = 'none';
  showSummaryReportPasswordModal();
});

document.getElementById("closeClearDataModal").addEventListener('click', () => {
  document.getElementById("clearDataModal").style.display = 'none';
});

document.getElementById("clearDataModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("clearDataModal")) {
    document.getElementById("clearDataModal").style.display = 'none';
  }
});

// Clear Amounts Modal Event Listeners
document.getElementById("closeClearAmountsModal").addEventListener('click', () => {
  document.getElementById("clearAmountsModal").style.display = 'none';
});

document.getElementById("clearAmountsModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("clearAmountsModal")) {
    document.getElementById("clearAmountsModal").style.display = 'none';
  }
});

document.getElementById("cancelClearAmountsBtn").addEventListener('click', () => {
  document.getElementById("clearAmountsModal").style.display = 'none';
});

// Clear Amounts Source Select Change
document.getElementById("clearAmountsSourceSelect").addEventListener('change', function() {
  updateClearAmountsCount();
});

// Clear notes checkbox logic
document.getElementById("clearAmountsOnlyCheckbox").addEventListener('change', function() {
  if (!this.checked) {
    document.getElementById("clearNotesCheckbox").checked = true;
  }
});

document.getElementById("clearNotesCheckbox").addEventListener('change', function() {
  if (this.checked) {
    document.getElementById("clearAmountsOnlyCheckbox").checked = true;
  }
});

function updateClearAmountsCount() {
  const source = document.getElementById("clearAmountsSourceSelect").value;
  let count = 0;
  
  if (source === "all") {
    count = customers.length;
  } else {
    count = customers.filter(c => c.source === source).length;
  }
  
  document.getElementById("clearAmountsCount").textContent = count;
}

// Download Receipt Modal Functions
function showDownloadReceiptModal(customer) {
  currentReceiptCustomer = customer;
  document.getElementById("downloadCustomerName").textContent = capitalizeWords(customer.name || "");
  document.getElementById("downloadReceiptModal").style.display = "flex";
}

document.getElementById("closeDownloadReceiptModal").addEventListener('click', () => {
  document.getElementById("downloadReceiptModal").style.display = 'none';
  currentReceiptCustomer = null;
});

document.getElementById("downloadReceiptModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("downloadReceiptModal")) {
    document.getElementById("downloadReceiptModal").style.display = 'none';
    currentReceiptCustomer = null;
  }
});

document.getElementById("cancelDownloadBtn").addEventListener('click', () => {
  document.getElementById("downloadReceiptModal").style.display = 'none';
  currentReceiptCustomer = null;
});

// Confirm download button
document.getElementById("confirmDownloadBtn").addEventListener('click', function() {
  if (!currentReceiptCustomer) return;
  
  downloadReceiptAsImage(currentReceiptCustomer);
});

// Print Copy Selection Modal Event Listeners
document.getElementById("closePrintCopyModal").addEventListener('click', () => {
  document.getElementById("printCopyModal").style.display = 'none';
  currentReceiptCustomer = null;
});

document.getElementById("printCopyModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("printCopyModal")) {
    document.getElementById("printCopyModal").style.display = 'none';
    currentReceiptCustomer = null;
  }
});

document.getElementById("cancelPrintCopyBtn").addEventListener('click', () => {
  document.getElementById("printCopyModal").style.display = 'none';
  currentReceiptCustomer = null;
});

// Copy option selection
document.querySelectorAll('.copy-option').forEach(option => {
  option.addEventListener('click', function() {
    document.querySelectorAll('.copy-option').forEach(opt => opt.classList.remove('selected'));
    this.classList.add('selected');
    selectedCopyType = this.getAttribute('data-copy');
  });
});

// Confirm print with selected copy type
document.getElementById("confirmPrintCopyBtn").addEventListener('click', function() {
  if (!currentReceiptCustomer) return;
  
  document.getElementById("printCopyModal").style.display = "none";
  printReceipt(currentReceiptCustomer, selectedCopyType);
  currentReceiptCustomer = null;
});

// Shop Details Modal
document.getElementById("closeShopDetailsModal").addEventListener('click', () => {
  document.getElementById("shopDetailsModal").style.display = 'none';
});

document.getElementById("shopDetailsModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("shopDetailsModal")) {
    document.getElementById("shopDetailsModal").style.display = 'none';
  }
});

// Developer Info Modal
document.getElementById("closeDeveloperInfoModal").addEventListener('click', () => {
  document.getElementById("developerInfoModal").style.display = 'none';
});

document.getElementById("developerInfoModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("developerInfoModal")) {
    document.getElementById("developerInfoModal").style.display = 'none';
  }
});

// Transaction Tracking Coming Soon Modal
document.getElementById("closeTrackingComingSoonModal").addEventListener('click', () => {
  document.getElementById("trackingComingSoonModal").style.display = 'none';
});

document.getElementById("trackingComingSoonModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("trackingComingSoonModal")) {
    document.getElementById("trackingComingSoonModal").style.display = 'none';
  }
});

document.getElementById("closeTrackingModalBtn").addEventListener('click', () => {
  document.getElementById("trackingComingSoonModal").style.display = 'none';
});

// Summary Report Password Modal
document.getElementById("closeSummaryReportPasswordModal").addEventListener('click', () => {
  document.getElementById("summaryReportPasswordModal").style.display = 'none';
});

document.getElementById("summaryReportPasswordModal").addEventListener('click', (e) => {
  if (e.target === document.getElementById("summaryReportPasswordModal")) {
    document.getElementById("summaryReportPasswordModal").style.display = 'none';
  }
});

// Print Summary Report Function
function showSummaryReportPasswordModal() {
  document.getElementById("summaryReportPasswordModal").style.display = "flex";
  document.getElementById("summaryReportPasswordInput").value = "";
  document.getElementById("summaryReportPasswordWarning").classList.remove("show");
  
  setTimeout(() => {
    document.getElementById("summaryReportPasswordInput").focus();
  }, 100);
}

function printSummaryReport() {
  let total = customers.length;
  let paid = 0, partial = 0, due = 0, totalDue = 0, totalPaid = 0;
  
  customers.forEach(c => {
    let status = getStatus(c.due, c.paid);
    if (status === "Paid") paid++;
    else if (status === "Partial Paid") partial++;
    else due++;
    totalDue += Number(c.due)||0;
    totalPaid += Number(c.paid)||0;
  });
  let totalCurrentDue = Math.max(0, totalDue-totalPaid);

  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const printTime = now.toLocaleString();

  const activeFilters = [];
  if (addressFilter) activeFilters.push(`Address: ${addressFilter}`);
  if (statusFilter) activeFilters.push(`Status: ${statusFilter}`);
  if (sourceFilter) activeFilters.push(`Source: ${sourceFilter}`);
  if (searchQuery) activeFilters.push(`Search: "${searchQuery}"`);
  
  const filterInfo = activeFilters.length > 0 
    ? `<div style="margin-bottom: 15px; padding: 8px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; font-size: 9pt;">
         <strong>Active Filters:</strong> ${activeFilters.join(' • ')}
       </div>`
    : '';

  const summaryHtml = `
    <div style="margin-top: 20px; border-top: 2px solid #1a2c5b; padding-top: 15px;">
        <h3 style="font-size: 13pt; margin-bottom: 10px; color: #1a2c5b; text-align: center;">SUMMARY REPORT / FINANCIAL SNAPSHOT</h3>
    </div>
    <table style="width: 100%; margin: 10px auto 30px auto; border-collapse: collapse; font-size: 10pt; border: 1px solid #1a2c5b;">
        <thead>
            <tr style="background: #e0efff;">
                <th style="border: 1px solid #1a2c5b; padding: 10px 5px; text-align: center;">Metric</th>
                <th style="border: 1px solid #1a2c5b; padding: 10px 5px; text-align: center;">Count/BDT</th>
                <th style="border: 1px solid #1a2c5b; padding: 10px 5px; text-align: center;">Description</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px 5px; font-weight: bold; text-align: center;">TOTAL CUSTOMERS (Count)</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">${total}</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">Total entries in the system.</td>
            </tr>
            <tr style="background: #f0f0f0;">
                <td style="border: 1px solid #ccc; padding: 8px 5px; font-weight: bold; color: #28a745; text-align: center;">Total Fully Paid (Count)</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center; color: #28a745; font-weight: bold;">${paid}</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">Customers who have fully settled their amount.</td>
            </tr>
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px 5px; font-weight: bold; color: #ffc107; text-align: center;">Total Partial Paid (Count)</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center; color: #ffc107; font-weight: bold;">${partial}</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">Customers who have paid some amount but still owe a balance.</td>
            </tr>
             <tr>
                <td style="border: 1px solid #ccc; padding: 8px 5px; font-weight: bold; color: #dc3545; text-align: center;">Total Due (Count)</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center; color: #dc3545; font-weight: bold;">${due}</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">Customers who have not paid any amount yet.</td>
            </tr>
            
            <tr style="background: #e3eeff;">
                <td style="border: 1px solid #ccc; padding: 10px 5px; font-weight: bold; color: #1a2c5b; text-align: center;">TOTAL DUE AMOUNT (BDT)</td>
                <td style="border: 1px solid #ccc; padding: 10px 5px; text-align: center; font-weight: bold; color: #1a2c5b; font-size: 11pt;">${formatMoney(totalDue)}</td>
                <td style="border: 1px solid #ccc; padding: 10px 5px; color: #1a2c5b; text-align: center;">Total due amount owed to the shop.</td>
            </tr>
            <tr style="background: #e3eeff;">
                <td style="border: 1px solid #ccc; padding: 10px 5px; font-weight: bold; color: #28a745; text-align: center;">TOTAL RECEIVED (BDT)</td>
                <td style="border: 1px solid #ccc; padding: 10px 5px; text-align: center; font-weight: bold; color: #28a745; font-size: 11pt;">${formatMoney(totalPaid)}</td>
                <td style="border: 1px solid #ccc; padding: 10px 5px; color: #28a745; text-align: center;">Total payments received from all customers.</td>
            </tr>
            <tr style="background: #ffecb3;">
                <td style="border: 1px solid #ccc; padding: 12px 5px; font-weight: bold; color: #ffc107; font-size: 11pt; text-align: center;">NET OUTSTANDING BALANCE (BDT)</td>
                <td style="border: 1px solid #ccc; padding: 12px 5px; text-align: center; font-weight: bold; color: #ffc107; font-size: 13pt;">${formatMoney(totalCurrentDue)}</td>
                <td style="border: 1px solid #ccc; padding: 12px 5px; color: #ffc107; font-weight: 500; text-align: center;">The final outstanding balance remaining.</td>
            </tr>
        </tbody>
    </table>
  `;
  
  const shopTitle = "Roza Gift Corner & Electric";
  const shopAddress = "Moshjid Market, Naohata Mor (Chowmashiya), Mohadevpur, Naogaon";
  const shopContact = "+8801715986646";
  const nowDate = new Date();
  const finalFooterHtml = `
    <div style="margin-top: 50px; padding-top: 15px; border-top: 1px solid #ccc; font-size: 10pt; color: #555;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div style="text-align: center; width: 45%;">
                <div style="margin-bottom: 5px;">Prepared By:</div>
                <div style="margin-top: 30px; border-top: 1px dashed #aaa; width: 150px; margin: 30px auto 0 auto;">Signature / Name</div>
            </div>
            <div style="text-align: center; width: 45%;">
                <div style="margin-bottom: 5px;">Verified By:</div>
                <div style="margin-top: 30px; border-top: 1px dashed #aaa; width: 150px; margin: 30px auto 0 auto;">Manager / Owner</div>
            </div>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 9pt; color: #888;">
            Report generated from Roza Gift Corner & Electric - Customer Management System
            <br style="display: block;">Printed on: ${printTime}
            <br style="display: block; font-size: 8.5pt;">
            Software: RGCE SparkDesk v1.4 &nbsp; | &nbsp; Powered by Farhan Tanzid Shiyam
            <br style="display: block;">&copy; 2025 ${shopTitle}. All rights reserved.
        </div>
    </div>
  `;

  const reportHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Summary Report - ${shopTitle}</title>
        <style>
            @page { 
              size: A4;
              margin: 15mm;
            }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              color: #000; 
              margin: 0; 
              padding: 0;
            }
            .print-header { 
                text-align: center; 
                margin-bottom: 25px; 
                color: #1a2c5b; 
                border-bottom: 3px solid #1a2c5b; 
                padding-bottom: 10px; 
            }
            .print-header h1 { font-size: 18pt; margin: 0; }
            .print-header p { font-size: 10pt; margin: 2px 0; }
            .report-title { text-align: center; font-size: 14pt; margin-bottom: 15px; font-weight: bold; }
            
            table {
              width: 100%;
              border-collapse: collapse;
            }
            
            th, td {
              border: 1px solid #000;
              padding: 8px 5px;
              text-align: center !important;
              vertical-align: middle !important;
            }
            
            th {
              background: #f0f0f0 !important;
              font-weight: bold;
            }
            
            .summary-page-break {
              page-break-before: always;
              margin-top: 50px;
            }
            
            .print-footer {
              display: none;
            }
            
            .page-last .print-footer,
            .page-second-last .print-footer {
              display: block;
              position: fixed;
              bottom: 0;
              left: 0;
              width: 100%;
              text-align: center;
              font-size: 10pt;
              color: #555;
              padding: 10px 0;
              border-top: 1px solid #ccc;
            }
            
            .live-date-section {
              text-align: center;
              margin: 15px 0;
              font-size: 11pt;
              font-weight: bold;
              color: #1a2c5b;
              border: 1px solid #1a2c5b;
              padding: 8px;
              background: #f0f8ff;
            }
            
            .filter-info {
              margin: 10px 0 20px 0;
              padding: 10px;
              background: #f9f9f9;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 10pt;
            }
        </style>
    </head>
    <body>
        <div class="summary-page-break">
            <div class="print-header">
                <h1>${shopTitle}</h1>
                <p>${shopAddress}</p>
                <p>Contact: ${shopContact}</p>
            </div>
            
            <div class="live-date-section">
              Report Date: ${dateStr} &nbsp; | &nbsp; Generated on: ${printTime}
            </div>
            
            ${activeFilters.length > 0 ? `
            <div class="filter-info">
              <strong>Filter Status:</strong> ${activeFilters.join(' • ')}
            </div>
            ` : ''}
            
            <div class="report-title">SUMMARY FINANCIAL REPORT</div>
            
            ${summaryHtml}
            ${finalFooterHtml}
        </div>
        
        <div class="print-footer">
            &copy; 2025 ${shopTitle}. All rights reserved. | Printed on: ${printTime}
        </div>
    </body>
    </html>
  `;

  let printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast("Pop-up blockers prevented the report from opening. Please allow pop-ups for this app.", "error");
    return;
  }
  printWindow.document.write(reportHtml);
  printWindow.document.close();
  printWindow.focus();
  
  setTimeout(() => {
    printWindow.print();
    showToast("Summary report opened for printing!", "success");
  }, 300);
}

// Print Report Functionality
function printReport(data) {
  let paid = 0, partial = 0, due = 0, totalDue = 0, totalPaid = 0;
  
  data.forEach(c => {
    let status = getStatus(c.due, c.paid);
    if (status === "Paid") paid++;
    else if (status === "Partial Paid") partial++;
    else due++;
    totalDue += Number(c.due)||0;
    totalPaid += Number(c.paid)||0;
  });
  let totalCurrentDue = Math.max(0, totalDue-totalPaid);

  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const printTime = now.toLocaleString();

  const activeFilters = [];
  if (addressFilter) activeFilters.push(`Address: ${addressFilter}`);
  if (statusFilter) activeFilters.push(`Status: ${statusFilter}`);
  if (sourceFilter) activeFilters.push(`Source: ${sourceFilter}`);
  if (searchQuery) activeFilters.push(`Search: "${searchQuery}"`);
  
  const filterInfo = activeFilters.length > 0 
    ? `<div style="margin: 10px 0 15px 0; padding: 8px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; font-size: 9pt;">
         <strong>Filter Status:</strong> ${activeFilters.join(' • ')}
       </div>`
    : '';

  let tableHtml = `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 10pt;">
      <thead>
        <tr style="background: #f0f0f0; border: 1px solid #000;">
          <th style="border: 1px solid #000; padding: 8px 5px; text-align: center;">SL</th>
          <th style="border: 1px solid #000; padding: 8px 5px; text-align: center;">Name</th>
          <th style="border: 1px solid #000; padding: 8px 5px; text-align: center;">Address</th>
          <th style="border: 1px solid #000; padding: 8px 5px; text-align: center;">Source</th>
          <th style="border: 1px solid #000; padding: 8px 5px; text-align: center; font-style: italic;">Status</th>
          <th style="border: 1px solid #000; padding: 8px 5px; text-align: center;">Due Amount</th>
          <th style="border: 1px solid #000; padding: 8px 5px; text-align: center;">Paid Amount</th>
          <th style="border: 1px solid #000; padding: 8px 5px; text-align: center;">Current Balance</th>
        </tr>
      </thead>
      <tbody>
  `;
  data.forEach((c, idx) => {
    let status = getStatus(c.due, c.paid);
    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f7f7f7';
    tableHtml += `
      <tr style="background: ${rowBg};">
        <td style="border: 1px solid #ccc; padding: 6px 5px; text-align: center;">${idx+1}</td>
        <td style="border: 1px solid #ccc; padding: 6px 5px; text-align: center;">${capitalizeWords(c.name||"")}</td>
        <td style="border: 1px solid #ccc; padding: 6px 5px; text-align: center;">${capitalizeWords(c.address||"")}</td>
        <td style="border: 1px solid #ccc; padding: 6px 5px; text-align: center;">${c.source||""}</td>
        <td style="border: 1px solid #ccc; padding: 6px 5px; text-align: center; font-style: italic;">${status}</td>
        <td style="border: 1px solid #ccc; padding: 6px 5px; text-align: center;">${formatMoney(c.due)}</td>
        <td style="border: 1px solid #ccc; padding: 6px 5px; text-align: center;">${formatMoney(c.paid)}</td>
        <td style="border: 1px solid #ccc; padding: 6px 5px; text-align: center;">${formatMoney(Math.max(0, (Number(c.due)||0)-(Number(c.paid)||0)))}</td>
      </tr>
    `;
  });
  tableHtml += '</tbody></table>';

  const extraFooterHtml = `
    <div style="margin-top: 20px; padding: 8px; background: #f5f5f5; border-top: 1px solid #ccc; font-size: 9pt; text-align: center;">
      <strong>END OF CUSTOMER REPORT</strong> | Total Entries: ${data.length} | Generated by Roza Gift Corner & Electric - Customer Management System
    </div>
    <div style="text-align: center; margin-top: 10px; font-size: 8pt; color: #888; border-top: 1px dotted #ccc; padding-top: 5px;">
      &copy; 2025 Roza Gift Corner & Electric. All rights reserved. Unauthorized copying or distribution is prohibited.
    </div>
  `;
  
  const summaryHtml = `
    <div style="margin-top: 40px; border-top: 2px solid #1a2c5b; padding-top: 15px;">
        <h3 style="font-size: 13pt; margin-bottom: 10px; color: #1a2c5b; text-align: center;">REPORT SUMMARY / FINANCIAL SNAPSHOT</h3>
    </div>
    <table style="width: 100%; margin: 10px auto 30px auto; border-collapse: collapse; font-size: 10pt; border: 1px solid #1a2c5b;">
        <thead>
            <tr style="background: #e0efff;">
                <th style="border: 1px solid #1a2c5b; padding: 10px 5px; text-align: center;">Metric</th>
                <th style="border: 1px solid #1a2c5b; padding: 10px 5px; text-align: center;">Count/BDT</th>
                <th style="border: 1px solid #1a2c5b; padding: 10px 5px; text-align: center;">Description</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px 5px; font-weight: bold; text-align: center;">TOTAL CUSTOMERS (Count)</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">${data.length}</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">Total entries included in this report.</td>
            </tr>
            <tr style="background: #f0f0f0;">
                <td style="border: 1px solid #ccc; padding: 8px 5px; font-weight: bold; color: #28a745; text-align: center;">Total Fully Paid (Count)</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center; color: #28a745; font-weight: bold;">${paid}</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">Customers who have fully settled their amount.</td>
            </tr>
            <tr>
                <td style="border: 1px solid #ccc; padding: 8px 5px; font-weight: bold; color: #ffc107; text-align: center;">Total Partial Paid (Count)</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center; color: #ffc107; font-weight: bold;">${partial}</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">Customers who have paid some amount but still owe a balance.</td>
            </tr>
             <tr>
                <td style="border: 1px solid #ccc; padding: 8px 5px; font-weight: bold; color: #dc3545; text-align: center;">Total Due (Count)</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center; color: #dc3545; font-weight: bold;">${due}</td>
                <td style="border: 1px solid #ccc; padding: 8px 5px; text-align: center;">Customers who have not paid any amount yet.</td>
            </tr>
            
            <tr style="background: #e3eeff;">
                <td style="border: 1px solid #ccc; padding: 10px 5px; font-weight: bold; color: #1a2c5b; text-align: center;">TOTAL DUE AMOUNT (BDT)</td>
                <td style="border: 1px solid #ccc; padding: 10px 5px; text-align: center; font-weight: bold; color: #1a2c5b; font-size: 11pt;"></td>
                <td style="border: 1px solid #ccc; padding: 10px 5px; color: #1a2c5b; text-align: center;">Total due amount owed to the shop.</td>
            </tr>
            <tr style="background: #e3eeff;">
                <td style="border: 1px solid #ccc; padding: 10px 5px; font-weight: bold; color: #28a745; text-align: center;">TOTAL RECEIVED (BDT)</td>
                <td style="border: 1px solid #ccc; padding: 10px 5px; text-align: center; font-weight: bold; color: #28a745; font-size: 11pt;"></td>
                <td style="border: 1px solid #ccc; padding: 10px 5px; color: #28a745; text-align: center;">Total payments received from all customers.</td>
            </tr>
            <tr style="background: #ffecb3;">
                <td style="border: 1px solid #ccc; padding: 12px 5px; font-weight: bold; color: #ffc107; font-size: 11pt; text-align: center;">NET OUTSTANDING BALANCE (BDT)</td>
                <td style="border: 1px solid #ccc; padding: 12px 5px; text-align: center; font-weight: bold; color: #ffc107; font-size: 13pt;"></td>
                <td style="border: 1px solid #ccc; padding: 12px 5px; color: #ffc107; font-weight: 500; text-align: center;">The final outstanding balance remaining.</td>
            </tr>
        </tbody>
    </table>
  `;
  
  const shopTitle = "Roza Gift Corner & Electric";
  const shopAddress = "Moshjid Market, Naohata Mor (Chowmashiya), Mohadevpur, Naogaon";
  const shopContact = "+8801715986646";

  const finalFooterHtml = `
    <div style="margin-top: 50px; padding-top: 15px; border-top: 1px solid #ccc; font-size: 10pt; color: #555;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div style="text-align: center; width: 45%;">
                <div style="margin-bottom: 5px;">Prepared By:</div>
                <div style="margin-top: 30px; border-top: 1px dashed #aaa; width: 150px; margin: 30px auto 0 auto;">Signature / Name</div>
            </div>
            <div style="text-align: center; width: 45%;">
                <div style="margin-bottom: 5px;">Verified By:</div>
                <div style="margin-top: 30px; border-top: 1px dashed #aaa; width: 150px; margin: 30px auto 0 auto;">Manager / Owner</div>
            </div>
        </div>
        <div style="text-align: center; margin-top: 20px; font-size: 9pt; color: #888;">
            Report generated from Roza Gift Corner & Electric - Customer Management System
            <br style="display: block;">Printed on: ${printTime}
            <br style="display: block; font-size: 8.5pt;">
            Software: RGCE SparkDesk v1.4 &nbsp; | &nbsp; Powered by Farhan Tanzid Shiyam
            <br style="display: block;">&copy; 2025 ${shopTitle}. All rights reserved.
        </div>
    </div>
  `;

  const reportHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Customer Report - ${shopTitle}</title>
        <style>
            @page { 
              size: A4;
              margin: 15mm;
            }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              color: #000; 
              margin: 0; 
              padding: 0;
            }
            .print-header { 
                text-align: center; 
                margin-bottom: 15px; 
                color: #1a2c5b; 
                border-bottom: 3px solid #1a2c5b; 
                padding-bottom: 10px; 
            }
            .print-header h1 { font-size: 18pt; margin: 0; }
            .print-header p { font-size: 10pt; margin: 2px 0; }
            .report-title { text-align: center; font-size: 14pt; margin-bottom: 10px; font-weight: bold; }
            
            .live-date-section {
              text-align: center;
              margin: 10px 0 15px 0;
              font-size: 11pt;
              font-weight: bold;
              color: #1a2c5b;
              border: 1px solid #1a2c5b;
              padding: 6px;
              background: #f0f8ff;
            }
            
            .filter-info {
              margin: 10px 0 15px 0;
              padding: 8px;
              background: #f5f5f5;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 9pt;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
            }
            
            th, td {
              border: 1px solid #000;
              padding: 8px 5px;
              text-align: center !important;
              vertical-align: middle !important;
            }
            
            th {
              background: #f0f0f0 !important;
              font-weight: bold;
            }
            
            .page-break {
              page-break-before: always;
              margin-top: 50px;
            }
            
            .print-footer {
              display: none;
            }
            
            .page-last .print-footer,
            .page-second-last .print-footer {
              display: block;
              position: fixed;
              bottom: 0;
              left: 0;
              width: 100%;
              text-align: center;
              font-size: 10pt;
              color: #555;
              padding: 10px 0;
              border-top: 1px solid #ccc;
            }
        </style>
    </head>
    <body>
        <div class="print-header">
            <h1>${shopTitle}</h1>
            <p>${shopAddress}</p>
            <p>Contact: ${shopContact}</p>
        </div>
        
        <div class="live-date-section">
          Report Date: ${dateStr} &nbsp; | &nbsp; Generated on: ${printTime}
        </div>
        
        ${filterInfo}
        
        <div class="report-title">CUSTOMER REPORT (Total Entries: ${data.length})</div>
        
        ${tableHtml}
        ${extraFooterHtml}
        
        <div class="page-break">
            <div class="print-header">
                <h1>${shopTitle}</h1>
                <p>${shopAddress}</p>
                <p>Contact: ${shopContact}</p>
            </div>
            
            <div class="live-date-section">
              Report Date: ${dateStr} &nbsp; | &nbsp; Generated on: ${printTime}
            </div>
            
            <div class="report-title">REPORT SUMMARY</div>
            
            ${summaryHtml}
            ${finalFooterHtml}
        </div>
        
        <div class="print-footer">
            &copy; 2025 ${shopTitle}. All rights reserved. | Printed on: ${printTime}
        </div>
    </body>
    </html>
  `;

  let printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast("Pop-up blockers prevented the report from opening. Please allow pop-ups for this app.", "error");
    return;
  }
  printWindow.document.write(reportHtml);
  printWindow.document.close();
  printWindow.focus();
  
  setTimeout(() => {
    printWindow.print();
    showToast("Customer report opened for printing!", "success");
  }, 300);
}

// Sidebar Functionality
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");

function initializeSidebar() {
  const isExpanded = loadSidebarState();
  if (isExpanded) {
    sidebar.classList.add("expanded");
    sidebarToggle.innerHTML = '<span class="btn-icon">☰</span><span>Collapse Menu</span>';
  } else {
    sidebar.classList.remove("expanded");
    sidebarToggle.innerHTML = '<span class="btn-icon">☰</span><span>Expand Menu</span>';
  }
}

sidebarToggle.addEventListener("click", function() {
  const isExpanded = sidebar.classList.contains("expanded");
  if (isExpanded) {
    sidebar.classList.remove("expanded");
    sidebarToggle.innerHTML = '<span class="btn-icon">☰</span><span>Expand Menu</span>';
    saveSidebarState(false);
    showToast("Sidebar collapsed", "info");
  } else {
    sidebar.classList.add("expanded");
    sidebarToggle.innerHTML = '<span class="btn-icon">☰</span><span>Collapse Menu</span>';
    saveSidebarState(true);
    showToast("Sidebar expanded", "info");
  }
});

// Sidebar Button Event Listeners
document.getElementById("sidebarShopDetails").addEventListener("click", function() {
  document.getElementById("shopDetailsModal").style.display = "flex";
  showToast("Shop details opened", "info");
});

document.getElementById("sidebarDeveloperInfo").addEventListener("click", function() {
  document.getElementById("developerInfoModal").style.display = "flex";
  showToast("Developer info opened", "info");
});

document.getElementById("sidebarTrackTransactions").addEventListener("click", function() {
  document.getElementById("trackingComingSoonModal").style.display = "flex";
  showToast("Transaction Tracking feature coming soon!", "info");
});

document.getElementById("sidebarDueReport").addEventListener("click", function() {
  showDueInfoModal();
});

document.getElementById("sidebarPrintReport").addEventListener("click", function() {
  printReport(currentDisplayCustomers);
});

let filterVisible = false;
let statsVisible = false;

document.getElementById("sidebarAdvancedFilter").addEventListener("click", function() {
  const filterRow = document.getElementById("searchFilterRow");
  
  if (filterVisible) {
    filterRow.style.display = "none";
    this.classList.remove("active");
    showToast("Advanced filters hidden", "info");
  } else {
    filterRow.style.display = "flex";
    this.classList.add("active");
    showToast("Advanced filters shown", "info");
  }
  
  filterVisible = !filterVisible;
});

document.getElementById("sidebarLiveStats").addEventListener("click", function() {
  const statsSection = document.getElementById("statsSection");
  
  if (statsVisible) {
    statsSection.style.display = "none";
    this.classList.remove("active");
    showToast("Live stats hidden", "info");
  } else {
    statsSection.style.display = "flex";
    this.classList.add("active");
    showToast("Live stats shown", "info");
  }
  
  statsVisible = !statsVisible;
});

// Print Filtered Button
document.getElementById("printFilteredBtn").addEventListener("click", function() {
  printReport(currentDisplayCustomers);
});

document.getElementById("sidebarBackupData").addEventListener("click", function() {
  let data = JSON.stringify(customers, null, 2);
  let blob = new Blob([data], {type:"application/json"});
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "roza_customers_backup.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  showToast("Data backup downloaded successfully!", "success");
});

document.getElementById("sidebarRestoreData").addEventListener("click", function() {
  document.getElementById("uploadInput").click();
  showToast("Select a backup file to restore data", "info");
});

// Clear Amounts Button
document.getElementById("sidebarClearAmounts").addEventListener("click", function() {
  document.getElementById("clearAmountsModal").style.display = "flex";
  document.getElementById("clearAmountsPasswordInput").value = "";
  document.getElementById("clearAmountsPasswordWarning").classList.remove("show");
  document.getElementById("clearAmountsSourceSelect").value = "all";
  document.getElementById("clearAmountsOnlyCheckbox").checked = true;
  document.getElementById("clearNotesCheckbox").checked = false;
  updateClearAmountsCount();
  
  setTimeout(() => {
    document.getElementById("clearAmountsPasswordInput").focus();
  }, 100);
});

document.getElementById("sidebarClearData").addEventListener("click", function() {
  document.getElementById("clearDataModal").style.display = "flex";
  document.getElementById("clearDataPasswordInput").value = "";
  document.getElementById("clearDataPasswordWarning").classList.remove("show");
  
  setTimeout(() => {
    document.getElementById("clearDataPasswordInput").focus();
  }, 100);
});

// Summary Report Password Handler
document.getElementById("summaryReportPasswordBtn").addEventListener("click", function(){
  const password = document.getElementById("summaryReportPasswordInput").value;
  if (password === "3508") {
    document.getElementById("summaryReportPasswordModal").style.display = "none";
    printSummaryReport();
  } else {
    document.getElementById("summaryReportPasswordWarning").classList.add("show");
    document.getElementById("summaryReportPasswordInput").value = "";
    document.getElementById("summaryReportPasswordInput").focus();
    showToast("Incorrect password!", "error");
  }
});

// Summary Report Enter Key Handler
document.getElementById("summaryReportPasswordInput").addEventListener("keydown", function(e){
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("summaryReportPasswordBtn").click();
  }
});

// Add Customer Button Event Listener
document.getElementById("addCustomerBtn").addEventListener("click", function(){
  const formContainer = document.getElementById("customerFormContainer");
  const isVisible = formContainer.classList.contains("show");
  
  if (isVisible) {
    formContainer.classList.remove("show");
    this.classList.remove("active");
    showToast("Add customer form hidden", "info");
  } else {
    formContainer.classList.add("show");
    this.classList.add("active");
    showToast("Add customer form shown", "info");
    setTimeout(() => {
      document.getElementById("nameInput").focus();
    }, 100);
  }
});

// Dark Mode Toggle
const darkModeToggle = document.getElementById("topBarDarkModeToggle");
const toggleSlider = document.getElementById("topBarToggleSlider");

function setDarkMode(on) {
  document.body.setAttribute("data-theme", on ? "dark" : "light");
  toggleSlider.setAttribute("data-checked", on ? "true" : "false");
  localStorage.setItem("roza_darkmode", on ? "1" : "0");
}

darkModeToggle.addEventListener("click", function(){
  let isDark = document.body.getAttribute("data-theme") === "dark";
  setDarkMode(!isDark);
  showToast(`Dark mode ${!isDark ? 'enabled' : 'disabled'}`, "info");
});

if (localStorage.getItem("roza_darkmode") === "1") setDarkMode(true);

// Data Backup and Restore
document.getElementById("uploadInput").addEventListener("change", function(e){
  let file = e.target.files[0];
  if (!file) return;
  let reader = new FileReader();
  reader.onload = function(ev){
    try {
      let arr = JSON.parse(ev.target.result);
      if (Array.isArray(arr)) {
        if (arr.length > 10000) {
          showToast("Too many customers (max 10,000)", "error");
          return;
        }
        customers = arr;
        saveCustomers(customers);
        renderTable();
        showToast("Data restored successfully!", "success");
      }
    } catch {
      showToast("Invalid file format!", "error");
    }
  };
  reader.readAsText(file);
  this.value = "";
});

// Due Info Password Handler
document.getElementById("dueInfoPasswordBtn").addEventListener("click", function(){
  const password = document.getElementById("dueInfoPasswordInput").value;
  if (password === "3508") {
    showDueInfoDetails();
    showToast("Due information displayed", "success");
  } else {
    document.getElementById("dueInfoPasswordWarning").classList.add("show");
    document.getElementById("dueInfoPasswordInput").value = "";
    document.getElementById("dueInfoPasswordInput").focus();
    showToast("Incorrect password!", "error");
  }
});

// Due Info Enter Key Handler
document.getElementById("dueInfoPasswordInput").addEventListener("keydown", function(e){
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("dueInfoPasswordBtn").click();
  }
});

// Clear Amounts Password Handler
document.getElementById("clearAmountsPasswordBtn").addEventListener("click", function(){
  const password = document.getElementById("clearAmountsPasswordInput").value;
  if (password === "3508") {
    const source = document.getElementById("clearAmountsSourceSelect").value;
    const clearNotes = document.getElementById("clearNotesCheckbox").checked;
    let clearedCount = 0;
    let notesClearedCount = 0;
    
    customers.forEach(c => {
      if (source === "all" || c.source === source) {
        c.due = 0;
        c.paid = 0;
        clearedCount++;
        
        if (clearNotes && c.note) {
          c.note = "";
          notesClearedCount++;
        }
      }
    });
    
    saveCustomers(customers);
    renderTable();
    document.getElementById("clearAmountsModal").style.display = "none";
    
    let message = `Cleared amounts for ${clearedCount} customer(s)`;
    if (clearNotes && notesClearedCount > 0) {
      message += ` and cleared notes for ${notesClearedCount} customer(s)`;
    }
    
    showToast(message, "success");
  } else {
    document.getElementById("clearAmountsPasswordWarning").classList.add("show");
    document.getElementById("clearAmountsPasswordInput").value = "";
    document.getElementById("clearAmountsPasswordInput").focus();
    showToast("Incorrect password!", "error");
  }
});

// Clear Amounts Enter Key Handler
document.getElementById("clearAmountsPasswordInput").addEventListener("keydown", function(e){
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("clearAmountsPasswordBtn").click();
  }
});

// Clear Data Password Handler
document.getElementById("clearDataPasswordBtn").addEventListener("click", function(){
  const password = document.getElementById("clearDataPasswordInput").value;
  if (password === "1812693380") {
    localStorage.removeItem(STORAGE_KEY);
    customers = [];
    saveCustomers(customers);
    renderTable();
    document.getElementById("clearDataModal").style.display = "none";
    showToast("All customer data has been cleared!", "warning");
  } else {
    document.getElementById("clearDataPasswordWarning").classList.add("show");
    document.getElementById("clearDataPasswordInput").value = "";
    document.getElementById("clearDataPasswordInput").focus();
    showToast("Incorrect password!", "error");
  }
});

// Clear Data Enter Key Handler
document.getElementById("clearDataPasswordInput").addEventListener("keydown", function(e){
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("clearDataPasswordBtn").click();
  }
});

// Initialize Application
setupQuickAddFlow();
initializeSidebar();
renderTable();

// Show welcome toast
setTimeout(() => {
  showToast("Welcome to RGCE SparkDesk v1.4!", "info");
}, 1000);