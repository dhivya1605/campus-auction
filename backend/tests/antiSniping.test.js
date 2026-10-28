import { test, describe, before, after, beforeEach } from 'node:test';
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
import { closeAuction } from '../src/services/auctionService.js';

describe('Anti-Sniping Auction Extension Tests', () => {
  let app;

  before(async () => {
    const env = await setupTestEnvironment();
    app = env.app;
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  test('Scenario 1: A valid bid with more than 30 seconds remaining does NOT extend the auction', async () => {
    const { user: seller } = await createTestUser({ email: 'seller1@campus.edu' });
    const { token: bidderToken } = await createTestUser({ email: 'bidder1@campus.edu' });

    const now = new Date();
    // 45 seconds remaining (> 30s)
    const initialClosing = new Date(now.getTime() + 45 * 1000);
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Graphing Calculator',
      category: 'calculator',
      condition: 'good',
      description: 'TI-84 calculator in working order',
      startingPrice: 500,
      minimumBidIncrement: 50,
      currentPrice: 500,
      startTime: new Date(now.getTime() - 60000),
      closingTime: initialClosing,
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidderToken))
      .send({ amount: 500 });

    assert.equal(res.status, 201);
    assert.equal(res.body.extended, false);

    const updated = await Listing.findById(listing._id);
    assert.equal(
      new Date(updated.closingTime).getTime(),
      initialClosing.getTime(),
      'Closing time should not change when > 30s remaining'
    );
  });

  test('Scenario 2: A valid bid with exactly 30 seconds remaining extends the auction to 60s from bid', async () => {
    const { user: seller } = await createTestUser({ email: 'seller2@campus.edu' });
    const { token: bidderToken } = await createTestUser({ email: 'bidder2@campus.edu' });

    const now = new Date();
    // Exactly 30 seconds remaining
    const initialClosing = new Date(now.getTime() + 30 * 1000);
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Lab Coat Chemistry',
      category: 'other',
      condition: 'new',
      description: 'Brand new size L white lab coat',
      startingPrice: 300,
      minimumBidIncrement: 30,
      currentPrice: 300,
      startTime: new Date(now.getTime() - 60000),
      closingTime: initialClosing,
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidderToken))
      .send({ amount: 300 });

    assert.equal(res.status, 201);
    assert.equal(res.body.extended, true);

    const updated = await Listing.findById(listing._id);
    const remainingAfterBid = new Date(updated.closingTime).getTime() - Date.now();
    assert.ok(remainingAfterBid >= 58 * 1000 && remainingAfterBid <= 61 * 1000);
  });

  test('Scenario 3: A valid bid with 15 seconds remaining extends the deadline to 60s after bid', async () => {
    const { user: seller } = await createTestUser({ email: 'seller3@campus.edu' });
    const { token: bidderToken } = await createTestUser({ email: 'bidder3@campus.edu' });

    const now = new Date();
    // 15 seconds remaining
    const initialClosing = new Date(now.getTime() + 15 * 1000);
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Physics Mechanics Book',
      category: 'books',
      condition: 'good',
      description: 'Halliday Resnick physics book',
      startingPrice: 200,
      minimumBidIncrement: 20,
      currentPrice: 200,
      startTime: new Date(now.getTime() - 60000),
      closingTime: initialClosing,
      status: 'active'
    });

    const bidTime = Date.now();
    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidderToken))
      .send({ amount: 200 });

    assert.equal(res.status, 201);
    assert.equal(res.body.extended, true);

    const updated = await Listing.findById(listing._id);
    const expectedDeadline = bidTime + 60 * 1000;
    const actualDeadline = new Date(updated.closingTime).getTime();
    // Within 2000ms variance of server execution
    assert.ok(Math.abs(actualDeadline - expectedDeadline) < 2000);
  });

  test('Scenario 4: A valid bid with 1 second remaining extends the deadline', async () => {
    const { user: seller } = await createTestUser({ email: 'seller4@campus.edu' });
    const { token: bidderToken } = await createTestUser({ email: 'bidder4@campus.edu' });

    const now = new Date();
    // 1.5 seconds remaining
    const initialClosing = new Date(now.getTime() + 1500);
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Dorm Desk Lamp',
      category: 'electronics',
      condition: 'good',
      description: 'Adjustable study LED lamp',
      startingPrice: 150,
      minimumBidIncrement: 15,
      currentPrice: 150,
      startTime: new Date(now.getTime() - 60000),
      closingTime: initialClosing,
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidderToken))
      .send({ amount: 150 });

    assert.equal(res.status, 201);
    assert.equal(res.body.extended, true);

    const updated = await Listing.findById(listing._id);
    const remaining = new Date(updated.closingTime).getTime() - Date.now();
    assert.ok(remaining > 50 * 1000, 'Deadline should be extended by ~60 seconds');
  });

  test('Scenario 5: An invalid bid in the final 30 seconds does NOT extend the deadline', async () => {
    const { user: seller } = await createTestUser({ email: 'seller5@campus.edu' });
    const { token: bidderToken } = await createTestUser({ email: 'bidder5@campus.edu' });

    const now = new Date();
    const initialClosing = new Date(now.getTime() + 15 * 1000);
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Campus Cycle Gear',
      category: 'cycle',
      condition: 'good',
      description: 'Cycle helmet and chain lock',
      startingPrice: 400,
      minimumBidIncrement: 40,
      currentPrice: 400,
      startTime: new Date(now.getTime() - 60000),
      closingTime: initialClosing,
      status: 'active'
    });

    // Invalid bid: amount below starting price
    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidderToken))
      .send({ amount: 200 });

    assert.equal(res.status, 400);

    const updated = await Listing.findById(listing._id);
    assert.equal(
      new Date(updated.closingTime).getTime(),
      initialClosing.getTime(),
      'Closing time must remain unchanged after rejected bid'
    );
  });

  test('Scenario 6: A bid submitted after the deadline is rejected', async () => {
    const { user: seller } = await createTestUser({ email: 'seller6@campus.edu' });
    const { token: bidderToken } = await createTestUser({ email: 'bidder6@campus.edu' });

    const now = new Date();
    // Closed 5 seconds ago
    const expiredClosing = new Date(now.getTime() - 5000);
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Old Textbooks',
      category: 'books',
      condition: 'fair',
      description: 'Calculus textbook semester 1',
      startingPrice: 100,
      minimumBidIncrement: 10,
      currentPrice: 100,
      startTime: new Date(now.getTime() - 60000),
      closingTime: expiredClosing,
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidderToken))
      .send({ amount: 150 });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Bidding has ended/);
  });

  test('Scenario 7: Chained extensions — A second late bid extends the updated deadline again', async () => {
    const { user: seller } = await createTestUser({ email: 'seller7@campus.edu' });
    const { token: bidder1Token } = await createTestUser({ email: 'bidder7a@campus.edu' });
    const { token: bidder2Token } = await createTestUser({ email: 'bidder7b@campus.edu' });

    const now = new Date();
    // 20s remaining
    const initialClosing = new Date(now.getTime() + 20 * 1000);
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Sports Bicycle Hero Sprint',
      category: 'cycle',
      condition: 'like-new',
      description: 'Single speed campus cycle in great shape',
      startingPrice: 1000,
      minimumBidIncrement: 100,
      currentPrice: 1000,
      startTime: new Date(now.getTime() - 60000),
      closingTime: initialClosing,
      status: 'active'
    });

    // Bid 1 extends deadline to ~60s
    const res1 = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder1Token))
      .send({ amount: 1000 });
    assert.equal(res1.status, 201);
    assert.equal(res1.body.extended, true);
    const deadline1 = new Date(res1.body.closingTime).getTime();

    // Fast-forward or simulate Bid 2 arriving within 30s of deadline1
    // We update closingTime to now + 25s to simulate 25s remaining on the extended auction
    await Listing.findByIdAndUpdate(listing._id, {
      closingTime: new Date(Date.now() + 25 * 1000)
    });

    // Bid 2 placed with 25s remaining on the extended auction
    const res2 = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidder2Token))
      .send({ amount: 1100 });

    assert.equal(res2.status, 201);
    assert.equal(res2.body.extended, true);

    const deadline2 = new Date(res2.body.closingTime).getTime();
    const remainingAfterBid2 = deadline2 - Date.now();
    assert.ok(remainingAfterBid2 >= 58 * 1000 && remainingAfterBid2 <= 61 * 1000);

    // Audit trail has recorded both extensions
    const updated = await Listing.findById(listing._id);
    const extensions = updated.editHistory.filter((e) =>
      e.reason.includes('Anti-sniping extension')
    );
    assert.equal(extensions.length, 2, 'Both extensions should be logged in editHistory');
  });

  test('Scenario 8: Cancelled auctions cannot be extended by bidding', async () => {
    const { user: seller } = await createTestUser({ email: 'seller8@campus.edu' });
    const { token: bidderToken } = await createTestUser({ email: 'bidder8@campus.edu' });

    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Cancelled Bicycle',
      category: 'cycle',
      condition: 'good',
      description: 'Cycle cancelled by seller',
      startingPrice: 500,
      minimumBidIncrement: 50,
      currentPrice: 500,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 15 * 1000), // within 30s
      status: 'cancelled'
    });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidderToken))
      .send({ amount: 500 });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /cancelled/i);
  });

  test('Scenario 9: Auction closing process respects the latest extended deadline', async () => {
    const { user: seller } = await createTestUser({ email: 'seller9@campus.edu' });
    const { token: bidderToken } = await createTestUser({ email: 'bidder9@campus.edu' });

    const now = new Date();
    // 10s remaining
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Lab Balance Scale',
      category: 'other',
      condition: 'good',
      description: 'Precision scale for chemistry lab',
      startingPrice: 300,
      minimumBidIncrement: 30,
      currentPrice: 300,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 10 * 1000),
      status: 'active'
    });

    // Bid placed in final 10s -> extends by 60s
    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(bidderToken))
      .send({ amount: 300 });

    assert.equal(res.status, 201);
    assert.equal(res.body.extended, true);

    // Attempting to close the auction immediately must FAIL with 400 Bad Request
    await assert.rejects(
      async () => {
        await closeAuction(listing._id);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /cannot be closed before its closing time has passed/i);
        return true;
      }
    );

    // Verify auction status is still 'active'
    const afterAttempt = await Listing.findById(listing._id);
    assert.equal(afterAttempt.status, 'active');
  });
});

