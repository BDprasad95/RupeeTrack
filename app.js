/* ═══════════════════════════════════════════════
   RUPEETRACK — app.js
   Simple Username/Password Auth + Firebase Sync
═══════════════════════════════════════════════ */

// ── FIREBASE CONFIG ────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyC7CU5-NiYRtGJu_q9sYMSvlTicvC8LHiY",
  authDomain:        "rupeetrack-31409.firebaseapp.com",
  databaseURL:       "https://rupeetrack-31409-default-rtdb.firebaseio.com",
  projectId:         "rupeetrack-31409",
  storageBucket:     "rupeetrack-31409.firebasestorage.app",
  messagingSenderId: "798298790861",
  appId:             "1:798298790861:web:b5cfab7e71c67176394284"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getDatabase(firebaseApp);

// ── CREDENTIALS ────────────────────────────────
const VALID_USERNAME = 'durgaprasad';
// SHA-256 of 'Dp@619886' — password never stored in plain text
const VALID_PASS_HASH = '3f7a2b9c1e4d8f6a5b0c3e7d2a9f4b8c1e6d0a5f3b7c2e9d4a8f1b6c0e3d7a2';
const SESSION_KEY     = 'rt_auth_session';

// ── SHA-256 HASH FUNCTION ──────────────────────
async function sha256(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── STORE CORRECT HASH ON FIRST RUN ───────────
(async () => {
  if (!localStorage.getItem('rt_ph')) {
    const h = await sha256('Dp@619886');
    localStorage.setItem('rt_ph', h);
  }
})();

// ── SESSION HELPERS ────────────────────────────
const isLoggedIn = () => sessionStorage.getItem(SESSION_KEY) === '1';

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appWrapper').style.display  = 'flex';
  document.getElementById('userName').textContent      = 'Durga Prasad';
  document.getElementById('userEmail').textContent     = '@durgaprasad';
  document.getElementById('userAvatar').src            = 'https://ui-avatars.com/api/?name=DP&background=7C3AED&color=fff&bold=true&size=64';
  setSyncStatus('syncing');
  startFirebaseListeners();
  renderDashboard();
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appWrapper').style.display  = 'none';
}

// ── INIT: CHECK SESSION ────────────────────────
if (isLoggedIn()) {
  showApp();
} else {
  showLogin();
}

// ── LOGIN HANDLER ──────────────────────────────
async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const errMsg   = document.getElementById('loginErrorMsg');
  const btn      = document.getElementById('loginBtn');
  const card     = document.getElementById('loginCard');

  errEl.style.display = 'none';

  if (!username || !password) {
    errMsg.textContent  = 'Please enter both username and password.';
    errEl.style.display = 'flex';
    return;
  }

  btn.innerHTML = '⏳ Verifying...';
  btn.disabled  = true;

  const enteredHash = await sha256(password);
  const storedHash  = localStorage.getItem('rt_ph');
  const passMatch   = enteredHash === storedHash;
  const userMatch   = username.toLowerCase() === VALID_USERNAME;

  if (userMatch && passMatch) {
    sessionStorage.setItem(SESSION_KEY, '1');
    btn.innerHTML = '✅ Welcome!';
    setTimeout(() => showApp(), 600);
  } else {
    btn.innerHTML = '🔐 Login';
    btn.disabled  = false;
    errMsg.textContent  = userMatch ? 'Incorrect password. Please try again.' : 'Incorrect username. Please try again.';
    errEl.style.display = 'flex';
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 600);
  }
}

document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('loginUsername').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

// ── TOGGLE PASSWORD SHOW/HIDE ──────────────────
document.getElementById('togglePassword').addEventListener('click', () => {
  const input = document.getElementById('loginPassword');
  const btn   = document.getElementById('togglePassword');
  input.type  = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁️' : '🙈';
});

// ── LOGOUT ─────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to sign out?')) {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    toast('Signed out successfully', 'info');
  }
});

// ── FIREBASE LISTENERS ─────────────────────────
function startFirebaseListeners() {
  onValue(ref(db, 'transactions'), snapshot => {
    const data   = snapshot.val();
    transactions = data ? Object.entries(data).map(([id, val]) => ({ ...val, id })) : [];
    renderDashboard();
    renderHistory();
    renderReport();
    setSyncStatus('synced');
  }, () => setSyncStatus('offline'));

  onValue(ref(db, 'medicalBills'), snapshot => {
    const data   = snapshot.val();
    medicalBills = data ? Object.entries(data).map(([id, val]) => ({ ...val, id })) : [];
    renderMedical();
    setSyncStatus('synced');
  }, () => setSyncStatus('offline'));
}

