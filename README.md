# InsuredMine Node.js Assessment

A Node.js + Express + MongoDB backend that imports insurance policy data from CSV/XLSX using worker threads, exposes search and aggregation APIs, auto-restarts cluster workers on high CPU, and inserts scheduled messages at a given day and time in a restart-safe way.

## Tech stack

- **Runtime:** Node.js (tested on v24), JavaScript
- **Framework:** Express
- **Database:** MongoDB with Mongoose
- **File upload and parsing:** Multer, SheetJS (xlsx)
- **Concurrency:** `worker_threads` (import), `cluster` (multi-worker server)
- **Dev tools:** Nodemon, Postman

## Features

| Task | Feature | Endpoint |
|---|---|---|
| 1.1 | Upload CSV/XLSX into MongoDB using a worker thread | `POST /api/upload` |
| 1.2 | Search policy info by username | `GET /api/policies/search` |
| 1.3 | Aggregated policies per user | `GET /api/policies/summary` |
| 1.4 | Separate collections: Agent, User, Account, LOB, Carrier, Policy | (data model) |
| 2.1 | Real-time CPU monitoring, restart worker at 70% | (cluster + monitor) |
| 2.2 | Insert a message into DB at a given day and time | `POST /api/messages/schedule` |

## Getting started

### Prerequisites

