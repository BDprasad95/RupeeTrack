/* ═══════════════════════════════════════════════
   RUPEETRACK — app.js
   All logic: storage, navigation, forms, charts,
   bill scanner (Claude Vision), Excel export
═══════════════════════════════════════════════ */

// ── STATE ──────────────────────────────────────
let transactions = JSON.parse(localStorage.getItem('rt_transactions') || '[]');
let apiKey = localStorage.getItem('rt_api_key') || '';
let categoryChartInst = null;
let dailyChartInst    = null;
let rptCatChartInst   = null;
let rptDailyChartInst = null;
let scannedAmount     = 0;

const COLORS = {
  violet: '#7C3AED',
  cyan:   '#06B6D4',
  green:  '#10B981',
  red:    '#EF4444',
  amber:  '#F59E0B',
  pink:   '#EC4899',
  blue:   '#3B82F6',
  orange: '#F97316'
};
const CAT_COLORS = {
  Food:       COLORS.green,
  Transport:  COLORS.cyan,
  Shopping:   COLORS.violet,
  Utilities:  COLORS.amber,
  Income:     COLORS.blue,
  Freelance:  COLORS.pink,
  Gift:       COLORS.orange,
  Other:      '#6B7280'
};

// ── HELPERS ────────────────────────────────────
const fmt = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = d => d.slice(0, 7);

function save() {
  localStorage.setItem('rt_transactions', JSON.stringify(transactions));
}

function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  const icons = { success: 'ri-checkbox-circle-fill', error: 'ri-close-circle-fill', info: 'ri-information-fill' };
  t.innerHTML = `<i class="${icons[type]}"></i> ${msg}`;
  t.className = `toast show ${type}`;
  setTimeout(() => { t.classList.remove('show'); }, 3000);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── NAVIGATION ─────────────────────────────────
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');

  // Refresh data for certain pages
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'history')   renderHistory();
  if (pageId === 'report')    renderReport();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});

document.querySelectorAll('[data-page]').forEach(el => {
  if (!el.classList.contains('nav-item')) {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  }
});

// Mobile sidebar toggle
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
});
document.getElementById('sidebarOverlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
});

// ── DASHBOARD ──────────────────────────────────
function renderDashboard() {
  const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits  = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const balance = credits - debits;

  document.getElementById('totalCredits').textContent  = fmt(credits);
  document.getElementById('totalDebits').textContent   = fmt(debits);
  document.getElementById('netBalance').textContent    = fmt(balance);
  document.getElementById('txnCount').textContent      = transactions.length;
  document.getElementById('headerBalance').textContent = fmt(balance);
  document.getElementById('netBalance').style.color    = balance >= 0 ? 'var(--cyan)' : 'var(--red)';
  document.getElementById('headerBalance').style.color = balance >= 0 ? 'var(--cyan)' : 'var(--red)';

  // Date
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  renderCategoryChart();
  renderDailyChart();
  renderRecentTxns();
}

