# Queue Based Hall Ticket Middleware (Vercel + Appwrite)

This project implements a hall ticket download portal that avoids server crashes during high traffic by introducing a virtual queue with per-second processing limits.

## Features

- Login for student and faculty
- Signup for student and faculty
- Login with roll number and password
- Session management with automatic logout window
- Virtual queue with rate-limited processing
- Queue status polling (queued or ready)
- Hall ticket download enabled only when user reaches ready state
- Appwrite-first data access with mock fallback for local demo
- Vercel serverless API routes and static frontend

## Architecture

- Frontend: HTML, CSS, JavaScript in public folder
- Middleware/API: Vercel serverless functions in api folder
- Data source: Appwrite collections (users and halltickets)
- Queue engine: in-memory queue per serverless instance for starter implementation

Important production note:
The current queue state is in-memory, which is suitable for prototype/demo. For production-grade consistency across many serverless instances, move queue state to a shared store (for example Redis or Appwrite queue collection + worker).

## Appwrite Data Model

Create these collections in your Appwrite database:

1. users
- userId (string)
- role (string: student or faculty)
- rollNumber (string)
- facultyId (string)
- password (string)
- name (string)
- course (string)
- semester (string)
- examDate (string)
- center (string)
- department (string)
- designation (string)

2. halltickets
- hallticketId (string)
- userId (string)
- examName (string)
- pdfUrl (string)

## Local Run

1. Install dependencies

npm install

2. Create environment file

Copy .env.example to .env and fill values.

3. Start local Vercel dev server

npm run dev

4. Open local URL shown by Vercel

## Deploy to Vercel

1. Push repository to GitHub
2. Import project in Vercel dashboard
3. Configure environment variables from .env.example
4. Deploy

## Demo Credentials (without Appwrite config)

- Roll number: 2026CS001, Password: pass123
- Roll number: 2026CS002, Password: pass123
- Faculty ID: FAC1001, Password: pass123

## API Summary

- POST /api/auth/signup
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/logout
- POST /api/hallticket/request
- GET /api/hallticket/status
