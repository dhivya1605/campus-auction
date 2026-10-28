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

describe('Listing API & Business Rules Tests', () => {
  let app;
  let seller;
  let otherUser;

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
    otherUser = await createTestUser({
      name: 'Bob Buyer',
      email: 'bob@campus.edu'
    });
  });

  it('POST /api/listings should create a valid listing for authenticated seller', async () => {
    const payload = {
      title: 'Hercules Mountain Cycle',
      category: 'cycle',
      description: 'Used for 1 semester only, good condition with dual gear.',
      condition: 'good',
      photos: ['https://example.com/photos/cycle1.jpg'],
      startingPrice: 1500,
      minimumBidIncrement: 100,
      closingTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    };

    const res = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .send(payload);

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.listing.title, 'Hercules Mountain Cycle');
    assert.equal(res.body.listing.currentPrice, 1500);
    assert.equal(res.body.listing.status, 'active');
  });

  it('POST /api/listings should reject invalid price, increment, or closing times', async () => {
    // Negative starting price
    const res1 = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .send({
        title: 'Casio fx-991EX',
        category: 'calculator',
        description: 'Scientific calculator in good condition.',
        condition: 'like-new',
        photos: ['https://example.com/photos/calc.jpg'],
        startingPrice: -100,
        minimumBidIncrement: 50,
        closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    assert.equal(res1.status, 400);

    // Closing time in the past
    const res2 = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .send({
        title: 'Casio fx-991EX',
        category: 'calculator',
        description: 'Scientific calculator in good condition.',
        condition: 'like-new',
        photos: ['https://example.com/photos/calc.jpg'],
        startingPrice: 500,
        minimumBidIncrement: 0, // Invalid: must be >= 1
        closingTime: new Date(Date.now() - 1000).toISOString()
      });
    assert.equal(res2.status, 400);
  });

  it('GET /api/listings should support filtering by category, search, and pagination', async () => {
    // Seed 2 listings
    await Listing.create({
      seller: seller.user._id,
      title: 'Engineering Mathematics Higher Text',
      category: 'books',
      description: 'Standard textbook for second year.',
      condition: 'good',
      photos: ['https://example.com/book.jpg'],
      startingPrice: 300,
      minimumBidIncrement: 20,
      currentPrice: 300,
      startTime: new Date(Date.now() - 1000),
      closingTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: 'active'
    });

    await Listing.create({
      seller: seller.user._id,
      title: 'Hero Sprint Pro Cycle',
      category: 'cycle',
      description: 'Single speed cycle, good brakes.',
      condition: 'fair',
      photos: ['https://example.com/cycle.jpg'],
      startingPrice: 2000,
      minimumBidIncrement: 100,
      currentPrice: 2000,
      startTime: new Date(Date.now() - 1000),
      closingTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: 'active'
    });

    // Filter by category
    const resCategory = await request(app).get('/api/listings?category=books');
    assert.equal(resCategory.status, 200);
    assert.equal(resCategory.body.listings.length, 1);
    assert.equal(resCategory.body.listings[0].category, 'books');

    // Filter by search keyword
    const resSearch = await request(app).get('/api/listings?search=Hero');
    assert.equal(resSearch.status, 200);
    assert.equal(resSearch.body.listings.length, 1);
    assert.equal(resSearch.body.listings[0].title, 'Hero Sprint Pro Cycle');
  });

  it('PATCH /api/listings/:id should reject unauthorized user modification', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Original Title',
      category: 'other',
      description: 'Original description here.',
      condition: 'fair',
      photos: ['https://example.com/item.jpg'],
      startingPrice: 100,
      minimumBidIncrement: 10,
      currentPrice: 100,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    // Attempt edit by other user (Bob)
    const res = await request(app)
      .patch(`/api/listings/${listing._id}`)
      .set(authHeader(otherUser.token))
      .send({ title: 'Hacked Title' });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  it('PATCH /api/listings/:id should prevent modifying starting price after bidding starts', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Arduino Starter Kit',
      category: 'electronics',
      description: 'Complete kit with sensors and microcontrollers.',
      condition: 'like-new',
      photos: ['https://example.com/arduino.jpg'],
      startingPrice: 800,
      minimumBidIncrement: 50,
      currentPrice: 850,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    // Create an accepted bid
    const bid = await Bid.create({
      listing: listing._id,
      bidder: otherUser.user._id,
      amount: 850
    });
    listing.leadingBid = bid._id;
    await listing.save();

    // Owner tries to edit starting price after bid placed
    const res = await request(app)
      .patch(`/api/listings/${listing._id}`)
      .set(authHeader(seller.token))
      .send({ startingPrice: 1200 });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Cannot modify starting price/);
  });

  it('DELETE /api/listings/:id should cancel eligible listing without deleting bid history', async () => {
    const listing = await Listing.create({
      seller: seller.user._id,
      title: 'Drafting Board',
      category: 'other',
      description: 'Engineering drawing board A2 size.',
      condition: 'good',
      photos: ['https://example.com/board.jpg'],
      startingPrice: 400,
      minimumBidIncrement: 50,
      currentPrice: 450,
      closingTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active'
    });

    const bid = await Bid.create({
      listing: listing._id,
      bidder: otherUser.user._id,
      amount: 450
    });
    listing.leadingBid = bid._id;
    await listing.save();

    // Cancel listing
    const res = await request(app)
      .delete(`/api/listings/${listing._id}`)
      .set(authHeader(seller.token));

    assert.equal(res.status, 200);
    assert.equal(res.body.listing.status, 'cancelled');

    // Verify bid still exists in database
    const preservedBid = await Bid.findById(bid._id);
    assert.ok(preservedBid);
    assert.equal(preservedBid.amount, 450);
  });
});