function renderCategoryChart() {
  const debitTxns = transactions.filter(t => t.type === 'debit');
  const catTotals = {};
  debitTxns.forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(catTotals);
  const data   = Object.values(catTotals);
  const bgColors = labels.map(l => CAT_COLORS[l] || '#6B7280');

  const ctx = document.getElementById('categoryChart').getContext('2d');
  if (categoryChartInst) categoryChartInst.destroy();

  if (!labels.length) {
    categoryChartInst = null;
    return;
  }

  categoryChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 12 }
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` }
        }
      },
      cutout: '65%'
    }
  });
}

function renderDailyChart() {
  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));

  const creditByDay = {};
  const debitByDay  = {};
  days.forEach(d => { creditByDay[d] = 0; debitByDay[d] = 0; });

  transactions.filter(t => t.date.startsWith(ym)).forEach(t => {
    const day = t.date.slice(8, 10);
    if (t.type === 'credit') creditByDay[day] = (creditByDay[day] || 0) + t.amount;
    else                      debitByDay[day]  = (debitByDay[day]  || 0) + t.amount;
  });

  const ctx = document.getElementById('dailyChart').getContext('2d');
  if (dailyChartInst) dailyChartInst.destroy();

  dailyChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map(d => +d),
      datasets: [
        { label: 'Credits', data: days.map(d => creditByDay[d]), backgroundColor: 'rgba(16,185,129,.7)', borderRadius: 4 },
        { label: 'Debits',  data: days.map(d => debitByDay[d]),  backgroundColor: 'rgba(239,68,68,.7)',  borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } }
      },
      scales: {
        x: { ticks: { color: '#6B7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: {
          ticks: {
            color: '#6B7280', font: { size: 10 },
            callback: v => v >= 1000 ? '₹' + (v/1000).toFixed(1) + 'k' : '₹' + v
          },
          grid: { color: 'rgba(255,255,255,.04)' }
        }
      }
    }
  });
}

function renderRecentTxns() {
  const el   = document.getElementById('recentTxnList');
  const list = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  el.innerHTML = list.length ? list.map(txnHTML).join('') : emptyHTML();
  attachDeleteListeners(el);
}

// ── TRANSACTION HTML ────────────────────────────
function txnHTML(t) {
  const isCredit = t.type === 'credit';
  const dateStr  = new Date(t.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `
  <div class="txn-item" data-id="${t.id}">
    <div class="txn-icon ${t.type}">
      <i class="ri-${isCredit ? 'arrow-down' : 'arrow-up'}-circle-fill"></i>
    </div>
    <div class="txn-info">
      <div class="txn-desc">${t.description || 'No description'}</div>
      <div class="txn-meta">
        <span>${dateStr}</span>
        <span class="txn-cat-badge">${t.category}</span>
      </div>
    </div>
    <span class="txn-amount ${t.type}">${isCredit ? '+' : '-'}${fmt(t.amount)}</span>
    <button class="txn-delete" data-id="${t.id}" title="Delete"><i class="ri-delete-bin-6-line"></i></button>
  </div>`;
}

function emptyHTML() {
  return `<div class="empty-state"><i class="ri-inbox-2-line"></i><p>No transactions found</p></div>`;
}

function attachDeleteListeners(container) {
  container.querySelectorAll('.txn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (confirm('Delete this transaction?')) {
        transactions = transactions.filter(t => t.id !== id);
        save();
        toast('Transaction deleted', 'error');
        renderDashboard();
        renderHistory();
        renderReport();
      }
    });
  });
}

// ── ADD CREDIT ──────────────────────────────────
document.getElementById('creditDate').value = today();

document.getElementById('saveCreditBtn').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('creditAmount').value);
  const desc   = document.getElementById('creditDesc').value.trim();
  const date   = document.getElementById('creditDate').value;
  const cat    = document.getElementById('creditCategory').value;

  if (!amount || amount <= 0) return toast('Please enter a valid amount', 'error');
  if (!date)                  return toast('Please select a date', 'error');

  const txn = { id: genId(), type: 'credit', amount, description: desc || 'Credit entry', date, category: cat };
  transactions.push(txn);
  save();
  toast(`Credit of ${fmt(amount)} added!`, 'success');

  // Reset
  document.getElementById('creditAmount').value = '';
  document.getElementById('creditDesc').value   = '';
  document.getElementById('creditDate').value   = today();
  resetTagSelect('creditCatTags', 'creditCategory', 'Income');

  renderDashboard();
});

// ── ADD DEBIT ───────────────────────────────────
document.getElementById('debitDate').value = today();

document.getElementById('saveDebitBtn').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('debitAmount').value);
  const desc   = document.getElementById('debitDesc').value.trim();
  const date   = document.getElementById('debitDate').value;
  const cat    = document.getElementById('debitCategory').value;

  if (!amount || amount <= 0) return toast('Please enter a valid amount', 'error');
  if (!date)                  return toast('Please select a date', 'error');

  const txn = { id: genId(), type: 'debit', amount, description: desc || 'Debit entry', date, category: cat };
  transactions.push(txn);
  save();
  toast(`Debit of ${fmt(amount)} recorded!`, 'info');

  document.getElementById('debitAmount').value = '';
  document.getElementById('debitDesc').value   = '';
  document.getElementById('debitDate').value   = today();
  resetTagSelect('debitCatTags', 'debitCategory', 'Food');

  renderDashboard();
});

// ── TAG SELECT LOGIC ────────────────────────────
function initTagSelect(containerId, hiddenId) {
  const container = document.getElementById(containerId);
  const hidden    = document.getElementById(hiddenId);
  container.querySelectorAll('.tag').forEach(tag => {
    tag.addEventListener('click', () => {
      container.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      hidden.value = tag.dataset.val;
    });
  });
}

function resetTagSelect(containerId, hiddenId, defaultVal) {
  const container = document.getElementById(containerId);
  const hidden    = document.getElementById(hiddenId);
  container.querySelectorAll('.tag').forEach(t => {
    t.classList.toggle('active', t.dataset.val === defaultVal);
  });
  hidden.value = defaultVal;
}

initTagSelect('creditCatTags', 'creditCategory');
initTagSelect('debitCatTags',  'debitCategory');
initTagSelect('scanCatTags',   'scanCategory');

// ── BILL SCANNER ────────────────────────────────
document.getElementById('scanDate').value = today();

// API Key
if (apiKey) {
  document.getElementById('apiKeyInput').value = '••••••••••••••••';
  document.getElementById('apiSavedMsg').style.display = 'flex';
}

document.getElementById('saveApiKey').addEventListener('click', () => {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key.startsWith('sk-ant')) return toast('Invalid API key format', 'error');
  apiKey = key;
  localStorage.setItem('rt_api_key', key);
  document.getElementById('apiSavedMsg').style.display = 'flex';
  toast('API Key saved!', 'success');
});

// Upload zone
const uploadZone = document.getElementById('uploadZone');
const billFile   = document.getElementById('billFile');

uploadZone.addEventListener('click', () => billFile.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--violet)'; });
uploadZone.addEventListener('dragleave', ()  => { uploadZone.style.borderColor = ''; });
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file) previewBill(file);
});

billFile.addEventListener('change', () => {
  if (billFile.files[0]) previewBill(billFile.files[0]);
});

function previewBill(file) {
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('billImg').src = e.target.result;
    document.getElementById('billPreviewWrap').style.display = 'block';
    document.getElementById('scanBtn').style.display = 'flex';
    document.getElementById('scanResult').style.display = 'none';
    uploadZone.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

document.getElementById('removeImg').addEventListener('click', () => {
  document.getElementById('billImg').src           = '';
  document.getElementById('billPreviewWrap').style.display = 'none';
  document.getElementById('scanBtn').style.display = 'none';
  document.getElementById('scanResult').style.display = 'none';
  uploadZone.style.display = 'block';
  billFile.value = '';
});

document.getElementById('scanBtn').addEventListener('click', async () => {
  if (!apiKey) return toast('Please save your Anthropic API key first', 'error');

  const imgSrc = document.getElementById('billImg').src;
  if (!imgSrc) return toast('Please upload a bill image first', 'error');

  // Convert to base64 for API
  const base64 = imgSrc.split(',')[1];
  const mimeType = imgSrc.split(';')[0].split(':')[1] || 'image/jpeg';

  document.getElementById('scanBtn').style.display    = 'none';
  document.getElementById('scanLoader').style.display = 'flex';
  document.getElementById('scanResult').style.display = 'none';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text',  text: 'Look at this bill/receipt image. Extract ONLY the grand total or final payable amount. Reply with ONLY the numeric value (no currency symbol, no text). Example: 450.00' }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);

    const raw  = data.content?.[0]?.text?.trim() || '';
    const num  = parseFloat(raw.replace(/[^0-9.]/g, ''));

    if (isNaN(num) || num <= 0) throw new Error('Could not detect a valid amount');

    scannedAmount = num;
    document.getElementById('scannedTotal').textContent = fmt(num);
    document.getElementById('scanLoader').style.display = 'none';
    document.getElementById('scanResult').style.display = 'block';
    toast('Bill scanned successfully!', 'success');

  } catch (err) {
    document.getElementById('scanLoader').style.display = 'none';
    document.getElementById('scanBtn').style.display    = 'flex';
    toast('Scan failed: ' + err.message, 'error');
  }
});

document.getElementById('addScannedDebit').addEventListener('click', () => {
  if (!scannedAmount) return toast('No scanned amount found', 'error');
  const desc = document.getElementById('scanDesc').value.trim() || 'Scanned bill';
  const cat  = document.getElementById('scanCategory').value;
  const date = document.getElementById('scanDate').value || today();

  const txn = { id: genId(), type: 'debit', amount: scannedAmount, description: desc, date, category: cat };
  transactions.push(txn);
  save();
  toast(`${fmt(scannedAmount)} added as debit!`, 'info');

  // Reset scanner
  document.getElementById('removeImg').click();
  document.getElementById('scanDesc').value = '';
  document.getElementById('scanDate').value = today();
  resetTagSelect('scanCatTags', 'scanCategory', 'Food');
  scannedAmount = 0;

  renderDashboard();
});

// ── HISTORY ─────────────────────────────────────
function renderHistory() {
  const typeFilter = document.getElementById('filterType').value;
  const catFilter  = document.getElementById('filterCategory').value;
  const monthFilter= document.getElementById('filterMonth').value;

  let list = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (typeFilter !== 'all')  list = list.filter(t => t.type === typeFilter);
  if (catFilter  !== 'all')  list = list.filter(t => t.category === catFilter);
  if (monthFilter)           list = list.filter(t => t.date.startsWith(monthFilter));

  const el = document.getElementById('fullTxnList');
  el.innerHTML = list.length ? list.map(txnHTML).join('') : emptyHTML();
  attachDeleteListeners(el);
}

['filterType', 'filterCategory', 'filterMonth'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderHistory);
});

// ── MONTHLY REPORT ──────────────────────────────
function populateMonthSelector() {
  const select = document.getElementById('reportMonth');
  const months = [...new Set(transactions.map(t => monthKey(t.date)))].sort((a, b) => b.localeCompare(a));

  // Always include current month
  const curMonth = today().slice(0, 7);
  if (!months.includes(curMonth)) months.unshift(curMonth);

  const current = select.value;
  select.innerHTML = months.map(m => {
    const [yr, mo] = m.split('-');
    const label = new Date(+yr, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    return `<option value="${m}" ${m === (current || curMonth) ? 'selected' : ''}>${label}</option>`;
  }).join('');

  if (!current) select.value = curMonth;
}

function renderReport() {
  populateMonthSelector();
  const selectedMonth = document.getElementById('reportMonth').value;
  const monthTxns = transactions.filter(t => t.date.startsWith(selectedMonth));

  const credits = monthTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits  = monthTxns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const balance = credits - debits;

  document.getElementById('rptCredits').textContent = fmt(credits);
  document.getElementById('rptDebits').textContent  = fmt(debits);
  document.getElementById('rptBalance').textContent = fmt(balance);
  document.getElementById('rptBalance').style.color = balance >= 0 ? 'var(--cyan)' : 'var(--red)';

  // Category chart
  const debitTxns = monthTxns.filter(t => t.type === 'debit');
  const catTotals = {};
  debitTxns.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const catLabels = Object.keys(catTotals);
  const catData   = Object.values(catTotals);
  const catColors = catLabels.map(l => CAT_COLORS[l] || '#6B7280');

  const ctx1 = document.getElementById('rptCategoryChart').getContext('2d');
  if (rptCatChartInst) rptCatChartInst.destroy();
  if (catLabels.length) {
    rptCatChartInst = new Chart(ctx1, {
      type: 'doughnut',
      data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: catColors, borderWidth: 0, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
        },
        cutout: '65%'
      }
    });
  }

  // Daily spending chart
  const [yr, mo] = selectedMonth.split('-');
  const daysInMonth = new Date(+yr, +mo, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const debitByDay = {};
  days.forEach(d => { debitByDay[d] = 0; });
  monthTxns.filter(t => t.type === 'debit').forEach(t => {
    const day = t.date.slice(8, 10);
    debitByDay[day] = (debitByDay[day] || 0) + t.amount;
  });

  const ctx2 = document.getElementById('rptDailyChart').getContext('2d');
  if (rptDailyChartInst) rptDailyChartInst.destroy();
  rptDailyChartInst = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: days.map(d => +d),
      datasets: [{ label: 'Debit', data: days.map(d => debitByDay[d]), backgroundColor: 'rgba(239,68,68,.7)', borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` Debit: ${fmt(ctx.raw)}` } }
      },
      scales: {
        x: { ticks: { color: '#6B7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: {
          ticks: { color: '#6B7280', font: { size: 10 }, callback: v => v >= 1000 ? '₹' + (v/1000).toFixed(1) + 'k' : '₹' + v },
          grid: { color: 'rgba(255,255,255,.04)' }
        }
      }
    }
  });

  // Transactions list
  const sorted = [...monthTxns].sort((a, b) => new Date(b.date) - new Date(a.date));
  const el = document.getElementById('reportTxnList');
  el.innerHTML = sorted.length ? sorted.map(txnHTML).join('') : emptyHTML();
  attachDeleteListeners(el);
}

document.getElementById('reportMonth').addEventListener('change', renderReport);

// ── EXCEL EXPORT ────────────────────────────────
function exportExcel() {
  if (!transactions.length) return toast('No transactions to export', 'error');

  const data = [
    ['ID', 'Type', 'Amount (₹)', 'Description', 'Category', 'Date'],
    ...transactions.sort((a, b) => new Date(a.date) - new Date(b.date)).map(t => [
      t.id, t.type.toUpperCase(), t.amount, t.description, t.category, t.date
    ])
  ];

  // Summary rows
  const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits  = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  data.push([], ['', '', '', '', 'Total Credits:', credits]);
  data.push(['', '', '', '', 'Total Debits:',  debits]);
  data.push(['', '', '', '', 'Net Balance:',   credits - debits]);

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RupeeTrack');

  const filename = `RupeeTrack_${today()}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast('Excel file downloaded!', 'success');
}

