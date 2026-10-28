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
import { SaleOutcome } from '../src/models/SaleOutcome.js';

describe('Auction Closure, Sale Decisions & Handover Tests', () => {
  let app;
  let seller;
  let buyer;
  let thirdParty;
  let admin;

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
    buyer = await createTestUser({
      name: 'Buyer Bob',
      email: 'bob@campus.edu'
    });
    thirdParty = await createTestUser({
      name: 'Intruder Eve',
      email: 'eve@campus.edu'
    });
    admin = await createTestUser({
      name: 'Campus Admin',
      email: 'admin@campus.edu',
      role: 'admin'
    });
  });

  it('Auction closure with NO bids should mark listing unsold and outcome unsold', async () => {
    const expiredListing = await Listing.create({
      seller: seller.user._id,
      title: 'Obsolete Textbook',
      category: 'books',
      description: 'Very old book with no interest.',
      condition: 'poor',
      photos: ['https://example.com/oldbook.jpg'],
      startingPrice: 100,
      minimumBidIncrement: 10,
      currentPrice: 100,
      startTime: new Date(Date.now() - 3600 * 1000),
      closingTime: new Date(Date.now() - 1000), // Expired
      status: 'active'
    });

    const res = await request(app)
      .post(`/api/auctions/${expiredListing._id}/close`)
      .set(authHeader(seller.token));

    assert.equal(res.status, 200);
    assert.equal(res.body.listing.status, 'unsold');
    assert.equal(res.body.outcome.outcome, 'unsold');
    assert.equal(res.body.outcome.provisionalWinner, null);
  });

  it('Auction closure with valid bids should identify highest bid and mark awaiting_seller_decision', async () => {
    const expiredListing = await Listing.create({
      seller: seller.user._id,
      title: 'Scientific Calculator',
      category: 'calculator',
      description: 'Pre-owned calculator.',
      condition: 'good',
      photos: ['https://example.com/calc.jpg'],
      startingPrice: 400,
      minimumBidIncrement: 50,
      currentPrice: 500,
      startTime: new Date(Date.now() - 3600 * 1000),
      closingTime: new Date(Date.now() - 1000), // Expired
      status: 'active'
    });

    const bid1 = await Bid.create({
      listing: expiredListing._id,
      bidder: thirdParty.user._id,
      amount: 400,
      createdAt: new Date(Date.now() - 2000)
    });
    const bid2 = await Bid.create({
      listing: expiredListing._id,
      bidder: buyer.user._id,
      amount: 500,
      createdAt: new Date(Date.now() - 1500)
    });

    const res = await request(app)
      .post(`/api/auctions/${expiredListing._id}/close`)
      .set(authHeader(admin.token));

    assert.equal(res.status, 200);
    assert.equal(res.body.listing.status, 'awaiting_seller_decision');
    assert.equal(res.body.outcome.outcome, 'pending');
    assert.equal(res.body.outcome.provisionalWinner.toString(), buyer.user._id.toString());
    assert.equal(res.body.outcome.winningBid.toString(), bid2._id.toString());
  });

  it('Duplicate auction closure should be idempotent and not create duplicate outcome records', async () => {
    const expiredListing = await Listing.create({
      seller: seller.user._id,
      title: 'Desk Lamp',
      category: 'other',
      description: 'Study desk lamp.',
      condition: 'good',
      photos: ['https://example.com/lamp.jpg'],
      startingPrice: 200,
      minimumBidIncrement: 20,
      currentPrice: 200,
      startTime: new Date(Date.now() - 3600 * 1000),
      closingTime: new Date(Date.now() - 1000),
      status: 'active'
    });

    // First closure
    const res1 = await request(app)
      .post(`/api/auctions/${expiredListing._id}/close`)
      .set(authHeader(seller.token));
    assert.equal(res1.status, 200);
    assert.equal(res1.body.alreadyClosed, false);

    // Second closure attempt
    const res2 = await request(app)
      .post(`/api/auctions/${expiredListing._id}/close`)
      .set(authHeader(seller.token));
    assert.equal(res2.status, 200);
    assert.equal(res2.body.alreadyClosed, true);

    // Verify exactly 1 SaleOutcome record exists
    const outcomeCount = await SaleOutcome.countDocuments({ listing: expiredListing._id });
    assert.equal(outcomeCount, 1);
  });

  it('Seller decision: rejection records rejection and does NOT complete sale', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Graphic Tablet',
      category: 'electronics',
      description: 'Stylus tablet for drawing.',
      condition: 'like-new',
      photos: ['https://example.com/tablet.jpg'],
      startingPrice: 1500,
      minimumBidIncrement: 100,
      currentPrice: 1500,
      closingTime: new Date(Date.now() - 1000),
      status: 'awaiting_seller_decision'
    });

    const bid = await Bid.create({
      listing: listing._id,
      bidder: buyer.user._id,
      amount: 1500
    });

    await SaleOutcome.create({
      listing: listing._id,
      seller: seller.user._id,
      provisionalWinner: buyer.user._id,
      winningBid: bid._id,
      sellerDecision: 'pending',
      outcome: 'pending'
    });

    // Seller rejects
    const res = await request(app)
      .post(`/api/sales/${listing._id}/reject`)
      .set(authHeader(seller.token))
      .send({ reason: 'Reserve expectation was not met' });

    assert.equal(res.status, 200);
    assert.equal(res.body.outcome.sellerDecision, 'rejected');
    assert.equal(res.body.outcome.outcome, 'rejected');

    const updatedListing = await Listing.findById(listing._id);
    assert.equal(updatedListing.status, 'rejected');
  });

  it('Unauthorized sale decisions should be rejected with 403 Forbidden', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Gym Dumbbells',
      category: 'other',
      description: 'Set of 5kg vinyl dumbbells.',
      condition: 'good',
      photos: ['https://example.com/weights.jpg'],
      startingPrice: 500,
      minimumBidIncrement: 50,
      currentPrice: 550,
      closingTime: new Date(Date.now() - 1000),
      status: 'awaiting_seller_decision'
    });

    const bid = await Bid.create({
      listing: listing._id,
      bidder: buyer.user._id,
      amount: 550
    });

    await SaleOutcome.create({
      listing: listing._id,
      seller: seller.user._id,
      provisionalWinner: buyer.user._id,
      winningBid: bid._id,
      sellerDecision: 'pending',
      outcome: 'pending'
    });

    // Eve (unauthorized third party) attempts to approve
    const res = await request(app)
      .post(`/api/sales/${listing._id}/approve`)
      .set(authHeader(thirdParty.token));

    assert.equal(res.status, 403);
    assert.match(res.body.message, /Only the seller can approve/);
  });

  it('Campus handover flow: requires both seller and buyer confirmation before marking completed', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Guitar with Bag',
      category: 'other',
      description: 'Acoustic guitar.',
      condition: 'good',
      photos: ['https://example.com/guitar.jpg'],
      startingPrice: 2000,
      minimumBidIncrement: 100,
      currentPrice: 2200,
      closingTime: new Date(Date.now() - 1000),
      status: 'awaiting_seller_decision'
    });

    const bid = await Bid.create({
      listing: listing._id,
      bidder: buyer.user._id,
      amount: 2200
    });

    await SaleOutcome.create({
      listing: listing._id,
      seller: seller.user._id,
      provisionalWinner: buyer.user._id,
      winningBid: bid._id,
      sellerDecision: 'pending',
      outcome: 'pending'
    });

    // 1. Seller approves -> status becomes reserved
    const approveRes = await request(app)
      .post(`/api/sales/${listing._id}/approve`)
      .set(authHeader(seller.token));
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.outcome.outcome, 'reserved');

    // 2. Seller confirms handover
    const sellerConfRes = await request(app)
      .post(`/api/sales/${listing._id}/confirm-handover`)
      .set(authHeader(seller.token))
      .send({ location: 'Campus Library Entrance', notes: 'Given with bag' });

    assert.equal(sellerConfRes.status, 200);
    assert.equal(sellerConfRes.body.isComplete, false);
    assert.equal(sellerConfRes.body.outcome.outcome, 'reserved');

    // 3. Buyer confirms handover -> status becomes completed
    const buyerConfRes = await request(app)
      .post(`/api/sales/${listing._id}/confirm-handover`)
      .set(authHeader(buyer.token))
      .send({ location: 'Campus Library Entrance', notes: 'Item received in good condition' });

    assert.equal(buyerConfRes.status, 200);
    assert.equal(buyerConfRes.body.isComplete, true);
    assert.equal(buyerConfRes.body.outcome.outcome, 'completed');

    const completedListing = await Listing.findById(listing._id);
    assert.equal(completedListing.status, 'completed');
  });

  it('Failed pickup flow: transitions reserved item to failed_pickup', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Mini Refrigerator',
      category: 'electronics',
      description: 'Hostel bar fridge.',
      condition: 'good',
      photos: ['https://example.com/fridge.jpg'],
      startingPrice: 3000,
      minimumBidIncrement: 200,
      currentPrice: 3200,
      closingTime: new Date(Date.now() - 1000),
      status: 'reserved'
    });

    const bid = await Bid.create({
      listing: listing._id,
      bidder: buyer.user._id,
      amount: 3200
    });

    await SaleOutcome.create({
      listing: listing._id,
      seller: seller.user._id,
      provisionalWinner: buyer.user._id,
      winningBid: bid._id,
      sellerDecision: 'approved',
      outcome: 'reserved'
    });

    // Seller reports buyer failed to show up
    const res = await request(app)
      .post(`/api/sales/${listing._id}/failed-pickup`)
      .set(authHeader(seller.token))
      .send({ reason: 'Buyer did not show up at hostel gate after 48 hours' });

    assert.equal(res.status, 200);
    assert.equal(res.body.outcome.outcome, 'failed_pickup');
    assert.match(res.body.outcome.failureOrCancellationReason, /Buyer did not show up/);

    const updatedListing = await Listing.findById(listing._id);
    assert.equal(updatedListing.status, 'failed_pickup');
  });

  it('Invalid state transitions: cannot approve an already rejected or completed sale', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Sold Out Headphone',
      category: 'electronics',
      description: 'Noise cancelling headphones.',
      condition: 'good',
      photos: ['https://example.com/hp.jpg'],
      startingPrice: 1000,
      minimumBidIncrement: 100,
      currentPrice: 1200,
      closingTime: new Date(Date.now() - 1000),
      status: 'completed'
    });

    await SaleOutcome.create({
      listing: listing._id,
      seller: seller.user._id,
      provisionalWinner: buyer.user._id,
      sellerDecision: 'approved',
      outcome: 'completed'
    });

    // Attempting to approve an already completed sale
    const approveRes = await request(app)
      .post(`/api/sales/${listing._id}/approve`)
      .set(authHeader(seller.token));

    assert.equal(approveRes.status, 400);

    // Attempting to cancel an already completed sale
    const cancelRes = await request(app)
      .post(`/api/sales/${listing._id}/cancel`)
      .set(authHeader(seller.token));

    assert.equal(cancelRes.status, 400);
  });
});

