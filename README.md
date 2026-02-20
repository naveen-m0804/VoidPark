# 🅿️ ParkEase — Smart Urban Parking Platform

> A mobile-first, peer-to-peer parking marketplace that connects people who have unused parking space with those who need it — in real time.

---

## 📌 Table of Contents

1. [Abstract](#abstract)
2. [Problem Statement](#problem-statement)
3. [Why ParkEase?](#why-parkease)
4. [Key Features](#key-features)
5. [Application Flow](#application-flow)
6. [Architecture Overview](#architecture-overview)
7. [Tech Stack](#tech-stack)
8. [Database Design](#database-design)
9. [ER Diagram](#er-diagram)
10. [Real-Time System](#real-time-system)
11. [Payment Integration](#payment-integration)
12. [Authentication](#authentication)
13. [Geolocation & Navigation](#geolocation--navigation)
15. [Folder Structure](#folder-structure)
16. [Getting Started](#getting-started)
17. [Environment Variables](#environment-variables)
18. [Screenshots & Output](#screenshots--output)
19. [Future Enhancements](#future-enhancements)
20. [Contributing](#contributing)
21. [License](#license)

---

## Abstract

ParkEase is a mobile-first web application designed to solve the growing urban parking crisis in metropolitan cities like Chennai, Bengaluru, Mumbai, and similar densely populated areas. The platform creates a shared economy around unused private parking spaces — allowing any registered user to both **offer** a parking space from their property and **book** a slot at someone else's space.

The system is built on a role-free model, meaning every user has identical access privileges. Once registered, a person can seamlessly switch between being a parking provider and a parking seeker without any role switching or separate account management. The platform handles real-time availability tracking, transactional booking to prevent double-booking, dynamic pricing by vehicle type and duration, and integrated payment processing via Razorpay — making it a complete end-to-end urban parking solution.

---

## Problem Statement

In urban areas like Chennai and other metropolitan cities, **finding a parking spot is a daily struggle** for commuters, delivery personnel, and visitors. At the same time, thousands of homeowners and landowners have **unused private parking areas** — driveways, empty plots, or compound spaces — that sit idle for most of the day.

This creates a classic supply-demand mismatch:

- 🚗 **Drivers** cannot find available, safe, and affordable parking near their destination.
- 🏠 **Property owners** with empty parking areas have no platform to monetize or share that space.
- 🏙️ **Cities** suffer from increased road congestion, illegal parking, and wasted urban land.

There is currently no simple, accessible platform that connects these two groups at a hyperlocal level — especially one optimized for mobile use while a person is actively on the move.

---

## Why ParkEase?

| Traditional Parking | ParkEase |
|---|---|
| Fixed municipal parking lots, often far from destination | Hyperlocal private spaces near the destination |
| No real-time availability info | Live slot availability via Socket.IO |
| Cash-only or no booking system | Online pre-booking and on-spot booking supported |
| Only commercial entities can provide parking | Any homeowner or landowner can list their space |
| Separate apps for booking vs. providing | Single unified platform for both roles |

### Who Benefits?

**For Parking Seekers (Drivers)**
- Find and book parking slots near their destination in advance or on the spot.
- Get turn-by-turn navigation via Google Maps integration.
- View pricing upfront with no hidden costs.
- Manage all bookings in one place.

**For Parking Providers (Space Owners)**
- Earn passive income from unused parking areas.
- Set their own pricing per vehicle type.
- Manage their listed spaces easily from a mobile browser.
- No upfront cost or hardware required to get started.

**For the City**
- Reduces illegal parking and roadside congestion.
- Makes better use of existing private infrastructure.
- Encourages a sharing economy model.

---

## Key Features

### 🔐 Authentication
- Firebase Authentication (Email, Phone, Google OAuth)
- Token-based protected API access
- Permanent account deletion with cascading data removal

### 🗺️ Smart Parking Discovery
- Auto-detects user's GPS location via browser
- Finds nearby parking spaces using **PostGIS geospatial queries**
- Configurable search radius
- Search by place name, street, or locality
- Displays both available and unavailable slots (for demand awareness)

### 📋 Detailed Parking Listings
Each parking card displays:
- Place name and full address
- Price per hour (per vehicle type)
- Supported vehicle types (bike, car, truck, etc.)
- Total slots vs. available slots
- Real-time availability indicator
- Google Maps navigation button

### 📅 Booking System
- Select date, time range, duration, and vehicle type
- Dynamic price calculation
- Transactional booking with row-level locking to prevent double booking
- On-spot or advance booking supported
- My Bookings section with complete history

### 🔴 Real-Time Updates
- Socket.IO broadcasts availability changes instantly
- All connected clients see live slot updates without refresh

### 🏠 Parking Provider Module
- Register a parking space with full details
- Auto-detect coordinates or enter manually
- Edit or remove listed spaces at any time
- Supports multiple vehicle types with individual pricing

---

## Application Flow

```
User Opens App
      │
      ▼
Firebase Authentication (Register / Login)
      │
      ▼
Dashboard Loads
  ├── Auto-detect GPS Location
  ├── Fetch Nearby Parking via PostGIS Query
  └── Display Parking Cards (Available + Unavailable)
      │
      ▼
User Browses / Searches
  ├── Search by Place Name or Address
  └── Click Navigation → Opens Google Maps
      │
      ▼
User Selects a Parking Space
      │
      ▼
Parking Detail Page
  ├── View Full Info, Pricing, Slot Timeline
  └── Select Date, Time, Duration, Vehicle Type
      │
      ▼
Booking Confirmed → Slot Marked Unavailable
  ├── Socket.IO Broadcasts Change to All Clients
  └── Booking Added to "My Bookings"
      │
      ▼
Profile Page (Any Time)
  ├── View / Edit Personal Details
  ├── Register New Parking Space
  │     ├── Enter Details + Detect/Enter Coordinates
  │     └── Space Listed → Visible in Search Results
  └── Delete Account (Removes All Data + Firebase UID)
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   CLIENT (Browser)               │
│         React.js · Mobile-First UI              │
│   Firebase Auth SDK · Razorpay Checkout SDK     │
│              Socket.IO Client                    │
└────────────────────┬────────────────────────────┘
                     │ HTTPS + WebSocket
┌────────────────────▼────────────────────────────┐
│              BACKEND (Node.js / Express)         │
│  REST API · Firebase Admin SDK · Socket.IO       │
│  Razorpay SDK · JWT Verification Middleware      │
└────────┬─────────────────────────┬──────────────┘
         │                         │
┌────────▼──────────┐   ┌──────────▼──────────────┐
│  PostgreSQL DB    │   │   Firebase Auth Service  │
│  + PostGIS        │   │   (External - Google)    │
│  (Geospatial      │   └─────────────────────────┘
│   Queries)        │
└───────────────────┘
```

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| **React.js** | Component-based UI framework |
| **Tailwind CSS** | Utility-first CSS for mobile-first responsive design |
| **Firebase Auth SDK** | Client-side authentication (Email, Phone, Google) |
| **Socket.IO Client** | Real-time availability updates |
| **Google Maps URL API** | Navigation redirect using lat/lng coordinates |

### Backend

| Technology | Purpose |
|---|---|
| **Node.js** | JavaScript runtime for the server |
| **Express.js** | HTTP REST API framework |
| **Socket.IO** | WebSocket server for real-time broadcasting |
| **Firebase Admin SDK** | Server-side token verification & account management |
| **pg / node-postgres** | PostgreSQL database client |

### Database

| Technology | Purpose |
|---|---|
| **PostgreSQL** | Primary relational database |
| **PostGIS** | Geospatial extension for radius-based location queries |

### Infrastructure & Services

| Service | Purpose |
|---|---|
| **Firebase Authentication** | User identity and session management |
| **Google Maps** | External navigation via deeplink URL |

---

## Database Design

### `users`
| Column | Type | Description |
|---|---|---|
| `id` | UUID / SERIAL | Primary key |
| `firebase_uid` | VARCHAR | Firebase Auth UID (unique) |
| `name` | VARCHAR | Full name |
| `email` | VARCHAR | Email address |
| `phone` | VARCHAR | Contact number |
| `created_at` | TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | Last update time |

### `parking_spaces`
| Column | Type | Description |
|---|---|---|
| `id` | SERIAL | Primary key |
| `owner_id` | INTEGER | FK → users.id |
| `place_name` | VARCHAR | Display name of the parking area |
| `address` | TEXT | Full address |
| `latitude` | DECIMAL | GPS latitude |
| `longitude` | DECIMAL | GPS longitude |
| `location` | GEOGRAPHY(POINT) | PostGIS geometry for geo queries |
| `price_per_hour` | JSONB | Price per vehicle type `{"car": 30, "bike": 10}` |
| `total_slots` | INTEGER | Total parking slots available |
| `vehicle_types` | TEXT[] | Array of supported vehicle types |
| `notes` | TEXT | Optional restrictions or description |
| `images` | TEXT[] | Array of image URLs |
| `created_at` | TIMESTAMP | Listing creation time |

### `bookings`
| Column | Type | Description |
|---|---|---|
| `id` | SERIAL | Primary key |
| `user_id` | INTEGER | FK → users.id |
| `parking_space_id` | INTEGER | FK → parking_spaces.id |
| `vehicle_type` | VARCHAR | Type of vehicle booked |
| `start_time` | TIMESTAMP | Booking start time |
| `end_time` | TIMESTAMP | Booking end time |
| `amount_paid` | DECIMAL | Total amount charged |
| `payment_status` | ENUM | `pending`, `paid`, `failed` |
| `booking_status` | ENUM | `active`, `completed`, `cancelled` |
| `created_at` | TIMESTAMP | Booking creation time |

---

## ER Diagram

> 📎 *The ER diagram and database visual are included in the `/docs` folder of this repository.*

```
┌─────────────┐          ┌──────────────────────┐          ┌──────────────┐
│    users    │          │   parking_spaces      │          │   bookings   │
├─────────────┤          ├──────────────────────┤          ├──────────────┤
│ id (PK)     │◄────┐    │ id (PK)              │◄────┐    │ id (PK)      │
│ firebase_uid│     │    │ owner_id (FK→users)  │     │    │ user_id (FK) │
│ name        │     └────│ place_name           │     └────│ space_id(FK) │
│ email       │          │ address              │          │ vehicle_type │
│ phone       │          │ latitude             │          │ start_time   │
│ created_at  │          │ longitude            │          │ end_time     │
└─────────────┘          │ location (PostGIS)   │          │ amount_paid  │
                         │ price_per_hour(JSONB)│          │ pay_status   │
                         │ total_slots          │          │ booking_stat │
                         │ vehicle_types[]      │          │ razorpay_ids │
                         │ images[]             │          │ created_at   │
                         └──────────────────────┘          └──────────────┘
```

**Relationships:**
- One **User** → Many **Parking Spaces** (as provider)
- One **User** → Many **Bookings** (as seeker)
- One **Parking Space** → Many **Bookings**

---

## Real-Time System

ParkEase uses **Socket.IO** to maintain live sync between all connected clients.

**Events:**

| Event Name | Trigger | Payload |
|---|---|---|
| `slot_booked` | A booking is confirmed | `{ parking_space_id, available_slots }` |
| `slot_released` | A booking is cancelled or expires | `{ parking_space_id, available_slots }` |
| `space_updated` | Provider edits a parking space | `{ parking_space_id, updated_fields }` |
| `space_removed` | Provider deletes a listing | `{ parking_space_id }` |

When any of these events are received on the client, the relevant parking card on the dashboard updates in real time without requiring a page refresh. This prevents users from attempting to book a slot that was just taken by someone else.

---

## Authentication

Firebase Authentication handles all identity management. The frontend never stores passwords.

**Login Flow:**
1. User logs in via Firebase (email/password, phone OTP, or Google OAuth).
2. Firebase returns a **JWT ID Token**.
3. Every protected API request sends this token in the `Authorization: Bearer <token>` header.
4. The Express backend uses **Firebase Admin SDK** to verify the token and extract the user's `firebase_uid`.
5. The `firebase_uid` is used to look up the user record in PostgreSQL.

**Account Deletion:**
- User initiates deletion from the Profile page.
- Backend begins a **database transaction**:
  1. Deletes all bookings by the user.
  2. Deletes all parking spaces listed by the user (and their associated bookings).
  3. Deletes the user record from PostgreSQL.
  4. Calls Firebase Admin SDK to delete the Firebase account.
- If any step fails, the entire transaction is rolled back to prevent orphaned records.

---

## Geolocation & Navigation

### Location Detection
- The frontend requests the device's GPS coordinates using the **Geolocation Web API** (`navigator.geolocation`).
- Coordinates are sent to the backend to find nearby parking within a configurable radius (default: 5 km).

### PostGIS Geospatial Query
The backend uses the PostGIS `ST_DWithin` function to efficiently find nearby spaces:
```sql
SELECT *, 
  ST_Distance(location, ST_MakePoint($1, $2)::geography) AS distance
FROM parking_spaces
WHERE ST_DWithin(
  location,
  ST_MakePoint($1, $2)::geography,
  $3  -- radius in meters
)
ORDER BY distance ASC;
```

### Google Maps Navigation
Each parking card includes a **Navigate** button. Clicking it opens:
```
https://www.google.com/maps/dir/?api=1&destination={latitude},{longitude}
```
This launches Google Maps (or the Maps app on mobile) with the parking location pre-set as the destination — no complex in-app map rendering required.

---

## API Overview

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user after Firebase sign-up |
| DELETE | `/api/auth/delete-account` | Delete account and all associated data |

### Parking Spaces
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/parking/nearby` | Get nearby spaces (lat, lng, radius params) |
| GET | `/api/parking/search` | Search by place name or address |
| GET | `/api/parking/:id` | Get full details of a parking space |
| POST | `/api/parking` | List a new parking space (auth required) |
| PUT | `/api/parking/:id` | Update a parking space (owner only) |
| DELETE | `/api/parking/:id` | Remove a parking space (owner only) |

### Bookings
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/bookings/create` | Create and confirm a booking (auth required) |
| GET | `/api/bookings/my` | Get all bookings for current user |
| DELETE | `/api/bookings/:id` | Cancel a booking |

### Profile
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/profile` | Get logged-in user's profile |
| PUT | `/api/profile` | Update profile details |

---

## Folder Structure

```
ParkEase/
├── client/                         # React frontend
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── ParkingCard.jsx     # Dashboard listing card
│       │   ├── BookingForm.jsx     # Time & vehicle selection
│       │   └── NavButton.jsx       # Google Maps redirect
│       ├── pages/
│       │   ├── Dashboard.jsx       # Main discovery page
│       │   ├── ParkingDetail.jsx   # Full parking info + booking
│       │   ├── MyBookings.jsx      # User booking history
│       │   └── Profile.jsx         # User profile + provider module
│       ├── hooks/
│       │   ├── useLocation.js      # GPS detection hook
│       │   └── useSocket.js        # Socket.IO connection hook
│       ├── context/
│       │   └── AuthContext.jsx     # Firebase auth state
│       └── firebase.js             # Firebase config
│
├── server/                         # Node.js + Express backend
│   ├── routes/
│   │   ├── auth.js
│   │   ├── parking.js
│   │   ├── bookings.js
│   │   └── profile.js
│   ├── middleware/
│   │   └── verifyToken.js          # Firebase token middleware
│   ├── socket/
│   │   └── socketHandler.js        # Socket.IO event handlers
│   ├── db/
│   │   ├── index.js                # pg pool setup
│   │   └── schema.sql              # Database schema
│   └── index.js                    # Express + Socket.IO server entry
│
├── docs/
│   ├── er-diagram.png              # ER diagram
│   ├── db-schema-visual.png        # Database visual
│   └── output-screenshots/         # App output screenshots
│
├── .env.example
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL 14+ with PostGIS extension
- Firebase project with Authentication enabled
- Razorpay account (test or live)

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/naveen-m0804/ParkEase.git
cd ParkEase
```

**2. Set up the database**
```bash
# Connect to PostgreSQL and create the database
psql -U postgres
CREATE DATABASE parkease;
\c parkease
CREATE EXTENSION postgis;

# Run the schema
psql -U postgres -d parkease -f server/db/schema.sql
```

**3. Configure environment variables**
```bash
cp .env.example .env
# Fill in all required values (see Environment Variables section)
```

**4. Install and run the backend**
```bash
cd server
npm install
npm run dev
```

**5. Install and run the frontend**
```bash
cd client
npm install
npm start
```

The app will be available at `http://localhost:3000`.

---

## Environment Variables

Create a `.env` file in the `server/` directory:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/parkease

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your_project.iam.gserviceaccount.com

# App
PORT=5000
CLIENT_URL=http://localhost:3000
DEFAULT_SEARCH_RADIUS_METERS=5000
```

Create a `.env` file in the `client/` directory:

```env
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_API_BASE_URL=http://localhost:5000
```

---

## Screenshots & Output
### Login Page - Home Page of the website
<img width="1920" height="1698" alt="screencapture-park-ease-6sr4-onrender-login-2026-02-20-12_01_14" src="https://github.com/user-attachments/assets/3b5355c3-9b6d-4a3e-9669-e4cfa272a4fa" />
### Registration - New User will register by provoiding the valid Info
<img width="1920" height="897" alt="screencapture-park-ease-6sr4-onrender-register-2026-02-20-12_02_21" src="https://github.com/user-attachments/assets/7f570b22-19a9-4286-b667-edc9268a9bd2" />

### Dashboard — Parking Discovery Feed
<img width="1920" height="868" alt="screencapture-park-ease-6sr4-onrender-2026-02-20-12_03_26" src="https://github.com/user-attachments/assets/5153c5c5-c475-43d7-ab49-bdbe047e10b8" />

### Parking Detail — Full Info,  Booking Interface, Time Selection & Confirmation
<img width="1920" height="868" alt="screencapture-park-ease-6sr4-onrender-2026-02-20-12_03_26" src="https://github.com/user-attachments/assets/0c2310a0-ec43-44c4-84da-cdb4dff515e6" />


### My Bookings — Reservation History
<img width="1920" height="868" alt="screencapture-park-ease-6sr4-onrender-bookings-2026-02-20-12_27_26" src="https://github.com/user-attachments/assets/ebd2d9c7-6689-4747-8064-8289e5d246d5" />


### Profile & Provider Module — Register a Parking Space
<img width="1920" height="1162" alt="screencapture-park-ease-6sr4-onrender-profile-2026-02-20-12_09_43" src="https://github.com/user-attachments/assets/e2d860ef-81ad-4453-8c41-4b536072285d" />

### Database Schema Visual
<img width="1338" height="748" alt="supabase-schema-eqnsmyahfdechczzodla" src="https://github.com/user-attachments/assets/e790b57c-9d9d-4526-a425-c668705afdee" />

---

## Future Enhancements

- **In-app Map View** — Render parking locations on an embedded Mapbox or Leaflet map instead of redirecting to Google Maps.
- **Push Notifications** — Notify users of booking confirmations, reminders, and slot expiry.
- **Ratings & Reviews** — Let users rate parking spaces and leave reviews.
- **Recurring Availability Schedules** — Providers can define hours of operation per day of the week.
- **Admin Dashboard** — Moderation panel for reviewing listings and handling disputes.
- **Multi-language Support** — Tamil, Hindi, and other regional language support for broader accessibility.
- **Native Mobile App** — React Native version for iOS and Android.
- **Waitlist / Notifications** — Users can join a waitlist for a fully booked space and be notified when a slot opens.

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature-name`)
3. Commit your changes (`git commit -m 'Add: description of change'`)
4. Push to your branch (`git push origin feature/your-feature-name`)
5. Open a Pull Request

Please ensure all API changes are reflected in the API documentation and that existing tests pass before submitting.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <strong>Built to make urban parking smarter, one shared space at a time.</strong><br/>
  <sub>Made with ❤️ for metropolitan commuters and homeowners across India</sub>
</div>
