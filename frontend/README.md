# Campus Auction Marketplace — React Frontend

A clean, responsive, and modern React frontend built strictly using **React, JavaScript, and Plain CSS** (no Vite, no CSS frameworks) for the college campus second-hand auction marketplace.

---

## 1. Technology Stack

- **Library:** React (v18)
- **Routing:** React Router DOM (v6)
- **Styling:** Pure Plain CSS (custom design system with variables, cards, badges, responsive grids, and accessible form controls)
- **Build & Dev Tool:** Webpack 5 + Babel + Webpack Dev Server (Pure standard React toolchain without Vite)
- **API Client:** Fetch API with universal error handling, JSON normalization, and JWT bearer token injection

---

## 2. Project Structure

```
frontend/
├── public/
│   └── index.html               # HTML5 template with Inter font
├── src/
│   ├── api/
│   │   ├── apiClient.js         # Fetch client with auto-auth & error extraction
│   │   ├── authApi.js           # Register, login, me
│   │   ├── listingApi.js        # Listings browse, get, create, edit, cancel
│   │   ├── bidApi.js            # Bidding & public bid history
│   │   └── saleApi.js           # Seller decisions & campus handover confirmation
│   ├── components/
│   │   ├── Navbar.jsx           # Responsive campus navigation & session controls
│   │   ├── ListingCard.jsx      # Card with photo, badges, price, and live timer
│   │   ├── SearchFilters.jsx    # Keyword search, category, condition, price filters
│   │   ├── CountdownTimer.jsx   # Live countdown pill with urgent indicator
│   │   ├── BidHistory.jsx       # Public bid history table
│   │   ├── Loading.jsx          # Accessible spinner state
│   │   └── ErrorMessage.jsx     # Error banner with retry option
│   ├── context/
│   │   └── AuthContext.jsx      # Global user session & token management
│   ├── pages/
│   │   ├── Marketplace.jsx      # Home browsing page with real-time filters
│   │   ├── ListingDetails.jsx   # Full auction view, gallery, and live bidding box
│   │   ├── CreateListing.jsx    # Form to list second-hand items
│   │   ├── Login.jsx            # Student sign-in
│   │   ├── Register.jsx         # New student registration
│   │   ├── MyListings.jsx       # Seller dashboard (approvals, handover, cancellations)
│   │   └── NotFound.jsx         # 404 page
│   ├── routes/
│   │   └── ProtectedRoute.jsx   # Auth guard for sell and dashboard pages
│   ├── styles/
│   │   ├── global.css           # Color variables, typography, buttons, forms
│   │   └── components.css       # Cards, grid, badges, alerts, timers
│   ├── App.jsx                  # Main route mapping & layout
│   └── main.jsx                 # Application entry point
├── .env.example
├── .gitignore
├── package.json
├── webpack.config.js
└── README.md
```

---

## 3. Environment Configuration

The frontend connects to the backend on port 5000 via `.env`:

```env
REACT_APP_API_URL=http://localhost:5000/api
```

---

## 4. Setup & Running Instructions

### 1. Install dependencies
```bash
cd frontend
npm install
```

### 2. Start development server
```bash
npm start
```
The application will launch at: **http://localhost:3000**

### 3. Production build
```bash
npm run build
```
Creates an optimized static bundle in `frontend/dist/`.

---

## 5. Completed Pages & Features

1. **Marketplace (`/`):**
   - Live listing cards with real prices and countdowns.
   - Filter by search query, category (cycle, calculator, books, electronics, other), condition (new, like-new, good, fair, poor), and closing-soonest.
   - Dynamic empty and loading states.
2. **Listing Details (`/listings/:id`):**
   - Image gallery and full description.
   - Live remaining time counter.
   - Price summary (Starting Price, Minimum Increment, Minimum Required Next Bid).
   - Public Bid History with anonymized bidder names and timestamps.
   - Live bidding input for authenticated buyers.
   - Rule enforcement: sellers cannot bid on their own items; bids below the minimum increment are rejected with helpful server messages.
3. **Create Listing (`/create-listing`):**
   - Validated form with photo URLs, rupee integer prices, positive increments, and closing datetime picker.
4. **Authentication (`/login`, `/register`):**
   - Token-based JWT session with automatic user profile retrieval on page refresh.
5. **Seller Dashboard (`/my-listings`):**
   - Shows listings owned by the logged-in student.
   - Post-auction decision actions: **Approve Winning Bid** (reserves item) or **Reject Winning Bid**.
   - Two-party campus handover flow: **Confirm Campus Handover** (requires seller and buyer confirmation) and **Report Failed Pickup**.
   - Auction cancellation with bid history preservation.