- Node.js 18 or above
- MongoDB running locally (default `mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string

### Installation

```bash
git clone https://github.com/logeshajith/insuredmine-assessment.git
```

```bash
cd insuredmine-assessment
```

```bash
npm install
```

### Environment variables

Copy `.env.example` to `.env` and adjust if needed.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/insuredmine` | MongoDB connection string |
| `WORKERS` | CPU core count | Number of cluster workers |
| `CPU_THRESHOLD` | `70` | CPU % that triggers a worker restart |
| `CPU_CHECK_INTERVAL_MS` | `5000` | How often each worker checks its CPU |
| `CPU_STRIKES` | `3` | Consecutive high readings needed before restart |
| `CPU_WARMUP_MS` | `30000` | Grace period before a new worker is monitored |
| `CPU_LOG` | `false` | Log every CPU reading (useful for demo) |
| `TIMEZONE_OFFSET` | `+05:30` | Timezone used for scheduled message day/time (IST) |
| `SCHEDULER_INTERVAL_MS` | `5000` | How often the scheduler checks for due messages |

### Run

Development (auto-reload):

```bash
npm run dev
```

Production:

```bash
npm start
```

Expected startup output:

```
[Primary 16588] Starting 2 workers
[DB] Connected (pid 4156)
[DB] Connected (pid 14836)
[Worker 4156] Listening on http://localhost:3000
[Worker 14836] Listening on http://localhost:3000
```

A sample data file is included at `sample-data/data-sheet.csv`, and a Postman collection is in the `postman/` folder.

## API reference

Base URL: `http://localhost:3000`

### Health check

`GET /api/health`

```json
{ "status": "ok", "pid": 10516, "time": "2026-09-30T14:48:55.970Z" }
```

### Task 1.1: Upload CSV/XLSX

`POST /api/upload` with `multipart/form-data`, field name `file` (`.csv`, `.xlsx`, `.xls`, max 10 MB).

The API responds immediately with `202 Accepted`. The import runs in a worker thread.

```json
{
  "message": "File received. Import is running in the background.",
  "jobId": "6abd2aaebd6a3d4353324e88",
  "statusUrl": "/api/upload/6abd2aaebd6a3d4353324e88"
}
```

`GET /api/upload/:jobId` returns the import status and summary.

```json
{
  "fileName": "data-sheet.csv",
  "status": "completed",
  "result": {
    "totalRows": 1198,
    "imported": 1198,
    "skippedRows": [],
    "agents": 3,
    "lobs": 19,
    "carriers": 46,
    "users": 1198
  }
}
```

With the provided sample file, the whole import took about 4.6 seconds in the background while the API replied instantly.

### Task 1.2: Search policy by username

`GET /api/policies/search?username=Lura`

Matches the user's first name (case-insensitive, partial match). Returns user details, account names, and policies with category, carrier, and agent names.

```json
{
  "count": 1,
  "results": [
    {
      "user": {
        "firstName": "Lura Lucca",
        "email": "madler@yahoo.ca",
        "dob": "1960-02-11T00:00:00.000Z",
        "phone": "8677356559",
        "state": "NC",
        "zip": "27028",
        "userType": "Active Client"
      },
      "accounts": ["Lura Lucca & Owen Dodson"],
      "policies": [
        {
          "policyNumber": "YEEX9MOIBU7X",
          "policyStartDate": "2018-11-02T00:00:00.000Z",
          "policyEndDate": "2019-11-02T00:00:00.000Z",
          "premiumAmount": 1180.83,
          "category": "Commercial Auto",
          "company": "Integon Gen Ins Corp",
          "agent": "Alex Watson"
        }
      ]
    }
  ]
}
```

Errors: `400` if `username` is missing or shorter than 2 characters, `404` if no user matches.

### Task 1.3: Aggregated policies per user

`GET /api/policies/summary?page=1&limit=20`

Uses a MongoDB aggregation pipeline (`$lookup`, `$group`, `$sum`, `$push`, `$facet`) to return, per user: total policies, total premium, and the list of policies. Paginated (`limit` max 100).

```json
{
  "page": 1,
  "limit": 20,
  "totalUsers": 1198,
  "totalPages": 60,
  "data": [
    {
      "userId": "6abd2ab0b15bff0606d5dcfa",
      "firstName": "Lura Lucca",
      "email": "madler@yahoo.ca",
      "totalPolicies": 1,
      "totalPremium": 1180.83,
      "policies": [ { "policyNumber": "YEEX9MOIBU7X", "category": "Commercial Auto", "company": "Integon Gen Ins Corp" } ]
    }
  ]
}
```

Note: in the provided data, every user has exactly one policy, so `totalPolicies` is 1 for everyone. The aggregation groups correctly for users with multiple policies.

### Task 2.2: Schedule a message

`POST /api/messages/schedule`

```json
{
  "message": "Hello from InsuredMine test",
  "day": "2026-10-05",
  "time": "10:30"
}
```

- `day`: date in `YYYY-MM-DD` format (validated as a real calendar date)
- `time`: 24-hour `HH:mm`
- Interpreted in the timezone set by `TIMEZONE_OFFSET` (IST by default)

Response `201 Created`:

```json
{
  "message": "Message scheduled successfully",
  "id": "6abd383abf2dd1566ae60e58",
  "scheduledAt": "2026-10-05T05:00:00.000Z",
  "scheduledLocal": "2026-10-05 10:30 (UTC+05:30)",
  "status": "pending"
}
```

Errors (`400`): empty message, invalid date, wrong time format, or a time in the past.

Helper endpoints:

- `GET /api/messages/scheduled?status=pending` lists scheduled jobs (`pending`, `processing`, `done`, `failed`)
- `GET /api/messages` lists messages actually inserted, with `scheduledFor` and `insertedAt`

### Task 2.1: CPU load demo (non-production only)

`GET /api/debug/cpu-load?seconds=60`

Keeps the receiving worker's CPU busy so the auto-restart can be demonstrated. This route is disabled when `NODE_ENV=production`.

## Data model

Each entity is stored in its own collection, linked by ObjectId references (like foreign keys).

| Collection | Key fields | Unique key |
|---|---|---|
| `agents` | agentName | agentName |
| `users` | firstName, dob, address, phone, state, zip, email, gender, userType | email + firstName |
| `accounts` | accountName, userId | accountName + userId |
| `lobs` | category_name | category_name |
| `carriers` | company_name | company_name |
| `policies` | policyNumber, policyStartDate, policyEndDate, premiumAmount, categoryId, companyId, userId, agentId | policyNumber |
| `uploadjobs` | fileName, status, result, error | |
| `scheduledmessages` | message, scheduledAt, status, lockedAt, processedAt | |
| `messages` | message, scheduledFor, insertedAt, scheduledMessageId | scheduledMessageId |

`agentId` on Policy was added beyond the required fields, so each policy can be traced to the agent who sold it.

## Design decisions

### Task 1: Import with worker threads

- The HTTP handler only saves the file and starts a `Worker`, then returns `202` with a job ID. Parsing and database writes happen off the main thread, so the server stays responsive during large imports.
- The worker opens its own MongoDB connection, since worker threads don't share the main thread's connection.
- Data is written in dependency order: Agent, LOB, Carrier, then User, Account, and finally Policy (which references the others).
- `bulkWrite` with `upsert` is used throughout. It is fast (one call per collection instead of one per row) and idempotent: uploading the same file twice does not create duplicates.
- Rows missing required values are skipped and their line numbers are reported in `skippedRows`.
- CSV values are read as raw text, so phone numbers and zip codes keep their exact digits (including leading zeros).
- The uploaded file is deleted after processing.

### Data observations (from the provided sheet)

- 1,198 rows, one policy per row (`policy_number` is unique).
- Only 3 agents, 19 LOBs, and 46 carriers, so these are deduplicated into small lookup collections.
- **Emails are not unique:** 1,149 unique emails across 1,198 people, and one email is shared by up to 3 different people. A user is therefore identified by `email + firstName`, not email alone.
- `gender` is empty in 463 rows and stored as `null`.

### Task 2.1: CPU monitoring and auto-restart (cluster)

- The server runs in cluster mode: a **primary** process manages several **workers**, which share port 3000 and handle requests.
- Each worker measures **its own** CPU usage every 5 seconds using `process.cpuUsage()` against elapsed time.
- A restart is triggered only after **3 consecutive** readings above 70%, so a single short spike does not restart the worker.
- **One restart at a time:** the worker asks the primary for permission over IPC. If another worker is already restarting, the request is denied and retried later. This prevents all workers restarting together under heavy load (which would cause downtime).
- **Graceful shutdown:** the worker stops accepting new connections, finishes in-flight requests, closes the DB connection, then exits. A 10-second safety timeout forces exit if something hangs.
- The primary immediately forks a replacement. Other workers keep serving traffic, so users are not affected.
- **Warm-up period:** a new worker is not monitored for its first 30 seconds, avoiding restart loops.
- **Crash-loop protection:** if a worker dies within 5 seconds of starting (e.g. DB unreachable), the primary waits 5 seconds before forking again.

Verified output (worker 10568 loaded, worker 10988 unaffected):

```
[CPU] Worker 10568: 92.5%
[CPU] Worker 10568 above 70% (1/3)
[CPU] Worker 10988: 0.0%
[CPU] Worker 10568: 100.0%
[CPU] Worker 10568 above 70% (2/3)
[CPU] Worker 10988: 0.0%
[CPU] Worker 10568: 99.1%
[CPU] Worker 10568 above 70% (3/3)
[Primary] Approved restart of worker 10568 (CPU 99.1%)
[Worker 10568] Graceful shutdown: CPU 99.1% above threshold
[Primary] Worker 10568 exited (code 0). Starting a new worker...
```

Note: CPU is measured per worker process, where 100% equals one full core. In production, the same behaviour can be achieved with PM2 cluster mode or multiple instances behind a load balancer, so a restarting instance never receives traffic.

### What happens to requests during a restart

- In-flight requests on the restarting worker are allowed to finish (graceful shutdown).
- New requests are routed by the cluster to the remaining healthy workers.
- In production, a load balancer (e.g. Nginx, AWS ALB) with health checks gives the same guarantee across machines.

### Task 2.2: Restart-safe scheduled messages

Because Task 2.1 can restart workers at any time, messages are **not** scheduled with in-memory timers (`setTimeout` or in-memory cron), which would be lost on restart.

- Each request is stored as a `pending` job in `scheduledmessages` with its `scheduledAt` time.
- Every worker runs a lightweight poller (every 5 seconds) that picks due jobs and inserts them into `messages`.
- **No duplicates across workers:** jobs are claimed with an atomic `findOneAndUpdate` (`pending` to `processing`), so only one worker can take a job. A unique index on `messages.scheduledMessageId` is a second safety net.
- **Stuck job recovery:** jobs left in `processing` for over a minute (worker died mid-job) are returned to `pending`.
- **Catch-up after downtime:** the scheduler runs once immediately on startup, so jobs that became due while the server was down are inserted as soon as it comes back.
- Precision is within the poll interval (about 5 seconds). This can be tightened with `SCHEDULER_INTERVAL_MS`.

Verified result: a message scheduled for `16:28:00Z` was inserted at `16:28:04.754Z`, exactly once, with two workers running.

## Assumptions

- **"Day" means a calendar date** (`YYYY-MM-DD`), and time is interpreted in IST (`+05:30`). This is configurable via `TIMEZONE_OFFSET`.
- **"Username" search matches the user's first name** field (the sheet's `firstname` column holds the full name, e.g. "Lura Lucca"), case-insensitive and partial.
- The xlsx library is installed from the official SheetJS CDN build, because the npm registry version has known vulnerabilities.

## Project structure

```
src/
├── app.js                     Express app, routes, error handling
├── server.js                  Cluster primary/worker, CPU monitor, scheduler, graceful shutdown
├── config/
│   └── db.js                  MongoDB connection
├── models/                    Mongoose schemas (one per collection)
├── controllers/
│   ├── upload.controller.js   Upload + job status
│   ├── policy.controller.js   Search + aggregation
│   └── message.controller.js  Schedule + list messages
├── routes/                    Route definitions (upload, policies, messages, debug)
├── services/
│   ├── cpuMonitor.js          Per-worker CPU sampling
│   └── scheduler.js           Restart-safe message scheduler
└── workers/
    └── importWorker.js        CSV/XLSX import in a worker thread
sample-data/                   Provided data sheet
postman/                       Postman collection
uploads/                       Temporary upload folder (files deleted after import)
```

## Possible improvements

- Use a job queue (e.g. BullMQ with Redis) for imports and scheduled messages at larger scale
- Stream and chunk very large files instead of loading them fully into memory
- Add authentication, rate limiting, and request validation with a schema library
- Add OpenAPI/Swagger documentation
- Run with PM2 or in containers behind a load balancer in production