document.getElementById('exportBtn').addEventListener('click', exportExcel);
document.getElementById('exportBtnSm').addEventListener('click', exportExcel);

// ── INIT ────────────────────────────────────────
renderDashboard();

/* ═══════════════════════════════════════════════
   MEDICAL BILLS MODULE
═══════════════════════════════════════════════ */

let medicalBills = JSON.parse(localStorage.getItem('rt_medical_bills') || '[]');
let medCatChartInst   = null;
let medMonthChartInst = null;

function saveMedical() {
  localStorage.setItem('rt_medical_bills', JSON.stringify(medicalBills));
}

// Bill type icons
const MED_ICONS = {
  Consultation: 'ri-stethoscope-line',
  Surgery:      'ri-surgical-mask-line',
  Pharmacy:     'ri-medicine-bottle-line',
  'Lab Test':   'ri-test-tube-line',
  Emergency:    'ri-heart-pulse-line',
  Other:        'ri-hospital-line'
};

// ── MODAL OPEN/CLOSE ──────────────────────────
document.getElementById('openMedicalForm').addEventListener('click', () => {
  document.getElementById('medDate').value = today();
  document.getElementById('medModalOverlay').classList.add('open');
});
document.getElementById('closeMedModal').addEventListener('click', () => {
  document.getElementById('medModalOverlay').classList.remove('open');
});
document.getElementById('medModalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('medModalOverlay')) {
    document.getElementById('medModalOverlay').classList.remove('open');
  }
});

