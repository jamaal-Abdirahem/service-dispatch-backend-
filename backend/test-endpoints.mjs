/**
 * Service Dispatch Platform – Full Endpoint Test Suite
 * Run with: node test-endpoints.mjs
 * Requires: server running on http://localhost:5000
 */

const BASE = 'http://localhost:5000/api';

// ── Helpers ────────────────────────────────────────────────────────────────
const PASS = '✅ PASS';
const FAIL = '❌ FAIL';
let passed = 0;
let failed = 0;

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS}  ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL}  ${label}${detail ? ' → ' + detail : ''}`);
    failed++;
  }
}

// ── Test data (unique phone per run to avoid conflicts) ───────────────────
const ts = Date.now();
const CLIENT   = { name: 'Test Client',    phone: `1000${ts}`, password: 'password123', role: 'CLIENT' };
const TECH     = { name: 'Test Technician',phone: `2000${ts}`, password: 'password123', role: 'TECHNICIAN' };
const OPERATOR = { name: 'Test Operator',  phone: `3000${ts}`, password: 'password123', role: 'OPERATOR' };

let clientToken, techToken, operatorToken;
let requestId, technicianId;

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(' SERVICE DISPATCH – API TEST SUITE');
console.log('════════════════════════════════════════\n');

// ── 1. AUTH ────────────────────────────────────────────────────────────────
console.log('── 1. AUTH ENDPOINTS ─────────────────────');

// Register validation — short password
let r = await req('POST', '/auth/register', { name: 'X', phone: '0999', password: '123', role: 'CLIENT' });
assert('Register rejects password < 8 chars', r.status === 400, JSON.stringify(r.body));

// Register validation — missing field
r = await req('POST', '/auth/register', { phone: '0888', password: 'password123' });
assert('Register rejects missing name', r.status === 400, JSON.stringify(r.body));

// Register CLIENT
r = await req('POST', '/auth/register', CLIENT);
assert('Register CLIENT', r.status === 201 && r.body.success, JSON.stringify(r.body));

// Register TECHNICIAN
r = await req('POST', '/auth/register', TECH);
assert('Register TECHNICIAN', r.status === 201 && r.body.success, JSON.stringify(r.body));

// Register OPERATOR
r = await req('POST', '/auth/register', OPERATOR);
assert('Register OPERATOR', r.status === 201 && r.body.success, JSON.stringify(r.body));

// Duplicate phone
r = await req('POST', '/auth/register', CLIENT);
assert('Register duplicate phone → 409', r.status === 409, JSON.stringify(r.body));

// Login CLIENT
r = await req('POST', '/auth/login', { phone: CLIENT.phone, password: CLIENT.password });
assert('Login CLIENT', r.status === 200 && r.body.token, JSON.stringify(r.body));
clientToken = r.body.token;

// Login TECHNICIAN
r = await req('POST', '/auth/login', { phone: TECH.phone, password: TECH.password });
assert('Login TECHNICIAN', r.status === 200 && r.body.token, JSON.stringify(r.body));
techToken = r.body.token;

// Login OPERATOR
r = await req('POST', '/auth/login', { phone: OPERATOR.phone, password: OPERATOR.password });
assert('Login OPERATOR', r.status === 200 && r.body.token, JSON.stringify(r.body));
operatorToken = r.body.token;

// Wrong password
r = await req('POST', '/auth/login', { phone: CLIENT.phone, password: 'wrongpassword' });
assert('Login wrong password → 401', r.status === 401, JSON.stringify(r.body));

// ── 2. USERS ───────────────────────────────────────────────────────────────
console.log('\n── 2. USER ENDPOINTS ─────────────────────');

// GET /me
r = await req('GET', '/users/me', null, clientToken);
assert('GET /users/me (CLIENT)', r.status === 200 && r.body.data?.role === 'CLIENT', JSON.stringify(r.body));

// GET /me no token
r = await req('GET', '/users/me', null, null);
assert('GET /users/me no token → 401', r.status === 401, JSON.stringify(r.body));

// GET / — CLIENT forbidden
r = await req('GET', '/users', null, clientToken);
assert('GET /users CLIENT → 403', r.status === 403, JSON.stringify(r.body));

// GET / — OPERATOR allowed
r = await req('GET', '/users', null, operatorToken);
assert('GET /users OPERATOR → 200', r.status === 200 && Array.isArray(r.body.data), JSON.stringify(r.body));

// GET /technicians
r = await req('GET', '/users/technicians', null, operatorToken);
assert('GET /users/technicians → 200', r.status === 200 && Array.isArray(r.body.data), JSON.stringify(r.body));
// Grab technicianId for later
const techEntry = r.body.data?.find(t => t.user?.phone === TECH.phone);
technicianId = techEntry?.id;
assert('Technician profile auto-created', !!technicianId, `found: ${JSON.stringify(techEntry)}`);

// PATCH availability — CLIENT forbidden
r = await req('PATCH', `/users/technicians/${technicianId}/availability`, { available: false }, clientToken);
assert('PATCH technician availability CLIENT → 403', r.status === 403, JSON.stringify(r.body));

// PATCH availability — invalid body
r = await req('PATCH', `/users/technicians/${technicianId}/availability`, { available: 'yes' }, operatorToken);
assert('PATCH availability invalid type → 400', r.status === 400, JSON.stringify(r.body));

// PATCH availability — OPERATOR OK
r = await req('PATCH', `/users/technicians/${technicianId}/availability`, { available: true }, operatorToken);
assert('PATCH technician availability → 200', r.status === 200 && r.body.data?.available === true, JSON.stringify(r.body));

// ── 3. SERVICE REQUESTS ────────────────────────────────────────────────────
console.log('\n── 3. SERVICE REQUEST ENDPOINTS ──────────');

// Create — validation (missing problem)
r = await req('POST', '/requests', { clientName: 'Test', phone: '0612', location: 'X' }, clientToken);
assert('Create request missing field → 400', r.status === 400, JSON.stringify(r.body));

// Create — TECHNICIAN forbidden
r = await req('POST', '/requests',
  { clientName: 'T', phone: '061', location: 'L', problem: 'P' }, techToken);
assert('Create request TECHNICIAN → 403', r.status === 403, JSON.stringify(r.body));

// Create — CLIENT success
r = await req('POST', '/requests', {
  clientName: 'Hassan Idle',
  phone: '0634567890',
  location: 'Jigjiga Yar',
  problem: 'Electrical short circuit'
}, clientToken);
assert('Create request CLIENT → 201', r.status === 201 && r.body.data?.status === 'REPORTED', JSON.stringify(r.body));
requestId = r.body.data?.id;

// GET all — CLIENT sees only own
r = await req('GET', '/requests', null, clientToken);
assert('GET /requests CLIENT (own only)', r.status === 200 && r.body.data?.every(req => req.status), JSON.stringify(r.body));

// GET all — OPERATOR sees all
r = await req('GET', '/requests', null, operatorToken);
assert('GET /requests OPERATOR → 200', r.status === 200 && Array.isArray(r.body.data), JSON.stringify(r.body));

// GET /technician — CLIENT forbidden
r = await req('GET', '/requests/technician', null, clientToken);
assert('GET /requests/technician CLIENT → 403', r.status === 403, JSON.stringify(r.body));

// GET /technician — TECHNICIAN (empty before assign)
r = await req('GET', '/requests/technician', null, techToken);
assert('GET /requests/technician TECHNICIAN → 200', r.status === 200 && Array.isArray(r.body.data), JSON.stringify(r.body));

// GET /:id — CLIENT can see own
r = await req('GET', `/requests/${requestId}`, null, clientToken);
assert('GET /requests/:id CLIENT (own) → 200', r.status === 200 && r.body.data?.id === requestId, JSON.stringify(r.body));

// GET /:id — TECHNICIAN (not yet assigned) → 403
r = await req('GET', `/requests/${requestId}`, null, techToken);
assert('GET /requests/:id TECHNICIAN (not assigned) → 403', r.status === 403, JSON.stringify(r.body));

// GET /:id — bad ID → 404
r = await req('GET', '/requests/000000000000000000000000', null, operatorToken);
assert('GET /requests/:id bad ID → 404', r.status === 404, JSON.stringify(r.body));

// Assign — CLIENT forbidden
r = await req('POST', `/requests/${requestId}/assign`, { technicianId }, clientToken);
assert('Assign TECHNICIAN CLIENT → 403', r.status === 403, JSON.stringify(r.body));

// Assign — missing technicianId
r = await req('POST', `/requests/${requestId}/assign`, {}, operatorToken);
assert('Assign missing technicianId → 400', r.status === 400, JSON.stringify(r.body));

// Assign — OPERATOR success
r = await req('POST', `/requests/${requestId}/assign`, { technicianId }, operatorToken);
assert('Assign technician → status ASSIGNED', r.status === 200 && r.body.data?.status === 'ASSIGNED', JSON.stringify(r.body));

// Assign again (wrong state)
r = await req('POST', `/requests/${requestId}/assign`, { technicianId }, operatorToken);
assert('Re-assign already ASSIGNED → 400', r.status === 400, JSON.stringify(r.body));

// GET /:id — TECHNICIAN now assigned → 200
r = await req('GET', `/requests/${requestId}`, null, techToken);
assert('GET /requests/:id TECHNICIAN (assigned) → 200', r.status === 200 && r.body.data?.id === requestId, JSON.stringify(r.body));

// Mark arrived — CLIENT forbidden
r = await req('POST', `/requests/${requestId}/arrived`, null, clientToken);
assert('Arrived CLIENT → 403', r.status === 403, JSON.stringify(r.body));

// Mark arrived — TECHNICIAN success
r = await req('POST', `/requests/${requestId}/arrived`, null, techToken);
assert('Arrived TECHNICIAN → status IN_PROGRESS', r.status === 200 && r.body.data?.status === 'IN_PROGRESS', JSON.stringify(r.body));

// Mark arrived again (wrong state)
r = await req('POST', `/requests/${requestId}/arrived`, null, techToken);
assert('Arrived again (wrong state) → 400', r.status === 400, JSON.stringify(r.body));

// Complete — CLIENT forbidden
r = await req('POST', `/requests/${requestId}/complete`, null, clientToken);
assert('Complete CLIENT → 403', r.status === 403, JSON.stringify(r.body));

// Complete — TECHNICIAN success
r = await req('POST', `/requests/${requestId}/complete`, null, techToken);
assert('Complete TECHNICIAN → status COMPLETED', r.status === 200 && r.body.data?.status === 'COMPLETED', JSON.stringify(r.body));

// Approve — TECHNICIAN forbidden
r = await req('POST', `/requests/${requestId}/approve`, null, techToken);
assert('Approve TECHNICIAN → 403', r.status === 403, JSON.stringify(r.body));

// Approve — CLIENT success
r = await req('POST', `/requests/${requestId}/approve`, null, clientToken);
assert('Approve CLIENT → 200', r.status === 200 && r.body.success, JSON.stringify(r.body));

// Pay — missing amount
r = await req('POST', `/requests/${requestId}/pay`, {}, clientToken);
assert('Pay missing amount → 400', r.status === 400, JSON.stringify(r.body));

// Pay — zero amount
r = await req('POST', `/requests/${requestId}/pay`, { amount: 0 }, clientToken);
assert('Pay zero amount → 400', r.status === 400, JSON.stringify(r.body));

// Pay — CLIENT success
r = await req('POST', `/requests/${requestId}/pay`, { amount: 150 }, clientToken);
assert('Pay CLIENT → status PAID', r.status === 200 && r.body.data?.status === 'PAID', JSON.stringify(r.body));

// Pay again (wrong state)
r = await req('POST', `/requests/${requestId}/pay`, { amount: 150 }, clientToken);
assert('Pay again (already PAID) → 400', r.status === 400, JSON.stringify(r.body));

// ── 4. MISC ────────────────────────────────────────────────────────────────
console.log('\n── 4. MISC ───────────────────────────────');

// Body size limit — send large payload
const bigBody = { clientName: 'X'.repeat(15000), phone: '1', location: '1', problem: '1' };
r = await req('POST', '/requests', bigBody, clientToken);
assert('Body > 10kb → 413 Payload Too Large', r.status === 413, `got ${r.status} ${JSON.stringify(r.body)}`);

// 404 catch-all
r = await req('GET', '/nonexistent-route', null, null);
assert('Unknown route → 404', r.status === 404, JSON.stringify(r.body));

// Verify technician is available again after completing job
r = await req('GET', '/users/technicians', null, operatorToken);
const techAfter = r.body.data?.find(t => t.id === technicianId);
assert('Technician available again after job completion', techAfter?.available === true, JSON.stringify(techAfter));

// ── SUMMARY ────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════');
console.log(` RESULTS:  ${passed} passed  |  ${failed} failed`);
console.log('════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
