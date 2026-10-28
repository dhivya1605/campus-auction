import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearDatabase,
  createTestUser,
  authHeader
} from './testHelper.js';
import { Listing } from '../src/models/Listing.js';
import { Bid } from '../src/models/Bid.js';

describe('Bidding API & Concurrency Rules Tests', () => {
  let app;
  let seller;
  let bidder1;
  let bidder2;

  before(async () => {
    const env = await setupTestEnvironment();
    app = env.app;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearDatabase();
    seller = await createTestUser({
      name: 'Seller Alice',
      email: 'alice@campus.edu'
    });
    bidder1 = await createTestUser({
      name: 'Bidder Charlie',
      email: 'charlie@campus.edu'
    });
    bidder2 = await createTestUser({
      name: 'Bidder Diana',
      email: 'diana@campus.edu'
    });
  });

  it('POST /api/listings/:id/bids should reject seller self-bidding with 403 Forbidden', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Lab Coat Size M',
      category: 'other',
      description: 'Chemistry lab coat, clean condition.',
      condition: 'good',
      photos: ['https://example.com/coat.jpg'],
      startingPrice: 300,
      minimumBidIncrement: 20,
      currentPrice: 300,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(seller.token))
      .send({ amount: 350 });

    assert.equal(res.status, 403);
    assert.match(res.body.message, /Sellers are not permitted to bid on their own listings/);
  });

  it('POST /api/listings/:id/bids should reject first bid below starting price', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Casio Scientific Calculator',
      category: 'calculator',
      description: 'Used in physics exam.',
      condition: 'like-new',
      photos: ['https://example.com/calc.jpg'],
      startingPrice: 500,
      minimumBidIncrement: 50,
      currentPrice: 500,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder1.token))
      .send({ amount: 450 }); // Below starting price 500

    assert.equal(res.status, 400);
    assert.match(res.body.message, /First bid must be at least the starting price/);
  });

  it('POST /api/listings/:id/bids should accept first bid at or above starting price', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Casio Scientific Calculator',
      category: 'calculator',
      description: 'Used in physics exam.',
      condition: 'like-new',
      photos: ['https://example.com/calc.jpg'],
      startingPrice: 500,
      minimumBidIncrement: 50,
      currentPrice: 500,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder1.token))
      .send({ amount: 500 });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.currentPrice, 500);
    assert.equal(res.body.bid.amount, 500);

    const updatedListing = await Listing.findById(listing._id);
    assert.equal(updatedListing.currentPrice, 500);
    assert.ok(updatedListing.leadingBid);
  });

  it('POST /api/listings/:id/bids should reject subsequent bid below the required minimum increment', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Cycle Pump and Lock',
      category: 'cycle',
      description: 'Sturdy bicycle pump with combination lock.',
      condition: 'good',
      photos: ['https://example.com/pump.jpg'],
      startingPrice: 400,
      minimumBidIncrement: 50,
      currentPrice: 400,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    // Bidder 1 places first bid of 400
    await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder1.token))
      .send({ amount: 400 });

    // Bidder 2 attempts bid of 420 (current 400 + min increment 50 = required 450)
    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder2.token))
      .send({ amount: 420 });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Minimum required bid is ₹450/);

    // Bidder 2 attempts valid bid of 450
    const validRes = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder2.token))
      .send({ amount: 450 });

    assert.equal(validRes.status, 201);
    assert.equal(validRes.body.currentPrice, 450);
  });

  it('POST /api/listings/:id/bids should reject bids after closing time', async () => {
    const pastListing = await Listing.create({
      seller: seller.user._id,
      title: 'Expired Textbook',
      category: 'books',
      description: 'Auction that already ended.',
      condition: 'fair',
      photos: ['https://example.com/book.jpg'],
      startingPrice: 200,
      minimumBidIncrement: 20,
      currentPrice: 200,
      startTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
      closingTime: new Date(Date.now() - 60 * 1000), // Closed 1 minute ago
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/listings/${pastListing._id}/bids`)
      .set(authHeader(bidder1.token))
      .send({ amount: 200 });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Bidding has ended/);
  });

  it('GET /api/listings/:id/bids should return complete public bid history without private credentials', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Mechanical Keyboard',
      category: 'electronics',
      description: 'Blue switches, compact layout.',
      condition: 'good',
      photos: ['https://example.com/kbd.jpg'],
      startingPrice: 1000,
      minimumBidIncrement: 100,
      currentPrice: 1000,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    // Place 2 bids
    await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder1.token))
      .send({ amount: 1000 });

    await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder2.token))
      .send({ amount: 1100 });

    const res = await request(app).get(`/api/listings/${listing._id}/bids`);

    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.equal(res.body.bids[0].amount, 1100);
    assert.equal(res.body.bids[0].bidder.name, 'Bidder Diana');
    assert.equal(res.body.bids[0].bidder.email, undefined); // Never expose email
    assert.equal(res.body.bids[0].bidder.passwordHash, undefined); // Never expose password
  });

  it('POST /api/listings/:id/bids should handle competing concurrent bids safely', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Gaming Mouse',
      category: 'electronics',
      description: 'Wireless ergonomic mouse.',
      condition: 'like-new',
      photos: ['https://example.com/mouse.jpg'],
      startingPrice: 600,
      minimumBidIncrement: 50,
      currentPrice: 600,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    // Initial valid bid
    await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder1.token))
      .send({ amount: 600 });

    // Now currentPrice is 600, min next bid is 650.
    // Simulate simultaneous bids trying to bid 650 at the exact same moment
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/listings/${listing._id}/bids`)
        .set(authHeader(bidder1.token))
        .send({ amount: 650 }),
      request(app)
        .post(`/api/listings/${listing._id}/bids`)
        .set(authHeader(bidder2.token))
        .send({ amount: 650 })
    ]);

    // One must succeed (201) and one must be rejected (400 or 409 conflict)
    const statuses = [resA.status, resB.status];
    assert.ok(statuses.includes(201), 'One concurrent bid must succeed');
    assert.ok(
      statuses.includes(400) || statuses.includes(409),
      'The competing duplicate bid must be safely rejected'
    );

    // Verify final state consistency
    const bids = await Bid.find({ listing: listing._id });
    // Total bids should be exactly 2 (initial 600 + exactly one 650)
    assert.equal(bids.length, 2);
    const updatedListing = await Listing.findById(listing._id);
    assert.equal(updatedListing.currentPrice, 650);
  });
});