// Tag select for bill type
initTagSelect('medTypeTags', 'medBillType');

// ── SAVE MEDICAL BILL ─────────────────────────
document.getElementById('saveMedBillBtn').addEventListener('click', () => {
  const amount   = parseFloat(document.getElementById('medAmount').value);
  const date     = document.getElementById('medDate').value;
  const hospital = document.getElementById('medHospital').value.trim();
  const location = document.getElementById('medLocation').value.trim();
  const billType = document.getElementById('medBillType').value;

  if (!amount || amount <= 0) return toast('Please enter a valid amount', 'error');
  if (!hospital)              return toast('Please enter hospital name', 'error');
  if (!date)                  return toast('Please select a date', 'error');

  const bill = {
    id: genId(),
    amount,
    date,
    hospital: hospital,
    location: location || 'Not specified',
    billType
  };

  medicalBills.push(bill);
  saveMedical();
  toast(`Medical bill of ${fmt(amount)} saved!`, 'success');

  // Reset form
  document.getElementById('medAmount').value   = '';
  document.getElementById('medHospital').value = '';
  document.getElementById('medLocation').value = '';
  document.getElementById('medDate').value     = today();
  resetTagSelect('medTypeTags', 'medBillType', 'Consultation');

  document.getElementById('medModalOverlay').classList.remove('open');
  renderMedical();
});