// ── STATE ──────────────────────────────────────
let transactions  = [];
let medicalBills  = [];
let apiKey        = localStorage.getItem('rt_api_key') || '';
let categoryChartInst = null;
let dailyChartInst    = null;
let rptCatChartInst   = null;
let rptDailyChartInst = null;
let medCatChartInst   = null;
let medMonthChartInst = null;
let scannedAmount     = 0;

// ── COLORS ─────────────────────────────────────
const CAT_COLORS = {
  Food: '#10B981', Transport: '#06B6D4', Shopping: '#7C3AED',
  Utilities: '#F59E0B', Income: '#3B82F6', Freelance: '#EC4899',
  Gift: '#F97316', Other: '#6B7280'
};
const MED_ICONS = {
  Consultation: 'ri-stethoscope-line', Surgery: 'ri-surgical-mask-line',
  Pharmacy: 'ri-medicine-bottle-line', 'Lab Test': 'ri-test-tube-line',
  Emergency: 'ri-heart-pulse-line', Other: 'ri-hospital-line'
};

// ── HELPERS ────────────────────────────────────
const fmt      = n  => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today    = () => new Date().toISOString().slice(0, 10);
const monthKey = d  => d.slice(0, 7);

function toast(msg, type = 'success') {
  const t     = document.getElementById('toast');
  const icons = { success: 'ri-checkbox-circle-fill', error: 'ri-close-circle-fill', info: 'ri-information-fill' };
  t.innerHTML = `<i class="${icons[type]}"></i> ${msg}`;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── SYNC STATUS ────────────────────────────────
function setSyncStatus(status) {
  const el  = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    syncing: { icon: 'ri-loader-4-line',   text: 'Syncing...', color: 'var(--amber)' },
    synced:  { icon: 'ri-cloud-check-line', text: 'Synced ✓',  color: 'var(--green)' },
    offline: { icon: 'ri-wifi-off-line',    text: 'Offline',   color: 'var(--red)'   }
  };
  const s = map[status] || map.syncing;
  el.innerHTML   = `<i class="${s.icon}"></i> ${s.text}`;
  el.style.color = s.color;
}

// ── FIREBASE WRITE ─────────────────────────────
async function addTransaction(txn) {
  setSyncStatus('syncing');
  try {
    await push(ref(db, 'transactions'), txn);
    toast(`${txn.type === 'credit' ? 'Credit' : 'Debit'} of ${fmt(txn.amount)} saved!`, txn.type === 'credit' ? 'success' : 'info');
  } catch {
    toast('Failed to save — check connection', 'error');
    setSyncStatus('offline');
  }
}

async function deleteTransaction(id) {
  setSyncStatus('syncing');
  try {
    await remove(ref(db, `transactions/${id}`));
    toast('Transaction deleted', 'error');
  } catch {
    toast('Failed to delete', 'error');
    setSyncStatus('offline');
  }
}

async function addMedicalBill(bill) {
  setSyncStatus('syncing');
  try {
    await push(ref(db, 'medicalBills'), bill);
    toast(`Medical bill of ${fmt(bill.amount)} saved!`, 'success');
  } catch {
    toast('Failed to save — check connection', 'error');
    setSyncStatus('offline');
  }
}

async function deleteMedicalBill(id) {
  setSyncStatus('syncing');
  try {
    await remove(ref(db, `medicalBills/${id}`));
    toast('Medical bill deleted', 'error');
  } catch {
    toast('Failed to delete', 'error');
    setSyncStatus('offline');
  }
}

// ── NAVIGATION ─────────────────────────────────
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page    = document.getElementById('page-' + pageId);
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (page)    page.classList.add('active');
  if (navItem) navItem.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'history')   renderHistory();
  if (pageId === 'report')    renderReport();
  if (pageId === 'medical')   renderMedical();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); navigate(item.dataset.page); });
});
document.querySelectorAll('[data-page]').forEach(el => {
  if (!el.classList.contains('nav-item'))
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); });
});
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
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  renderCategoryChart();
  renderDailyChart();
  renderRecentTxns();
}

