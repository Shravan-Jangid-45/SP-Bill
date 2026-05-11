// auth.js v3 — SP Fashion · Auth + Session Monitor
// NOTE: This module imports only Firestore *operation* helpers (no config).
//       Each protected page passes its own `db` instance to initSessionMonitor(db).
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ═══════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════ */
export const ROLES = {
  MASTER_ADMIN: 'master_admin',
  ADMIN:        'admin',
  STAFF:        'staff',
};

export const PAGE_PERMISSIONS = {
  'dashboard.html':     'dashboard',
  'product.html':       'products',
  'suppliers.html':     'suppliers',
  'billing.html':       'billing',
  'invoices.html':      'invoices',
  'cashBook.html':      'cashbook',
  'staff.html':         'staff',
  'coupon.html':        'coupons',
  'barcode-print.html': 'products',
  'settings.html':      'settings',
};

const PAGE_ORDER = [
  { page: 'dashboard.html', perm: 'dashboard' },
  { page: 'billing.html',   perm: 'billing'   },
  { page: 'product.html',   perm: 'products'  },
  { page: 'invoices.html',  perm: 'invoices'  },
  { page: 'cashBook.html',  perm: 'cashbook'  },
  { page: 'suppliers.html', perm: 'suppliers' },
  { page: 'staff.html',     perm: 'staff'     },
  { page: 'coupon.html',    perm: 'coupons'   },
  { page: 'settings.html',  perm: 'settings'  },
];

/* ═══════════════════════════════════════════════════════
   SESSION / USER ACCESSORS
═══════════════════════════════════════════════════════ */
export function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('staffAuth') || 'null'); }
  catch { return null; }
}
export function isLoggedIn() {
  const u = getCurrentUser();
  return !!(u?.userId && u?.loginTime);
}
export function isMasterAdmin() {
  return getCurrentUser()?.role === ROLES.MASTER_ADMIN;
}
export function isAdminOrAbove() {
  const r = getCurrentUser()?.role;
  return r === ROLES.ADMIN || r === ROLES.MASTER_ADMIN;
}
export function hasPermission(key) {
  const u = getCurrentUser();
  if (!u) return false;
  if (u.role === ROLES.MASTER_ADMIN || u.role === ROLES.ADMIN) return true;
  return !!(u.permissions?.[key]);
}

/* ═══════════════════════════════════════════════════════
   SMART REDIRECT
═══════════════════════════════════════════════════════ */
export function getFirstPermittedPage() {
  for (const { page, perm } of PAGE_ORDER) {
    if (hasPermission(perm)) return page;
  }
  return 'login.html';
}
export function getRedirectTarget(requestedPage) {
  if (requestedPage && requestedPage !== 'login.html' && requestedPage !== '') {
    const perm = PAGE_PERMISSIONS[requestedPage];
    if (!perm || hasPermission(perm)) return requestedPage;
  }
  return getFirstPermittedPage();
}

/* ═══════════════════════════════════════════════════════
   GUARD OVERLAY  (zero-flicker)
═══════════════════════════════════════════════════════ */
export function removeGuardOverlay() {
  document.getElementById('__auth_guard__')?.remove();
}