// ── RENDER MEDICAL PAGE ───────────────────────
function renderMedical() {
  const total      = medicalBills.reduce((s, b) => s + b.amount, 0);
  const curMonth   = today().slice(0, 7);
  const thisMonth  = medicalBills.filter(b => b.date.startsWith(curMonth)).reduce((s, b) => s + b.amount, 0);

  // Top hospital
  const hospTotals = {};
  medicalBills.forEach(b => {
    hospTotals[b.hospital] = (hospTotals[b.hospital] || 0) + b.amount;
  });
  const topHospital = Object.entries(hospTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  document.getElementById('medTotalSpent').textContent = fmt(total);
  document.getElementById('medBillCount').textContent  = medicalBills.length;
  document.getElementById('medThisMonth').textContent  = fmt(thisMonth);
  document.getElementById('medTopHospital').textContent = topHospital;

  renderMedCatChart();
  renderMedMonthChart();
  renderMedList();
}

function renderMedCatChart() {
  const typeTotals = {};
  medicalBills.forEach(b => {
    typeTotals[b.billType] = (typeTotals[b.billType] || 0) + b.amount;
  });
  const labels = Object.keys(typeTotals);
  const data   = Object.values(typeTotals);
  const colors = {
    Consultation: '#60a5fa',
    Surgery:      '#f87171',
    Pharmacy:     '#34d399',
    'Lab Test':   '#fbbf24',
    Emergency:    '#fb7185',
    Other:        '#9ca3af'
  };
  const bgColors = labels.map(l => colors[l] || '#9ca3af');

  const ctx = document.getElementById('medCatChart').getContext('2d');
  if (medCatChartInst) medCatChartInst.destroy();
  if (!labels.length) return;

  medCatChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
      },
      cutout: '65%'
    }
  });
}

