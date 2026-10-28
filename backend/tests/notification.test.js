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
import { Notification, NOTIFICATION_EVENTS } from '../src/models/Notification.js';

describe('Notification System Tests', () => {
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

  test('Placing a bid triggers bidder confirmation, seller notification, and outbid notification', async () => {
    // Setup: Seller, Bidder 1, Bidder 2
    const { user: seller } = await createTestUser({
      name: 'Seller Sam',
      email: 'seller@campus.edu'
    });
    const { user: bidder1, token: token1 } = await createTestUser({
      name: 'Bidder Bob',
      email: 'bob@campus.edu'
    });
    const { user: bidder2, token: token2 } = await createTestUser({
      name: 'Bidder Alice',
      email: 'alice@campus.edu'
    });

    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Graphing Calculator TI-84',
      category: 'calculator',
      condition: 'like-new',
      description: 'Used for one semester in calc 1.',
      startingPrice: 500,
      minimumBidIncrement: 50,
      currentPrice: 500,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    // 1. Bidder 1 places first bid of ₹500
    const bid1Res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(token1))
      .send({ amount: 500 });
    assert.equal(bid1Res.status, 201);

    // Bidder 1 should have 1 notification (BID_PLACED)
    const b1Notifs = await Notification.find({ recipient: bidder1._id });
    assert.equal(b1Notifs.length, 1);
    assert.equal(b1Notifs[0].eventType, NOTIFICATION_EVENTS.BID_PLACED);
    assert.equal(b1Notifs[0].listing.toString(), listing._id.toString());

    // Seller should have 1 notification (NEW_BID_ON_LISTING)
    const sellerNotifs = await Notification.find({ recipient: seller._id });
    assert.equal(sellerNotifs.length, 1);
    assert.equal(sellerNotifs[0].eventType, NOTIFICATION_EVENTS.NEW_BID_ON_LISTING);
    assert.match(sellerNotifs[0].message, /500/);

    // 2. Bidder 2 places higher bid of ₹600
    const bid2Res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(token2))
      .send({ amount: 600 });
    assert.equal(bid2Res.status, 201);

    // Bidder 2 should have 1 notification (BID_PLACED)
    const b2Notifs = await Notification.find({ recipient: bidder2._id });
    assert.equal(b2Notifs.length, 1);
    assert.equal(b2Notifs[0].eventType, NOTIFICATION_EVENTS.BID_PLACED);

    // Bidder 1 should now have an OUTBID notification (total 2: BID_PLACED + OUTBID)
    const b1UpdatedNotifs = await Notification.find({ recipient: bidder1._id }).sort({ createdAt: -1 });
    assert.equal(b1UpdatedNotifs.length, 2);
    assert.equal(b1UpdatedNotifs[0].eventType, NOTIFICATION_EVENTS.OUTBID);
    assert.match(b1UpdatedNotifs[0].message, /600/);

    // Seller should now have 2 notifications
    const sellerUpdatedNotifs = await Notification.find({ recipient: seller._id });
    assert.equal(sellerUpdatedNotifs.length, 2);

    // 3. Same bidder (Bidder 2) raises their own bid to ₹700: should NOT receive an OUTBID notification
    const bid3Res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(token2))
      .send({ amount: 700 });
    assert.equal(bid3Res.status, 201);

    const b2AfterSelfRaise = await Notification.find({
      recipient: bidder2._id,
      eventType: NOTIFICATION_EVENTS.OUTBID
    });
    assert.equal(b2AfterSelfRaise.length, 0, 'Bidder should not receive an outbid notification for raising their own bid');
  });

  test('Invalid or rejected bids do NOT generate notifications', async () => {
    const { user: seller } = await createTestUser({ email: 's1@campus.edu' });
    const { user: bidder, token } = await createTestUser({ email: 'b1@campus.edu' });

    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Lab Coat',
      category: 'other',
      condition: 'good',
      description: 'Size M lab coat',
      startingPrice: 200,
      minimumBidIncrement: 20,
      currentPrice: 200,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    // Bid below starting price
    const res = await request(app)
      .post(`/api/listings/${listing._id}/bids`)
      .set(authHeader(token))
      .send({ amount: 100 });
    assert.equal(res.status, 400);

    const notifs = await Notification.find({});
    assert.equal(notifs.length, 0, 'No notification should exist for a rejected bid');
  });

  test('User can fetch notifications, mark single notification as read, and mark all as read', async () => {
    const { user, token } = await createTestUser({ email: 'u1@campus.edu' });

    // Seed 2 notifications
    const n1 = await Notification.create({
      recipient: user._id,
      eventType: NOTIFICATION_EVENTS.BID_PLACED,
      title: 'Notification 1',
      message: 'Message 1',
      isRead: false
    });
    const n2 = await Notification.create({
      recipient: user._id,
      eventType: NOTIFICATION_EVENTS.OUTBID,
      title: 'Notification 2',
      message: 'Message 2',
      isRead: false
    });

    // GET /api/notifications
    const listRes = await request(app)
      .get('/api/notifications')
      .set(authHeader(token));
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.count, 2);
    assert.equal(listRes.body.unreadCount, 2);

    // PATCH /api/notifications/:id/read
    const markOneRes = await request(app)
      .patch(`/api/notifications/${n1._id}/read`)
      .set(authHeader(token));
    assert.equal(markOneRes.status, 200);
    assert.equal(markOneRes.body.notification.isRead, true);

    // GET /api/notifications/unread-count
    const countRes = await request(app)
      .get('/api/notifications/unread-count')
      .set(authHeader(token));
    assert.equal(countRes.status, 200);
    assert.equal(countRes.body.unreadCount, 1);

    // PATCH /api/notifications/read-all
    const markAllRes = await request(app)
      .patch('/api/notifications/read-all')
      .set(authHeader(token));
    assert.equal(markAllRes.status, 200);
    assert.equal(markAllRes.body.markedCount, 1);

    const countRes2 = await request(app)
      .get('/api/notifications/unread-count')
      .set(authHeader(token));
    assert.equal(countRes2.body.unreadCount, 0);
  });

  test('Cross-user isolation: User B cannot access or mark User A notifications as read', async () => {
    const { user: userA } = await createTestUser({ email: 'userA@campus.edu' });
    const { token: tokenB } = await createTestUser({ email: 'userB@campus.edu' });

    const nA = await Notification.create({
      recipient: userA._id,
      eventType: NOTIFICATION_EVENTS.BID_PLACED,
      title: 'Private to A',
      message: 'Top secret',
      isRead: false
    });

    // User B tries to mark User A's notification as read
    const patchRes = await request(app)
      .patch(`/api/notifications/${nA._id}/read`)
      .set(authHeader(tokenB));
    assert.equal(patchRes.status, 404, 'User B should get 404 when attempting to mark User A notification');

    // Confirm it remains unread in database
    const dbNotif = await Notification.findById(nA._id);
    assert.equal(dbNotif.isRead, false);

    // User B's notification list should be empty
    const listB = await request(app)
      .get('/api/notifications')
      .set(authHeader(tokenB));
    assert.equal(listB.body.count, 0);
    assert.equal(listB.body.unreadCount, 0);
  });

  test('Idempotency prevents duplicate notifications for the same event and recipient', async () => {
    const { user } = await createTestUser({ email: 'idem@campus.edu' });

    // Same idempotencyKey
    await Notification.create({
      recipient: user._id,
      eventType: NOTIFICATION_EVENTS.BID_PLACED,
      title: 'Test',
      message: 'First attempt',
      idempotencyKey: 'IDEM_KEY_123'
    });

    // Second attempt should fail with duplicate key (handled gracefully by notificationService)
    try {
      await Notification.create({
        recipient: user._id,
        eventType: NOTIFICATION_EVENTS.BID_PLACED,
        title: 'Test',
        message: 'Second attempt',
        idempotencyKey: 'IDEM_KEY_123'
      });
      assert.fail('Expected duplicate key error');
    } catch (err) {
      assert.equal(err.code, 11000);
    }

    const notifs = await Notification.find({ recipient: user._id });
    assert.equal(notifs.length, 1);
  });
});
