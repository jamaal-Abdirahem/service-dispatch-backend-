Product Requirements Document (PRD)
Service Technician Dispatch Platform
1. Product Overview
Purpose:
The Service Dispatch Platform connects clients with technical service providers through a centralized call center system.
Clients report technical problems to a call center, which assigns the nearest available technician.
The system manages the entire workflow from reporting to payment confirmation.
2. Goals
Primary Goals:
- Reduce time to assign technicians
- Improve service transparency
- Track service lifecycle
- Ensure payment confirmation

Success Metrics:
- Technician response time
- Service completion rate
- Payment completion rate
- Client satisfaction
3. User Roles
Client:
- Request service
- Approve technician arrival
- Approve service completion
- Pay service fee

Call Center Operator:
- Create service request
- Assign technician
- Monitor service progress

Technician:
- Receive service request
- Travel to client location
- Confirm job completion
- View payment status

Admin:
- Manage technicians
- Manage call center staff
- View system analytics
4. Core Workflow
Step 1 – Problem Report:
Client contacts call center and the operator creates a service request.

Step 2 – Dispatch Technician:
The system finds the nearest available technician and assigns the job.

Step 3 – Technician Arrival:
Technician arrives and client approves technician arrival.

Step 4 – Service Completion:
Technician finishes service and marks the job as done.

Step 5 – Payment:
Client pays and technician can see payment confirmation.
5. Functional Requirements
Service Request Management:
- Create service request
- Assign technician
- Track request status

Technician Dispatch:
- Find nearest technician
- Allow manual assignment
- Notify technician

Service Tracking Status:
REPORTED → ASSIGNED → IN_PROGRESS → COMPLETED → PAID

Client Approvals:
- Technician arrival
- Service completion
- Payment
6. Non Functional Requirements
Performance:
- API response time under 300ms

Security:
- JWT authentication
- Role-based access control

Scalability:
- Architecture ready for microservices
7. System Architecture
Client Application (Next.js)
        |
API Layer (Node.js + Express)
        |
Business Logic
        |
Database (PostgreSQL with Prisma ORM)
8. Frontend Architecture (Next.js)
Technology Stack:
- Next.js
- TypeScript
- TailwindCSS
- Axios
- React Query

Frontend Structure:
frontend/
  app/
  components/
  pages/
  services/
  hooks/
  context/
  utils/

Pages:
Client:
- /client/request
- /client/status
- /client/payment

Call Center Dashboard:
- /dashboard
- /dashboard/requests
- /dashboard/assign

Technician Dashboard:
- /technician/jobs
- /technician/job-details
9. Backend Architecture (Node.js + Express)
Technology Stack:
- Node.js
- Express.js
- Prisma ORM
- PostgreSQL
- JWT Authentication

Backend Structure:
backend/
  controllers/
  routes/
  services/
  middleware/
  prisma/
  utils/
10. API Endpoints
POST /api/requests
Create service request

POST /api/requests/:id/assign
Assign technician

POST /api/requests/:id/arrived
Technician arrival

POST /api/requests/:id/complete
Complete service

POST /api/requests/:id/approve
Client approves service

POST /api/requests/:id/pay
Confirm payment
11. Database Design (Prisma Models)
User
- id
- name
- phone
- role
- createdAt

Technician
- id
- userId
- location
- available

ServiceRequest
- id
- clientName
- phone
- location
- problem
- status
- technicianId
- createdAt

Payment
- id
- requestId
- amount
- status
12. Notifications
Notifications are sent to:
- Technician when new job is assigned
- Client when technician arrives
- Client when service is complete
- Technician when payment is confirmed
13. Security
Authentication: JWT
Authorization: Role-based access control
14. Future Features
- GPS technician tracking
- In-app payments
- Technician rating system
- AI-based technician matching
15. Risks
Technician unavailable → fallback technician assignment
Client refuses payment → payment verification
Location mismatch → GPS verification
16. MVP Scope
Included:
- Service request
- Technician dispatch
- Client approval
- Service completion
- Payment confirmation

Excluded:
- Ratings
- GPS tracking
- Automated dispatch AI
17. Timeline
Design: 1 week
Backend Development: 3 weeks
Frontend Development: 3 weeks
Testing: 1 week