export function showAccessDeniedUI() {
  removeGuardOverlay();
  const el = document.createElement('div');
  el.id = '__access_denied__';
  el.style.cssText = [
    'position:fixed;inset:0;background:#000;z-index:99999;',
    'display:flex;align-items:center;justify-content:center;',
    "font-family:'DM Sans','Inter',sans-serif;",
  ].join('');
  el.innerHTML = `
    <div style="text-align:center;padding:48px 52px;background:#0d0d0d;border-radius:20px;
                border:1px solid #1c1c1c;max-width:420px;width:90%;
                box-shadow:0 24px 64px rgba(0,0,0,.6);">
      <div style="width:72px;height:72px;border-radius:50%;background:#1a0a0a;border:2px solid #3a0a0a;
                  display:flex;align-items:center;justify-content:center;margin:0 auto 22px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e30202" stroke-width="1.8">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h2 style="color:#fff;font-size:22px;font-weight:700;margin-bottom:10px;">Access Denied</h2>
      <p style="color:#555;font-size:14px;line-height:1.75;margin-bottom:30px;">
        You don't have permission to view this page.<br>Contact your administrator to request access.
      </p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="history.back()" style="padding:10px 22px;background:transparent;
          border:1px solid #2a2a2a;color:#888;border-radius:9px;cursor:pointer;
          font-size:13px;font-weight:600;font-family:inherit;">← Go Back</button>
        <button onclick="location.href='login.html'" style="padding:10px 22px;background:#111;
          border:1px solid #2a2a2a;color:#ccc;border-radius:9px;cursor:pointer;
          font-size:13px;font-weight:600;font-family:inherit;">Login Again</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

/* ═══════════════════════════════════════════════════════
   PAGE ACCESS CHECK
═══════════════════════════════════════════════════════ */
export function checkPageAccess() {
  const page = window.location.pathname.split('/').pop() || 'dashboard.html';
  if (page === 'login.html') return true;
  if (!isLoggedIn()) {
    window.location.href = `login.html?redirect=${encodeURIComponent(page)}`;
    return false;
  }
  const requiredPerm = PAGE_PERMISSIONS[page];
  if (requiredPerm && !hasPermission(requiredPerm)) {
    showAccessDeniedUI();
    return false;
  }
  removeGuardOverlay();
  return true;
}

/* ═══════════════════════════════════════════════════════
   SESSION MONITOR
   Call initSessionMonitor(db) on every protected page.
   - Heartbeat: updates `lastSeen` in Firestore every 60s
   - Force-logout check: every 30s + on tab focus
   - Online = active:true AND lastSeen within 3 minutes
═══════════════════════════════════════════════════════ */
let _heartbeatTimer  = null;
let _forceTimer      = null;

export function initSessionMonitor(db) {
  const sessionId = localStorage.getItem('sessionId');
  if (!sessionId || !db) return;

  const sessionRef = doc(db, 'sessions', sessionId);

  const beat = async () => {
    try {
      await updateDoc(sessionRef, { lastSeen: new Date().toISOString(), active: true });
    } catch { /* offline — ignore */ }
  };

  const checkForce = async () => {
    try {
      const snap = await getDoc(sessionRef);
      if (snap.exists() && snap.data().forceLogout === true) {
        stopSessionMonitor();
        logout();
      }
    } catch { /* ignore */ }
  };

  beat();
  checkForce();

  _heartbeatTimer = setInterval(beat,       60_000);
  _forceTimer     = setInterval(checkForce, 30_000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { beat(); checkForce(); }
  });
}

export function stopSessionMonitor() {
  clearInterval(_heartbeatTimer);
  clearInterval(_forceTimer);
}

/* ═══════════════════════════════════════════════════════
   DOM HELPERS
═══════════════════════════════════════════════════════ */
export function applySidebarPermissions() {
  document.querySelectorAll('.nav-link[href]').forEach(link => {
    const page = link.getAttribute('href').split('/').pop().split('?')[0];
    const perm = PAGE_PERMISSIONS[page];
    link.style.display = (perm && !hasPermission(perm)) ? 'none' : '';
  });
}

export function applyQuickActionPermissions() {
  document.querySelectorAll('.qa-btn[href]').forEach(btn => {
    const page = btn.getAttribute('href').split('/').pop().split('?')[0];
    const perm = PAGE_PERMISSIONS[page];
    btn.style.display = (perm && !hasPermission(perm)) ? 'none' : '';
  });
}

export function addLogoutToSidebar() {
  const sidebar = document.getElementById('appSidebar');
  if (!sidebar || document.getElementById('__sidebar_logout__')) return;
  const user = getCurrentUser();
  const roleLbl = { master_admin:'★ Master Admin', admin:'Admin', staff:'Staff' }[user?.role] || 'User';

  const wrap = document.createElement('div');
  wrap.id = '__sidebar_logout__';
  wrap.style.cssText = 'margin-top:auto;padding:14px 16px 22px;border-top:1px solid #222;flex-shrink:0;';
  wrap.innerHTML = `
    <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px;">${roleLbl}</div>
    <div style="font-size:13px;color:#aaa;font-weight:600;margin-bottom:12px;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user?.name||user?.username||'User'}</div>
    <button id="__logout_btn__" style="width:100%;padding:9px 12px;background:transparent;
      border:1px solid #1e1010;color:#c62828;border-radius:9px;cursor:pointer;
      font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;
      font-family:inherit;transition:background .2s,border-color .2s;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>Logout
    </button>`;
  sidebar.appendChild(wrap);

  const btn = document.getElementById('__logout_btn__');
  btn.addEventListener('click', logout);
  btn.addEventListener('mouseenter', () => { btn.style.background='#170808'; btn.style.borderColor='#3a1010'; });
  btn.addEventListener('mouseleave', () => { btn.style.background='transparent'; btn.style.borderColor='#1e1010'; });
}

/* ═══════════════════════════════════════════════════════
   LOGOUT
═══════════════════════════════════════════════════════ */
export function logout() {
  stopSessionMonitor();
  localStorage.removeItem('staffAuth');
  localStorage.removeItem('sessionId');
  localStorage.removeItem('sessionToken');
  window.location.href = 'login.html';
}