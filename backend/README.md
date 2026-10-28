# Campus Auction Marketplace — Backend MVP

A robust, modular, and fully tested Node.js/Express backend MVP for a college campus second-hand auction marketplace.

---

## 1. Architecture & Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.js                 # MongoDB connection and lifecycle management
│   ├── models/
│   │   ├── User.js               # User accounts, auth & roles
│   │   ├── Listing.js            # Items, pricing, timing, & auction state
│   │   ├── Bid.js                # Immutable bid records with timestamps
│   │   └── SaleOutcome.js        # Post-auction outcomes, handover, audit log
│   ├── controllers/
│   │   ├── authController.js     # Register, login, me
│   │   ├── listingController.js  # CRUD, filtering, pagination
│   │   ├── bidController.js      # Bidding & concurrency control
│   │   ├── auctionController.js  # Administrative auction closure
│   │   └── saleController.js     # Seller approval, handover, failed pickup
│   ├── routes/
│   │   ├── authRoutes.js         # /api/auth
│   │   ├── listingRoutes.js      # /api/listings
│   │   ├── bidRoutes.js          # /api/listings/:id/bids
│   │   ├── auctionRoutes.js      # /api/auctions
│   │   └── saleRoutes.js         # /api/sales
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT verification & role authorization
│   │   ├── errorMiddleware.js    # Centralized error handling & status mapping
│   │   ├── notFoundMiddleware.js # 404 handler
│   │   └── validateRequest.js    # Express-validator result parser
│   ├── validators/
│   │   ├── listingValidators.js  # Validation schemas for listings
│   │   └── bidValidators.js      # Validation schemas for bids
│   ├── services/
│   │   └── auctionService.js     # Reusable, idempotent closure engine
│   ├── utils/
│   │   └── ApiError.js           # Custom operational error class
│   ├── app.js                    # Express app configuration & middleware
│   └── server.js                 # HTTP listener & graceful shutdown handlers
├── tests/
│   ├── testHelper.js             # MongoMemoryServer test harness & helpers
│   ├── auth.test.js              # Auth & health test suite
│   ├── listing.test.js           # Listing creation, filtering, permissions
│   ├── bidding.test.js           # Bidding business rules & concurrency
│   └── auctionClosureAndSale.test.js # Closure, decisions, handover
├── .env.example                  # Environment variable blueprint
├── .gitignore
├── package.json
└── README.md
```

---

## 2. Technology Stack

- **Runtime:** Node.js (v20+)
- **Framework:** Express.js (v4)
- **Database:** MongoDB Atlas with Mongoose (v8)
- **Module System:** JavaScript ES Modules (`"type": "module"`)
- **Authentication:** JWT (`jsonwebtoken`) & `bcryptjs`
- **Validation:** `express-validator`
- **Security & Utilities:** `cors`, `dotenv`
- **Test Framework:** Node.js built-in test runner (`node:test`, `node:assert`), `mongodb-memory-server`, `supertest`

---

## 3. MongoDB Atlas Setup & Environment Configuration

1. Log in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a cluster (or use an existing free M0 cluster).
3. Under **Database Access**, create a database user with read/write privileges.
4. Under **Network Access**, add your current IP address (or `0.0.0.0/0` for development).
5. Click **Connect** > **Drivers** > copy the connection string.
6. Create `.env` inside `backend/` by copying `.env.example`:

```bash
cp .env.example .env
```

7. Update `.env` with your values:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/campus_auction?retryWrites=true&w=majority
JWT_SECRET=replace_with_a_secure_random_string_at_least_32_characters_long
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
```

---

## 4. Installation & Startup Commands

### Install dependencies
```bash
cd backend
npm install
```

### Start development server (auto-restarts on change)
```bash
npm run dev
```

### Start production server
```bash
npm start
```

### Run automated tests
All 27 integration tests run against an isolated in-memory MongoDB instance:
```bash
npm test
```

---

## 5. Concurrency Strategy for Bidding

High concurrency during auction close or competitive bidding can cause race conditions where two buyers attempt to place bids based on the same outdated price.

To guarantee zero race conditions and zero price desynchronization, the backend implements a **two-layer defensive concurrency strategy**:

1. **MongoDB Multi-Document ACID Transactions (Layer 1):**
   - When running on MongoDB Atlas or a replica set, bids are placed within a transactional session (`session.startTransaction()`).
   - The document is re-read within the transaction. If conflicting concurrent modifications occur, MongoDB throws a `TransientTransactionError`, automatically aborting the transaction and returning an HTTP `409 Conflict` to the client.

2. **Atomic Compare-And-Swap (CAS) Update (Layer 2 Fallback):**
   - For standalone instances or if transactions are unavailable, an atomic conditional update is performed:
     ```javascript
     const filter = {
       _id: listing._id,
       currentPrice: listing.currentPrice, // Optimistic concurrency check
       leadingBid: listing.leadingBid,
       closingTime: { $gt: now },
       status: { $in: ['active', 'scheduled'] }
     };
     ```
   - Only the first request matches the document and succeeds. The competing request finds 0 matching documents, immediately deletes any staged bid record, and returns `409 Conflict`, prompting the user to refresh and place a higher bid.
   - **Accepted bid history is never erased or overwritten.**

---

## 6. Campus Handover & Seller Decision Workflow

```
[ Auction Closes (closingTime passes) ]
                     │
         ┌───────────┴───────────┐
     [ No Bids ]             [ Valid Bids ]
         │                       │
Status: 'unsold'        Status: 'awaiting_seller_decision'
Outcome: 'unsold'       Outcome: 'pending' (provisionalWinner set)
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
        [ Seller Approves ]             [ Seller Rejects ]
                 │                               │
         Status: 'reserved'              Status: 'rejected'
         Outcome: 'reserved'             Outcome: 'rejected'
                 │
      ┌──────────┴──────────┐
      │                     │
[ Both Confirm ]    [ Failed Pickup / No-show ]
      │                     │
Status: 'completed'  Status: 'failed_pickup'
Outcome: 'completed' Outcome: 'failed_pickup'
```

- **Approval:** Only the listing's seller can approve the winning bid. Approval reserves the item for the `provisionalWinner`.
- **Rejection:** Seller may decline the winning bid. The auction closes as `rejected`.
- **Two-Party Handover:** Both the seller (`confirmedBySeller`) and the buyer (`confirmedByBuyer`) must confirm handover before the sale is finalized as `completed`.
- **Failed Pickup:** If either party fails to show up on campus, either participant or an admin can record a `failed_pickup` outcome.
- **Audit History:** Every transition records an immutable audit log entry with timestamp and actor ID.

---

## 7. API Endpoints Reference

### Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Register a new student account |
| POST | `/api/auth/login` | None | Login with email and password |
| GET | `/api/auth/me` | Bearer Token | Get current authenticated user profile |

### Listings (`/api/listings`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/listings` | Bearer Token | Create a new auction listing |
| GET | `/api/listings` | Optional | Browse & filter listings (search, category, price, closingSoon, pagination) |
| GET | `/api/listings/:id` | None | Get listing details and public bid history |
| PATCH | `/api/listings/:id` | Bearer Token (Owner) | Edit non-critical fields (or terms before bids start) |
| DELETE | `/api/listings/:id` | Bearer Token (Owner) | Cancel listing without deleting bid history |

### Bids (`/api/listings/:id/bids`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/listings/:id/bids` | Bearer Token | Place a bid on an open auction |
| GET | `/api/listings/:id/bids` | None | View all accepted bids (bidder name & amount; credentials hidden) |

### Auction Management (`/api/auctions`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auctions/close-expired` | Admin Token | Administrative sweep closing all expired auctions |
| POST | `/api/auctions/:id/close` | Owner or Admin | Idempotently close a single expired auction |

### Sale Outcomes & Handover (`/api/sales`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/sales/:listingId` | Bearer Token | Retrieve sale outcome record & audit log |
| POST | `/api/sales/:listingId/approve` | Bearer Token (Seller) | Seller approves winning bid (reserves item) |
| POST | `/api/sales/:listingId/reject` | Bearer Token (Seller) | Seller rejects winning bid |
| POST | `/api/sales/:listingId/confirm-handover`| Bearer Token (Seller/Buyer)| Confirm physical item handover on campus |
| POST | `/api/sales/:listingId/failed-pickup` | Bearer Token (Seller/Buyer)| Record failed campus meetup / no-show |
| POST | `/api/sales/:listingId/cancel` | Bearer Token (Seller) | Seller cancellation prior to completion |

### Health Check
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Returns service status and MongoDB connection state |