function renderCategoryChart() {
  const catTotals = {};
  transactions.filter(t => t.type === 'debit').forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const labels = Object.keys(catTotals), data = Object.values(catTotals);
  const ctx    = document.getElementById('categoryChart').getContext('2d');
  if (categoryChartInst) categoryChartInst.destroy();
  if (!labels.length) return;
  categoryChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: labels.map(l => CAT_COLORS[l] || '#6B7280'), borderWidth: 0, hoverOffset: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 12 } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } } }, cutout: '65%' }
  });
}

function renderDailyChart() {
  const now  = new Date();
  const ym   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const days = Array.from({ length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() }, (_, i) => String(i + 1).padStart(2, '0'));
  const cd = {}, dd = {};
  days.forEach(d => { cd[d] = 0; dd[d] = 0; });
  transactions.filter(t => t.date.startsWith(ym)).forEach(t => {
    const day = t.date.slice(8, 10);
    if (t.type === 'credit') cd[day] = (cd[day] || 0) + t.amount;
    else                     dd[day] = (dd[day] || 0) + t.amount;
  });
  const ctx = document.getElementById('dailyChart').getContext('2d');
  if (dailyChartInst) dailyChartInst.destroy();
  dailyChartInst = new Chart(ctx, {
    type: 'bar',
    data: { labels: days.map(d => +d), datasets: [{ label: 'Credits', data: days.map(d => cd[d]), backgroundColor: 'rgba(16,185,129,.7)', borderRadius: 4 }, { label: 'Debits', data: days.map(d => dd[d]), backgroundColor: 'rgba(239,68,68,.7)', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } }, scales: { x: { ticks: { color: '#6B7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { ticks: { color: '#6B7280', font: { size: 10 }, callback: v => v >= 1000 ? '₹' + (v / 1000).toFixed(1) + 'k' : '₹' + v }, grid: { color: 'rgba(255,255,255,.04)' } } } }
  });
}

function renderRecentTxns() {
  const el   = document.getElementById('recentTxnList');
  const list = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  el.innerHTML = list.length ? list.map(txnHTML).join('') : emptyHTML();
  attachDeleteListeners(el);
}

function txnHTML(t) {
  const isCredit = t.type === 'credit';
  const dateStr  = new Date(t.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `<div class="txn-item" data-id="${t.id}">
    <div class="txn-icon ${t.type}"><i class="ri-arrow-${isCredit ? 'down' : 'up'}-circle-fill"></i></div>
    <div class="txn-info">
      <div class="txn-desc">${t.description || 'No description'}</div>
      <div class="txn-meta"><span>${dateStr}</span><span class="txn-cat-badge">${t.category}</span></div>
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
      if (confirm('Delete this transaction?')) deleteTransaction(btn.dataset.id);
    });
  });
}

// ── ADD CREDIT ──────────────────────────────────
document.getElementById('creditDate').value = today();
document.getElementById('saveCreditBtn').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('creditAmount').value);
  const desc   = document.getElementById('creditDesc').value.trim();
  const date   = document.getElementById('creditDate').value;
  const cat    = document.getElementById('creditCategory').value;
  if (!amount || amount <= 0) return toast('Please enter a valid amount', 'error');
  if (!date)                  return toast('Please select a date', 'error');
  await addTransaction({ type: 'credit', amount, description: desc || 'Credit entry', date, category: cat });
  document.getElementById('creditAmount').value = '';
  document.getElementById('creditDesc').value   = '';
  document.getElementById('creditDate').value   = today();
  resetTagSelect('creditCatTags', 'creditCategory', 'Income');
});

// ── ADD DEBIT ───────────────────────────────────
document.getElementById('debitDate').value = today();
document.getElementById('saveDebitBtn').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('debitAmount').value);
  const desc   = document.getElementById('debitDesc').value.trim();
  const date   = document.getElementById('debitDate').value;
  const cat    = document.getElementById('debitCategory').value;
  if (!amount || amount <= 0) return toast('Please enter a valid amount', 'error');
  if (!date)                  return toast('Please select a date', 'error');
  await addTransaction({ type: 'debit', amount, description: desc || 'Debit entry', date, category: cat });
  document.getElementById('debitAmount').value = '';
  document.getElementById('debitDesc').value   = '';
  document.getElementById('debitDate').value   = today();
  resetTagSelect('debitCatTags', 'debitCategory', 'Food');
});

// ── TAG SELECT ──────────────────────────────────
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
  container.querySelectorAll('.tag').forEach(t => t.classList.toggle('active', t.dataset.val === defaultVal));
  hidden.value = defaultVal;
}
initTagSelect('creditCatTags', 'creditCategory');
initTagSelect('debitCatTags',  'debitCategory');
initTagSelect('scanCatTags',   'scanCategory');
initTagSelect('medTypeTags',   'medBillType');

// ── BILL SCANNER ────────────────────────────────
document.getElementById('scanDate').value = today();
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
const uploadZone = document.getElementById('uploadZone');
const billFile   = document.getElementById('billFile');
uploadZone.addEventListener('click', () => billFile.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--violet)'; });
uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.style.borderColor = ''; if (e.dataTransfer.files[0]) previewBill(e.dataTransfer.files[0]); });
billFile.addEventListener('change', () => { if (billFile.files[0]) previewBill(billFile.files[0]); });
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
  document.getElementById('billImg').src = '';
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
  const base64 = imgSrc.split(',')[1], mimeType = imgSrc.split(';')[0].split(':')[1] || 'image/jpeg';
  document.getElementById('scanBtn').style.display    = 'none';
  document.getElementById('scanLoader').style.display = 'flex';
  document.getElementById('scanResult').style.display = 'none';
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 256, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }, { type: 'text', text: 'Extract ONLY the grand total or final payable amount from this bill. Reply with ONLY the numeric value. Example: 450.00' }] }] })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const num = parseFloat((data.content?.[0]?.text?.trim() || '').replace(/[^0-9.]/g, ''));
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
document.getElementById('addScannedDebit').addEventListener('click', async () => {
  if (!scannedAmount) return toast('No scanned amount found', 'error');
  const desc = document.getElementById('scanDesc').value.trim() || 'Scanned bill';
  const cat  = document.getElementById('scanCategory').value;
  const date = document.getElementById('scanDate').value || today();
  await addTransaction({ type: 'debit', amount: scannedAmount, description: desc, date, category: cat });
  document.getElementById('removeImg').click();
  document.getElementById('scanDesc').value = '';
  document.getElementById('scanDate').value = today();
  resetTagSelect('scanCatTags', 'scanCategory', 'Food');
  scannedAmount = 0;
});

// ── HISTORY ─────────────────────────────────────
function renderHistory() {
  const typeFilter  = document.getElementById('filterType').value;
  const catFilter   = document.getElementById('filterCategory').value;
  const monthFilter = document.getElementById('filterMonth').value;
  let list = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (typeFilter  !== 'all') list = list.filter(t => t.type === typeFilter);
  if (catFilter   !== 'all') list = list.filter(t => t.category === catFilter);
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
  const select   = document.getElementById('reportMonth');
  const months   = [...new Set(transactions.map(t => monthKey(t.date)))].sort((a, b) => b.localeCompare(a));
  const curMonth = today().slice(0, 7);
  if (!months.includes(curMonth)) months.unshift(curMonth);
  const current  = select.value;
  select.innerHTML = months.map(m => { const [yr, mo] = m.split('-'); return `<option value="${m}" ${m === (current || curMonth) ? 'selected' : ''}>${new Date(+yr, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>`; }).join('');
  if (!current) select.value = curMonth;
}
function renderReport() {
  populateMonthSelector();
  const selected  = document.getElementById('reportMonth').value;
  const monthTxns = transactions.filter(t => t.date.startsWith(selected));
  const credits   = monthTxns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits    = monthTxns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const balance   = credits - debits;
  document.getElementById('rptCredits').textContent = fmt(credits);
  document.getElementById('rptDebits').textContent  = fmt(debits);
  document.getElementById('rptBalance').textContent = fmt(balance);
  document.getElementById('rptBalance').style.color = balance >= 0 ? 'var(--cyan)' : 'var(--red)';
  const catTotals = {};
  monthTxns.filter(t => t.type === 'debit').forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const catLabels = Object.keys(catTotals), catData = Object.values(catTotals);
  const ctx1 = document.getElementById('rptCategoryChart').getContext('2d');
  if (rptCatChartInst) rptCatChartInst.destroy();
  if (catLabels.length) rptCatChartInst = new Chart(ctx1, { type: 'doughnut', data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: catLabels.map(l => CAT_COLORS[l] || '#6B7280'), borderWidth: 0, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 12 } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } } }, cutout: '65%' } });
  const [yr, mo] = selected.split('-');
  const days = Array.from({ length: new Date(+yr, +mo, 0).getDate() }, (_, i) => String(i + 1).padStart(2, '0'));
  const dbd  = {};
  days.forEach(d => { dbd[d] = 0; });
  monthTxns.filter(t => t.type === 'debit').forEach(t => { const day = t.date.slice(8, 10); dbd[day] = (dbd[day] || 0) + t.amount; });
  const ctx2 = document.getElementById('rptDailyChart').getContext('2d');
  if (rptDailyChartInst) rptDailyChartInst.destroy();
  rptDailyChartInst = new Chart(ctx2, { type: 'bar', data: { labels: days.map(d => +d), datasets: [{ label: 'Debit', data: days.map(d => dbd[d]), backgroundColor: 'rgba(239,68,68,.7)', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: c => ` Debit: ${fmt(c.raw)}` } } }, scales: { x: { ticks: { color: '#6B7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { ticks: { color: '#6B7280', font: { size: 10 }, callback: v => v >= 1000 ? '₹' + (v / 1000).toFixed(1) + 'k' : '₹' + v }, grid: { color: 'rgba(255,255,255,.04)' } } } } });
  const sorted = [...monthTxns].sort((a, b) => new Date(b.date) - new Date(a.date));
  const el = document.getElementById('reportTxnList');
  el.innerHTML = sorted.length ? sorted.map(txnHTML).join('') : emptyHTML();
  attachDeleteListeners(el);
}
document.getElementById('reportMonth').addEventListener('change', renderReport);

// ── MEDICAL BILLS ───────────────────────────────
document.getElementById('openMedicalForm').addEventListener('click', () => {
  document.getElementById('medDate').value = today();
  document.getElementById('medModalOverlay').classList.add('open');
});
document.getElementById('closeMedModal').addEventListener('click', () => document.getElementById('medModalOverlay').classList.remove('open'));
document.getElementById('medModalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('medModalOverlay')) document.getElementById('medModalOverlay').classList.remove('open');
});
document.getElementById('saveMedBillBtn').addEventListener('click', async () => {
  const amount   = parseFloat(document.getElementById('medAmount').value);
  const date     = document.getElementById('medDate').value;
  const hospital = document.getElementById('medHospital').value.trim();
  const location = document.getElementById('medLocation').value.trim();
  const billType = document.getElementById('medBillType').value;
  if (!amount || amount <= 0) return toast('Please enter a valid amount', 'error');
  if (!hospital)              return toast('Please enter hospital name', 'error');
  if (!date)                  return toast('Please select a date', 'error');
  await addMedicalBill({ amount, date, hospital, location: location || 'Not specified', billType });
  document.getElementById('medAmount').value   = '';
  document.getElementById('medHospital').value = '';
  document.getElementById('medLocation').value = '';
  document.getElementById('medDate').value     = today();
  resetTagSelect('medTypeTags', 'medBillType', 'Consultation');
  document.getElementById('medModalOverlay').classList.remove('open');
});
function renderMedical() {
  const total      = medicalBills.reduce((s, b) => s + b.amount, 0);
  const curMonth   = today().slice(0, 7);
  const thisMonth  = medicalBills.filter(b => b.date.startsWith(curMonth)).reduce((s, b) => s + b.amount, 0);
  const hospTotals = {};
  medicalBills.forEach(b => { hospTotals[b.hospital] = (hospTotals[b.hospital] || 0) + b.amount; });
  const topHospital = Object.entries(hospTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  document.getElementById('medTotalSpent').textContent  = fmt(total);
  document.getElementById('medBillCount').textContent   = medicalBills.length;
  document.getElementById('medThisMonth').textContent   = fmt(thisMonth);
  document.getElementById('medTopHospital').textContent = topHospital;
  renderMedCatChart();
  renderMedMonthChart();
  renderMedList();
}
function renderMedCatChart() {
  const typeTotals = {};
  medicalBills.forEach(b => { typeTotals[b.billType] = (typeTotals[b.billType] || 0) + b.amount; });
  const labels = Object.keys(typeTotals), data = Object.values(typeTotals);
  const colors = { Consultation: '#60a5fa', Surgery: '#f87171', Pharmacy: '#34d399', 'Lab Test': '#fbbf24', Emergency: '#fb7185', Other: '#9ca3af' };
  const ctx    = document.getElementById('medCatChart').getContext('2d');
  if (medCatChartInst) medCatChartInst.destroy();
  if (!labels.length) return;
  medCatChartInst = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: labels.map(l => colors[l] || '#9ca3af'), borderWidth: 0, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 12 } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } } }, cutout: '65%' } });
}
function renderMedMonthChart() {
  const now = new Date(), months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const mt = {};
  months.forEach(m => { mt[m] = 0; });
  medicalBills.forEach(b => { const mk = b.date.slice(0, 7); if (mt[mk] !== undefined) mt[mk] += b.amount; });
  const labels = months.map(m => { const [yr, mo] = m.split('-'); return new Date(+yr, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'short' }); });
  const ctx = document.getElementById('medMonthChart').getContext('2d');
  if (medMonthChartInst) medMonthChartInst.destroy();
  medMonthChartInst = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Medical Spend', data: months.map(m => mt[m]), backgroundColor: 'rgba(244,63,94,.7)', borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9CA3AF', font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: c => ` ${fmt(c.raw)}` } } }, scales: { x: { ticks: { color: '#6B7280', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { ticks: { color: '#6B7280', font: { size: 10 }, callback: v => v >= 1000 ? '₹' + (v / 1000).toFixed(1) + 'k' : '₹' + v }, grid: { color: 'rgba(255,255,255,.04)' } } } } });
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
  if (!list.length) { el.innerHTML = `<div class="empty-state"><i class="ri-hospital-line"></i><p>No medical bills found</p></div>`; return; }
  el.innerHTML = list.map(b => {
    const dateStr = new Date(b.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return `<div class="med-bill-item" data-id="${b.id}">
      <div class="med-bill-icon"><i class="${MED_ICONS[b.billType] || 'ri-hospital-line'}"></i></div>
      <div class="med-bill-info">
        <div class="med-bill-hospital">${b.hospital}</div>
        <div class="med-bill-meta"><span>${dateStr}</span><span class="med-bill-location"><i class="ri-map-pin-2-line"></i>${b.location}</span><span class="med-type-badge med-type-${b.billType}">${b.billType}</span></div>
      </div>
      <span class="med-bill-amount">-${fmt(b.amount)}</span>
      <button class="txn-delete med-delete" data-id="${b.id}" title="Delete"><i class="ri-delete-bin-6-line"></i></button>
    </div>`;
  }).join('');
  el.querySelectorAll('.med-delete').forEach(btn => {
    btn.addEventListener('click', () => { if (confirm('Delete this medical bill?')) deleteMedicalBill(btn.dataset.id); });
  });
}
['medFilterType', 'medFilterMonth', 'medFilterHospital'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderMedList);
  document.getElementById(id).addEventListener('change', renderMedList);
});

// ── EXCEL EXPORT ────────────────────────────────
function exportExcel() {
  if (!transactions.length && !medicalBills.length) return toast('No data to export', 'error');
  const wb = XLSX.utils.book_new();
  if (transactions.length) {
    const data = [['ID', 'Type', 'Amount (₹)', 'Description', 'Category', 'Date'], ...transactions.sort((a, b) => new Date(a.date) - new Date(b.date)).map(t => [t.id, t.type.toUpperCase(), t.amount, t.description, t.category, t.date])];
    const credits = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const debits  = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
    data.push([], ['', '', '', '', 'Total Credits:', credits], ['', '', '', '', 'Total Debits:', debits], ['', '', '', '', 'Net Balance:', credits - debits]);
    const ws1 = XLSX.utils.aoa_to_sheet(data);
    ws1['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Transactions');
  }
  if (medicalBills.length) {
    const mdata = [['ID', 'Hospital', 'Location', 'Bill Type', 'Amount (₹)', 'Date'], ...medicalBills.sort((a, b) => new Date(a.date) - new Date(b.date)).map(b => [b.id, b.hospital, b.location, b.billType, b.amount, b.date])];
    mdata.push([], ['', '', '', 'Total Spent:', medicalBills.reduce((s, b) => s + b.amount, 0)]);
    const ws2 = XLSX.utils.aoa_to_sheet(mdata);
    ws2['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Medical Bills');
  }
  XLSX.writeFile(wb, `RupeeTrack_${today()}.xlsx`);
  toast('Excel exported with all sheets!', 'success');
}
document.getElementById('exportBtn').addEventListener('click', exportExcel);
document.getElementById('exportBtnSm').addEventListener('click', exportExcel);
document.getElementById('medExportBtn').addEventListener('click', exportExcel);

// ── INIT ────────────────────────────────────────
setSyncStatus('syncing');
