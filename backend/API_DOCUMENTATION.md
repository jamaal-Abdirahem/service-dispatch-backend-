# Service Dispatch Platform — API Reference

**Version:** 1.0.0  
**Last Updated:** 2026-03-12  
**Base URL (Development):** `http://localhost:5000/api`  
**Base URL (Production):** `https://service-dispatch-backend-2.onrender.com/api`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Rate Limiting](#3-rate-limiting)
4. [Roles & Permissions](#4-roles--permissions)
5. [Request / Response Format](#5-request--response-format)
6. [Error Reference](#6-error-reference)
7. [Data Models](#7-data-models)
8. [Status Lifecycle](#8-status-lifecycle)
9. [Endpoints — Auth](#9-endpoints--auth)
10. [Endpoints — Users](#10-endpoints--users)
11. [Endpoints — Service Requests](#11-endpoints--service-requests)
12. [Full Workflow Sequence](#12-full-workflow-sequence)

---

## 1. Overview

The Service Dispatch Platform API is a RESTful JSON API that manages the full lifecycle of service requests — from a client reporting a problem, through operator dispatch, field technician work, client approval, and final payment.

Every request and response uses `application/json`. All protected endpoints require a JWT Bearer token.

---

## 2. Authentication

All protected endpoints require an `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

**How to obtain a token:**
1. Call `POST /api/auth/register` to create an account
2. Call `POST /api/auth/login` to receive a JWT token
3. Include the token in the `Authorization` header of all subsequent requests

**Token lifespan:** 24 hours. There is currently no refresh endpoint — clients must re-login after expiry.

**Token payload (decoded):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "role": "CLIENT",
  "iat": 1741823000,
  "exp": 1741909400
}
```

---

## 3. Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| All `/api/*` routes | 100 requests | per IP per 15 minutes |
| Auth routes only (`/api/auth/*`) | 20 requests | per IP per 15 minutes |

When the limit is exceeded:
```http
HTTP/1.1 429 Too Many Requests
```
```json
{
  "success": false,
  "message": "Too many auth attempts, please try again later."
}
```

---

## 4. Roles & Permissions

| Role | Description | Typical User |
|------|-------------|--------------|
| `CLIENT` | Reports problems, approves work, pays | End customer |
| `OPERATOR` | Creates requests on behalf of clients, assigns technicians | Call center agent |
| `TECHNICIAN` | Field worker who performs the service | On-site engineer |
| `ADMIN` | Full access to all resources | System administrator |

**Default role:** `CLIENT` (if `role` is omitted or invalid during registration).

---

## 5. Request / Response Format

### Request Headers (all endpoints)
```
Content-Type: application/json
Authorization: Bearer <token>   ← required on protected endpoints
```

### Success Response Envelope
```json
{
  "success": true,
  "data": { ... }
}
```
or for action-only responses (no data to return):
```json
{
  "success": true,
  "message": "Human-readable confirmation"
}
```

### Error Response Envelope
```json
{
  "success": false,
  "message": "Human-readable error description"
}
```
> **Note:** In `development` mode only, a `"stack"` field containing the stack trace is also included.

---

## 6. Error Reference

| HTTP Status | Name | When it occurs |
|-------------|------|----------------|
| `400` | Bad Request | Missing / invalid body fields; business logic violation (wrong status, weak password, etc.) |
| `401` | Unauthorized | No token provided, token is invalid, or token has expired |
| `403` | Forbidden | Authenticated but insufficient role or resource ownership |
| `404` | Not Found | Resource or route does not exist |
| `409` | Conflict | Duplicate unique value (e.g. phone number already registered) |
| `413` | Payload Too Large | Request body exceeds 10 KB |
| `429` | Too Many Requests | Rate limit hit |
| `500` | Internal Server Error | Unexpected server-side error |

---

## 7. Data Models

### User
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (ObjectId) | Unique identifier |
| `name` | `string` | Full name |
| `phone` | `string` | Phone number — unique across all users |
| `role` | `Role` | `CLIENT` \| `OPERATOR` \| `TECHNICIAN` \| `ADMIN` |
| `createdAt` | `ISO 8601 datetime` | Account creation timestamp |
| `updatedAt` | `ISO 8601 datetime` | Last updated timestamp |

> `password` is never returned in any response.

---

### Technician
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (ObjectId) | Technician profile ID (**used when assigning**) |
| `userId` | `string` (ObjectId) | Linked User ID |
| `location` | `string \| null` | Current location (optional) |
| `available` | `boolean` | `true` = can be assigned; `false` = currently on a job |
| `user` | `object` | Nested: `{ name, phone }` |

> A Technician profile is automatically created when a User registers with `role: "TECHNICIAN"`.

---

### ServiceRequest
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (ObjectId) | Unique request identifier |
| `clientName` | `string` | Display name of the client |
| `phone` | `string` | Contact phone for this job |
| `location` | `string` | Address / location of the problem |
| `latitude` | `number \| null` | Optional GPS Latitude coordinate for map plotting |
| `longitude` | `number \| null` | Optional GPS Longitude coordinate for map plotting |
| `problem` | `string` | Problem description |
| `status` | `RequestStatus` | Current status (see lifecycle below) |
| `clientId` | `string` (ObjectId) | ID of the User who owns this request |
| `technicianId` | `string \| null` | ID of the assigned Technician profile (not User ID) |
| `client` | `object` | Nested: `{ name, phone }` |
| `technician` | `object \| null` | Nested: `{ id, available, user: { name, phone } }` |
| `payment` | `Payment \| null` | Nested payment record (present after PAID) |
| `createdAt` | `ISO 8601 datetime` | Request creation timestamp |
| `updatedAt` | `ISO 8601 datetime` | Last status change timestamp |

---

### Payment
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (ObjectId) | Unique payment identifier |
| `requestId` | `string` (ObjectId) | Linked ServiceRequest ID |
| `amount` | `number` | Payment amount |
| `status` | `PaymentStatus` | `PENDING` \| `SUCCESS` \| `FAILED` |
| `createdAt` | `ISO 8601 datetime` | Payment creation timestamp |

---

## 8. Status Lifecycle

A `ServiceRequest` moves through the following states in strict order:

```
REPORTED
   │  ← POST /:id/assign    (OPERATOR / ADMIN)
   ▼
ASSIGNED
   │  ← POST /:id/arrived   (TECHNICIAN)
   ▼
ARRIVED
   │  ← POST /:id/estimate  (TECHNICIAN)
   ▼
ESTIMATED
   │  ← POST /:id/approve-estimate (CLIENT)
   ▼
APPROVED
   │  ← POST /:id/start-work (TECHNICIAN)
   ▼
IN_PROGRESS
   │  ← POST /:id/complete  (TECHNICIAN)
   ▼
COMPLETED
   │  ← POST /:id/approve   (CLIENT)  [acknowledgement gate — no status change]
   │  ← POST /:id/pay       (CLIENT)
   ▼
PAID
```

> Skipping steps is **not allowed**. Each endpoint validates the current status and rejects out-of-order calls with `400 Bad Request`.

---

## 9. Endpoints — Auth

### `POST /api/auth/register`

Register a new user account.

- **Auth required:** ❌ Public
- **Rate limit:** 20 req / 15 min

#### Request Body

```json
{
  "name": "Hassan Idle",
  "phone": "0634567890",
  "password": "securepassword123",
  "role": "CLIENT"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Any non-empty string |
| `phone` | `string` | ✅ | Must be unique across all users |
| `password` | `string` | ✅ | Minimum **8 characters** |
| `role` | `string` | ❌ | `CLIENT` \| `OPERATOR` \| `TECHNICIAN` \| `ADMIN`. Defaults to `CLIENT` if omitted or invalid. |

#### Success Response — `201 Created`

```json
{
  "success": true,
  "message": "User created successfully"
}
```

> If `role` is `TECHNICIAN`, a Technician profile is automatically created and linked to the user in the same transaction.

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Missing required fields: name, phone` | Required field absent or whitespace-only |
| `400` | `Password must be at least 8 characters` | Password too short |
| `409` | `Phone number already registered` | Duplicate phone number |

---

### `POST /api/auth/login`

Authenticate and receive a JWT token.

- **Auth required:** ❌ Public
- **Rate limit:** 20 req / 15 min

#### Request Body

```json
{
  "phone": "0634567890",
  "password": "securepassword123"
}
```

| Field | Type | Required |
|-------|------|----------|
| `phone` | `string` | ✅ |
| `password` | `string` | ✅ |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Hassan Idle",
    "role": "CLIENT"
  }
}
```

> ⚠️ Store `token` securely (e.g. `httpOnly` cookie or secure storage). It expires in **24 hours**.

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Missing required fields: phone, password` | Required field absent |
| `401` | `Invalid credentials` | Phone not found or password mismatch |

---

## 10. Endpoints — Users

### `GET /api/users/me`

Return the currently authenticated user's profile.

- **Auth required:** ✅ Any role

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Hassan Idle",
    "phone": "0634567890",
    "role": "CLIENT",
    "createdAt": "2026-03-12T18:00:00.000Z",
    "updatedAt": "2026-03-12T18:00:00.000Z"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `401` | `No token provided` | `Authorization` header missing |
| `401` | `Invalid token` | Token is malformed or expired |

---

### `GET /api/users`

Return all registered users.

- **Auth required:** ✅ `ADMIN`, `OPERATOR`

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Hassan Idle",
      "phone": "0634567890",
      "role": "CLIENT",
      "createdAt": "2026-03-12T18:00:00.000Z"
    },
    {
      "id": "507f1f77bcf86cd799439012",
      "name": "Ahmed Ali",
      "phone": "0623456789",
      "role": "TECHNICIAN",
      "createdAt": "2026-03-12T17:00:00.000Z"
    }
  ]
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `401` | `No token provided` | Missing or invalid token |
| `403` | `Forbidden: Insufficient privileges` | Role not `ADMIN` or `OPERATOR` |

---

### `GET /api/users/technicians`

Return all technicians with their availability status and linked user info.

- **Auth required:** ✅ `ADMIN`, `OPERATOR`

> Use the `id` field from this response as `technicianId` when calling `POST /:id/assign`.

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439020",
      "userId": "507f1f77bcf86cd799439012",
      "location": "Hargeisa Central",
      "available": true,
      "user": {
        "name": "Ahmed Ali",
        "phone": "0623456789"
      }
    },
    {
      "id": "507f1f77bcf86cd799439021",
      "userId": "507f1f77bcf86cd799439013",
      "location": null,
      "available": false,
      "user": {
        "name": "Omar Hassan",
        "phone": "0645678901"
      }
    }
  ]
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `403` | `Forbidden: Insufficient privileges` | Role not `ADMIN` or `OPERATOR` |

---

### `PATCH /api/users/technicians/:id/availability`

Manually override a technician's availability status.

- **Auth required:** ✅ `ADMIN`, `OPERATOR`
- **URL parameter:** `:id` — The **Technician profile ID** (not the User ID). Use `GET /api/users/technicians` to find it.

#### Request Body

```json
{
  "available": true
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `available` | `boolean` | ✅ | Must be exactly `true` or `false` — not a string |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439020",
    "userId": "507f1f77bcf86cd799439012",
    "location": "Hargeisa Central",
    "available": true,
    "user": {
      "name": "Ahmed Ali",
      "phone": "0623456789"
    }
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `` `available` must be a boolean `` | `available` is a string `"true"` instead of boolean `true` |
| `403` | `Forbidden: Insufficient privileges` | Role not `ADMIN` or `OPERATOR` |
| `404` | `Record not found` | Technician ID does not exist |

---

## 11. Endpoints — Service Requests

### `GET /api/requests`

Return service requests. Automatically filtered by role.

- **Auth required:** ✅ Any role
- **Behaviour by role:**
  - `CLIENT` → Returns **only** requests owned by the authenticated client
  - `OPERATOR` / `ADMIN` → Returns **all** requests
  - `TECHNICIAN` → Use `GET /api/requests/technician` instead (this endpoint returns all requests, which may not be what is intended)

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439030",
      "clientName": "Hassan Idle",
      "phone": "0634567890",
      "location": "Jigjiga Yar, near market",
      "problem": "Electrical short circuit in kitchen",
      "status": "ASSIGNED",
      "clientId": "507f1f77bcf86cd799439011",
      "technicianId": "507f1f77bcf86cd799439020",
      "client": {
        "name": "Hassan Idle",
        "phone": "0634567890"
      },
      "technician": {
        "id": "507f1f77bcf86cd799439020",
        "available": false,
        "user": {
          "name": "Ahmed Ali",
          "phone": "0623456789"
        }
      },
      "createdAt": "2026-03-12T18:30:00.000Z",
      "updatedAt": "2026-03-12T18:45:00.000Z"
    }
  ]
}
```

---

### `GET /api/requests/technician`

Return all requests assigned to the currently authenticated technician, ordered by most recently updated first.

- **Auth required:** ✅ `TECHNICIAN` only

> ⚠️ This route **must** be called before `GET /api/requests/:id` in your routing logic because Express resolves `/technician` as a static path first.

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439030",
      "clientName": "Hassan Idle",
      "phone": "0634567890",
      "location": "Jigjiga Yar, near market",
      "problem": "Electrical short circuit in kitchen",
      "status": "IN_PROGRESS",
      "clientId": "507f1f77bcf86cd799439011",
      "technicianId": "507f1f77bcf86cd799439020",
      "createdAt": "2026-03-12T18:30:00.000Z",
      "updatedAt": "2026-03-12T19:00:00.000Z"
    }
  ]
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `403` | `Forbidden: Insufficient privileges` | Role is not `TECHNICIAN` |
| `404` | `Technician profile not found` | Technician profile missing (should not happen if registered correctly) |

---

### `GET /api/requests/:id`

Return a single service request by its ID.

- **Auth required:** ✅ Any role
- **Access control by role:**

| Role | Can access |
|------|-----------|
| `CLIENT` | Only their own requests (`clientId` matches) |
| `TECHNICIAN` | Only requests assigned to them (`technicianId` matches their profile) |
| `OPERATOR` | Any request |
| `ADMIN` | Any request |

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "clientName": "Hassan Idle",
    "phone": "0634567890",
    "location": "Jigjiga Yar, near market",
    "problem": "Electrical short circuit in kitchen",
    "status": "PAID",
    "clientId": "507f1f77bcf86cd799439011",
    "technicianId": "507f1f77bcf86cd799439020",
    "client": {
      "name": "Hassan Idle",
      "phone": "0634567890"
    },
    "technician": {
      "id": "507f1f77bcf86cd799439020",
      "available": true,
      "user": {
        "name": "Ahmed Ali",
        "phone": "0623456789"
      }
    },
    "payment": {
      "id": "507f1f77bcf86cd799439040",
      "requestId": "507f1f77bcf86cd799439030",
      "amount": 150,
      "status": "SUCCESS",
      "createdAt": "2026-03-12T20:00:00.000Z"
    },
    "createdAt": "2026-03-12T18:30:00.000Z",
    "updatedAt": "2026-03-12T20:00:00.000Z"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `403` | `Forbidden: you do not have access to this request` | CLIENT accessing another client's request |
| `403` | `Forbidden: you are not assigned to this request` | TECHNICIAN accessing a request they're not assigned to |
| `404` | `Request not found` | ID not found in the database |

---

### `POST /api/requests`

Create a new service request. Status is set to `REPORTED` automatically.

- **Auth required:** ✅ `CLIENT`, `OPERATOR`

#### Request Body

```json
{
  "clientName": "Hassan Idle",
  "phone": "0634567890",
  "location": "Jigjiga Yar, near the central market",
  "latitude": 2.0469,
  "longitude": 45.3182,
  "problem": "Electrical short circuit in the kitchen — appliances not working"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientName` | `string` | ✅ | Name displayed on the request (may differ from account name if OPERATOR submits on behalf of client) |
| `phone` | `string` | ✅ | Contact phone number for this job |
| `location` | `string` | ✅ | Full address where the technician should go |
| `latitude` | `number` | ❌ | Exact GPS latitude for plotting on a map view |
| `longitude` | `number` | ❌ | Exact GPS longitude for plotting on a map view |
| `problem` | `string` | ✅ | Clear description of the problem |

#### Success Response — `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "clientName": "Hassan Idle",
    "phone": "0634567890",
    "location": "Jigjiga Yar, near the central market",
    "latitude": 2.0469,
    "longitude": 45.3182,
    "problem": "Electrical short circuit in the kitchen — appliances not working",
    "status": "REPORTED",
    "clientId": "507f1f77bcf86cd799439011",
    "technicianId": null,
    "createdAt": "2026-03-12T18:30:00.000Z",
    "updatedAt": "2026-03-12T18:30:00.000Z"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Missing required fields: location, problem` | One or more required fields absent or whitespace-only |
| `403` | `Forbidden: Insufficient privileges` | Role is `TECHNICIAN` or `ADMIN` |

---

### `POST /api/requests/:id/assign`

Assign a technician to a request. Advances status from `REPORTED` → `ASSIGNED`. The technician is atomically marked as unavailable.

- **Auth required:** ✅ `OPERATOR`, `ADMIN`
- **Required status:** `REPORTED`

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Request Body

```json
{
  "technicianId": "507f1f77bcf86cd799439020"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `technicianId` | `string` (ObjectId) | ✅ | The **Technician profile ID** — obtain from `GET /api/users/technicians`. This is **not** the User ID. |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "status": "ASSIGNED",
    "technicianId": "507f1f77bcf86cd799439020",
    "clientName": "Hassan Idle",
    "phone": "0634567890",
    "location": "Jigjiga Yar, near the central market",
    "problem": "Electrical short circuit in the kitchen",
    "clientId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-03-12T18:30:00.000Z",
    "updatedAt": "2026-03-12T18:45:00.000Z"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `technicianId is required` | Body missing `technicianId` |
| `400` | `Request cannot be assigned in its current state` | Request status is not `REPORTED` |
| `400` | `Technician is no longer available — please select another` | Technician was just assigned to another request (concurrent race handled atomically) |
| `403` | `Forbidden: Insufficient privileges` | Role is not `OPERATOR` or `ADMIN` |
| `404` | `Request not found` | Request ID does not exist |
| `404` | `Technician does not exist` | Technician ID does not exist |

---

### `POST /api/requests/:id/arrived`

Technician confirms they have arrived at the client's location. Advances status from `ASSIGNED` → `ARRIVED`.

- **Auth required:** ✅ `TECHNICIAN` (must be the **assigned** technician)
- **Required status:** `ASSIGNED`

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Request Body

None required.

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "status": "ARRIVED",
    "technicianId": "507f1f77bcf86cd799439020",
    "clientName": "Hassan Idle",
    "location": "Jigjiga Yar, near the central market",
    "problem": "Electrical short circuit in the kitchen",
    "clientId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-03-12T18:30:00.000Z",
    "updatedAt": "2026-03-12T19:00:00.000Z"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Status must be ASSIGNED to mark arrived` | Request is not in `ASSIGNED` state |
| `403` | `Only assigned technician can mark arrival` | Caller is not a registered technician |
| `403` | `Unauthorized for this request` | Caller is a technician but not the one assigned to this request |

---

### `POST /api/requests/:id/estimate`

Technician assesses the issue, submits a detailed problem report, and an estimated budget. Advances status from `ARRIVED` → `ESTIMATED`.

- **Auth required:** ✅ `TECHNICIAN` (must be the **assigned** technician)
- **Required status:** `ARRIVED`

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Request Body

```json
{
  "report": "Found the exact shorted wire inside the main oven circuitry.",
  "budget": 150
}
```

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "status": "ESTIMATED",
    "problemReport": "Found the exact shorted wire inside the main oven circuitry.",
    "budget": 150,
    "technicianId": "507f1f77bcf86cd799439020"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Valid \`report\` and positive \`budget\` are required` | Malformed or negative budget / empty report |
| `400` | `Status must be ARRIVED to submit an estimate` | Request is not in `ARRIVED` state |
| `403` | `Only assigned technician can submit an estimate` | Not the assigned technician |

---

### `POST /api/requests/:id/approve-estimate`

Client reviews and approves the technician's submitted problem report and budget estimate. Advances status from `ESTIMATED` → `APPROVED`.

- **Auth required:** ✅ `CLIENT` (must own the request)
- **Required status:** `ESTIMATED`

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "status": "APPROVED",
    "budget": 150
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Status must be ESTIMATED to approve the budget` | Request is not correctly awaiting budget approval |
| `403` | `Unauthorized for this request` | Caller does not own the request |

---

### `POST /api/requests/:id/start-work`

Technician officially starts working on the repair after the client's approval. Advances status from `APPROVED` → `IN_PROGRESS`.

- **Auth required:** ✅ `TECHNICIAN` (must be the **assigned** technician)
- **Required status:** `APPROVED`

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "status": "IN_PROGRESS",
    "technicianId": "507f1f77bcf86cd799439020"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Status must be APPROVED by the client before starting work` | Request was never approved or already progressed |
| `403` | `Only assigned technician can start work` | Not the assigned technician |

---

### `POST /api/requests/:id/complete`

Technician marks the job as complete. Advances status from `IN_PROGRESS` → `COMPLETED`. The technician is atomically marked as **available** again.

- **Auth required:** ✅ `TECHNICIAN` (must be the **assigned** technician)
- **Required status:** `IN_PROGRESS`

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Request Body

None required.

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "status": "COMPLETED",
    "technicianId": "507f1f77bcf86cd799439020",
    "clientName": "Hassan Idle",
    "location": "Jigjiga Yar, near the central market",
    "problem": "Electrical short circuit in the kitchen",
    "clientId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-03-12T18:30:00.000Z",
    "updatedAt": "2026-03-12T19:30:00.000Z"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Status must be IN_PROGRESS to complete` | Request is not in `IN_PROGRESS` state |
| `403` | `Only an assigned technician can complete a service` | Caller is not a technician |
| `403` | `Unauthorized for this request` | Caller is a technician but not the one assigned |

---

### `POST /api/requests/:id/approve`

Client acknowledges and approves the completed work. This is a **confirmation gate** — it does not change the request status, but is required before payment can be made.

- **Auth required:** ✅ `CLIENT` (must own the request)
- **Required status:** `COMPLETED`

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Request Body

None required.

#### Success Response — `200 OK`

```json
{
  "success": true,
  "message": "Service approved"
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `Status must be COMPLETED to approve` | Request has not been completed yet |
| `403` | `Unauthorized for this request` | Caller is not the request owner |

---

### `POST /api/requests/:id/pay`

Client confirms payment. Advances status from `COMPLETED` → `PAID`. A Payment record is created atomically with the status update.

- **Auth required:** ✅ `CLIENT` (must own the request)
- **Required status:** `COMPLETED`

#### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `:id` | `string` (ObjectId) | The service request ID |

#### Request Body

```json
{
  "amount": 150
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `amount` | `number` | ✅ | Must be a **positive number** greater than `0` |

#### Success Response — `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "status": "PAID",
    "technicianId": "507f1f77bcf86cd799439020",
    "clientName": "Hassan Idle",
    "phone": "0634567890",
    "location": "Jigjiga Yar, near the central market",
    "problem": "Electrical short circuit in the kitchen",
    "clientId": "507f1f77bcf86cd799439011",
    "createdAt": "2026-03-12T18:30:00.000Z",
    "updatedAt": "2026-03-12T20:00:00.000Z"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|--------|-----------|-------|
| `400` | `A valid positive \`amount\` is required` | `amount` missing, zero, negative, or not a number |
| `400` | `Service must be COMPLETED and approved before payment` | Request status is not `COMPLETED` (including already `PAID`) |
| `403` | `Unauthorized for this request` | Caller is not the request owner |

---

## 12. Full Workflow Sequence

The complete happy path from registration to payment:

```
Step  Role        Method   Endpoint                                  Notes
────  ──────────  ───────  ────────────────────────────────────────  ──────────────────────────────
 1    —           POST     /api/auth/register                        Register CLIENT, OPERATOR, TECHNICIAN
 2    CLIENT      POST     /api/auth/login                           Receive clientToken
 3    OPERATOR    POST     /api/auth/login                           Receive operatorToken
 4    TECHNICIAN  POST     /api/auth/login                           Receive techToken
 5    CLIENT      POST     /api/requests                             Status: REPORTED
                                                                     Save: requestId from response.data.id
 6    OPERATOR    GET      /api/users/technicians                    Find available tech
                                                                     Save: technicianId from response.data[n].id
 7    OPERATOR    POST     /api/requests/:requestId/assign           Body: { "technicianId": "..." }
                                                                     Status: ASSIGNED
 8    TECHNICIAN  POST     /api/requests/:requestId/arrived          Status: ARRIVED
 9    TECHNICIAN  POST     /api/requests/:requestId/estimate         Body: { "report": "...", "budget": 150 }
                                                                     Status: ESTIMATED
10    CLIENT      POST     /api/requests/:requestId/approve-estimate Status: APPROVED
11    TECHNICIAN  POST     /api/requests/:requestId/start-work       Status: IN_PROGRESS
12    TECHNICIAN  POST     /api/requests/:requestId/complete         Status: COMPLETED
13    CLIENT      POST     /api/requests/:requestId/approve          Acknowledgement (status unchanged)
14    CLIENT      POST     /api/requests/:requestId/pay              Body: { "amount": 150 }
                                                                     Status: PAID
```

---

*For questions or issues, contact the backend team.*