function renderMedMonthChart() {
  // Last 6 months
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const monthTotals = {};
  months.forEach(m => { monthTotals[m] = 0; });
  medicalBills.forEach(b => {
    const mk = b.date.slice(0, 7);
    if (monthTotals[mk] !== undefined) monthTotals[mk] += b.amount;
  });

  const labels = months.map(m => {
    const [yr, mo] = m.split('-');
    return new Date(+yr, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
  });

  const ctx = document.getElementById('medMonthChart').getContext('2d');
  if (medMonthChartInst) medMonthChartInst.destroy();

  medMonthChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Medical Spend',
        data: months.map(m => monthTotals[m]),
        backgroundColor: 'rgba(244,63,94,.7)',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } }
      },
      scales: {
        x: { ticks: { color: '#6B7280', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: {
          ticks: { color: '#6B7280', font: { size: 10 }, callback: v => v >= 1000 ? '₹' + (v/1000).toFixed(1) + 'k' : '₹' + v },
          grid: { color: 'rgba(255,255,255,.04)' }
        }
      }
    }
  });
}

function renderMedList() {
  const typeFilter  = document.getElementById('medFilterType').value;
  const monthFilter = document.getElementById('medFilterMonth').value;
  const hospFilter  = document.getElementById('medFilterHospital').value.toLowerCase().trim();

  let list = [...medicalBills].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (typeFilter !== 'all') list = list.filter(b => b.billType === typeFilter);
  if (monthFilter)          list = list.filter(b => b.date.startsWith(monthFilter));
  if (hospFilter)           list = list.filter(b => b.hospital.toLowerCase().includes(hospFilter));

  const el = document.getElementById('medBillList');

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><i class="ri-hospital-line"></i><p>No medical bills found</p></div>`;
    return;
  }

  el.innerHTML = list.map(b => {
    const dateStr = new Date(b.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const icon    = MED_ICONS[b.billType] || 'ri-hospital-line';
    const safeType = b.billType.replace(' ', '\\ ');
    return `
    <div class="med-bill-item" data-id="${b.id}">
      <div class="med-bill-icon"><i class="${icon}"></i></div>
      <div class="med-bill-info">
        <div class="med-bill-hospital">${b.hospital}</div>
        <div class="med-bill-meta">
          <span>${dateStr}</span>
          <span class="med-bill-location"><i class="ri-map-pin-2-line"></i>${b.location}</span>
          <span class="med-type-badge med-type-${b.billType}">${b.billType}</span>
        </div>
      </div>
      <span class="med-bill-amount">-${fmt(b.amount)}</span>
      <button class="txn-delete med-delete" data-id="${b.id}" title="Delete"><i class="ri-delete-bin-6-line"></i></button>
    </div>`;
  }).join('');

  // Delete listeners
  el.querySelectorAll('.med-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this medical bill?')) {
        medicalBills = medicalBills.filter(b => b.id !== btn.dataset.id);
        saveMedical();
        toast('Medical bill deleted', 'error');
        renderMedical();
      }
    });
  });
}

// Filters
['medFilterType', 'medFilterMonth', 'medFilterHospital'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderMedList);
  document.getElementById(id).addEventListener('change', renderMedList);
});

// ── MEDICAL EXCEL EXPORT ──────────────────────
function exportMedicalExcel() {
  if (!medicalBills.length) return toast('No medical bills to export', 'error');

  const data = [
    ['ID', 'Hospital', 'Location', 'Bill Type', 'Amount (₹)', 'Date'],
    ...medicalBills.sort((a, b) => new Date(a.date) - new Date(b.date)).map(b => [
      b.id, b.hospital, b.location, b.billType, b.amount, b.date
    ])
  ];

  const total = medicalBills.reduce((s, b) => s + b.amount, 0);
  data.push([], ['', '', '', 'Total Spent:', total, '']);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Medical Bills');
  XLSX.writeFile(wb, `RupeeTrack_MedicalBills_${today()}.xlsx`);
  toast('Medical bills exported!', 'success');
}

document.getElementById('medExportBtn').addEventListener('click', exportMedicalExcel);

// Also patch main export to include medical sheet
const _origExport = exportExcel;
window.exportExcel = function() {
  if (!transactions.length && !medicalBills.length) return toast('No data to export', 'error');
  const wb = XLSX.utils.book_new();

  if (transactions.length) {
    const data = [
      ['ID', 'Type', 'Amount (₹)', 'Description', 'Category', 'Date'],
      ...transactions.sort((a, b) => new Date(a.date) - new Date(b.date)).map(t => [
        t.id, t.type.toUpperCase(), t.amount, t.description, t.category, t.date
      ])
    ];
    const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const debits  = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
    data.push([], ['', '', '', '', 'Total Credits:', credits]);
    data.push(['', '', '', '', 'Total Debits:', debits]);
    data.push(['', '', '', '', 'Net Balance:', credits - debits]);
    const ws1 = XLSX.utils.aoa_to_sheet(data);
    ws1['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Transactions');
  }

  if (medicalBills.length) {
    const mdata = [
      ['ID', 'Hospital', 'Location', 'Bill Type', 'Amount (₹)', 'Date'],
      ...medicalBills.sort((a, b) => new Date(a.date) - new Date(b.date)).map(b => [
        b.id, b.hospital, b.location, b.billType, b.amount, b.date
      ])
    ];
    const total = medicalBills.reduce((s, b) => s + b.amount, 0);
    mdata.push([], ['', '', '', 'Total Spent:', total]);
    const ws2 = XLSX.utils.aoa_to_sheet(mdata);
    ws2['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Medical Bills');
  }

  XLSX.writeFile(wb, `RupeeTrack_${today()}.xlsx`);
  toast('Excel exported with all sheets!', 'success');
};

// Re-bind export buttons with new function
document.getElementById('exportBtn').onclick   = () => window.exportExcel();
document.getElementById('exportBtnSm').onclick = () => window.exportExcel();

// ── INIT MEDICAL ──────────────────────────────
renderMedical();
