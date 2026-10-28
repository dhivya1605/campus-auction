import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearDatabase,
  createTestUser,
  authHeader
} from './testHelper.js';
import { UPLOADS_DIR } from '../src/middleware/uploadMiddleware.js';

describe('Local Image Upload & Static Serving Tests', () => {
  let app;
  let seller;

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
  });

  it('POST /api/listings with multipart image upload should save file and record relative URL', async () => {
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const res = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Canon DSLR Camera')
      .field('category', 'electronics')
      .field('description', 'Entry level DSLR camera with kit lens.')
      .field('condition', 'good')
      .field('startingPrice', 12000)
      .field('minimumBidIncrement', 500)
      .field('closingTime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .attach('image', pngBuffer, 'camera.png');

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.listing.photos));
    assert.equal(res.body.listing.photos.length, 1);
    assert.match(res.body.listing.photos[0], /^\/uploads\/listing-.*\.png$/);

    // Verify file actually exists in backend/uploads/
    const filename = path.basename(res.body.listing.photos[0]);
    const filePath = path.join(UPLOADS_DIR, filename);
    assert.ok(fs.existsSync(filePath), 'Saved image file must exist on disk');

    // Test static serving: GET /uploads/:filename
    const staticRes = await request(app).get(`/uploads/${filename}`);
    assert.equal(staticRes.status, 200);
    assert.equal(staticRes.headers['content-type'], 'image/png');

    // Clean up test file
    fs.unlinkSync(filePath);
  });

  it('POST /api/listings should reject invalid file types (e.g. .txt)', async () => {
    const txtBuffer = Buffer.from('This is not an image');

    const res = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Physics Notes')
      .field('category', 'books')
      .field('description', 'Comprehensive lecture notes.')
      .field('condition', 'good')
      .field('startingPrice', 100)
      .field('minimumBidIncrement', 10)
      .field('closingTime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .attach('image', txtBuffer, 'notes.txt');

    assert.equal(res.status, 400);
    assert.match(res.body.message, /Only JPEG, PNG, and WebP images are allowed/);
  });

  it('POST /api/listings without an image should succeed and default photos to empty array', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Study Table Lamp')
      .field('category', 'other')
      .field('description', 'Flexible LED study lamp.')
      .field('condition', 'good')
      .field('startingPrice', 250)
      .field('minimumBidIncrement', 25)
      .field('closingTime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.listing.photos, []);
  });

  it('PATCH /api/listings/:id allows seller to replace existing image with a new upload', async () => {
    const png1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const png2 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );

    // 1. Create initial listing with image 1
    const createRes = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Engineering Mathematics Book')
      .field('category', 'books')
      .field('description', 'Higher Engineering Mathematics 8th Edition.')
      .field('condition', 'good')
      .field('startingPrice', 300)
      .field('minimumBidIncrement', 20)
      .field('closingTime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .attach('image', png1, 'book1.png');

    assert.equal(createRes.status, 201);
    const listingId = createRes.body.listing._id;
    const initialPhoto = createRes.body.listing.photos[0];

    // 2. Patch listing with replacement image 2
    const updateRes = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set(authHeader(seller.token))
      .field('title', 'Engineering Mathematics Book - Revised Edition')
      .attach('image', png2, 'book2.png');

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
    assert.equal(updateRes.body.listing.title, 'Engineering Mathematics Book - Revised Edition');
    assert.equal(updateRes.body.listing.photos.length, 1);
    assert.notEqual(updateRes.body.listing.photos[0], initialPhoto);
    assert.match(updateRes.body.listing.photos[0], /^\/uploads\/listing-.*\.png$/);

    // Clean up created file
    const newFilename = path.basename(updateRes.body.listing.photos[0]);
    const newPath = path.join(UPLOADS_DIR, newFilename);
    if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
  });

  it('PATCH /api/listings/:id allows seller to delete current image', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const createRes = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Scientific Calculator FX-991ES')
      .field('category', 'calculator')
      .field('description', 'Solar and battery dual powered calculator.')
      .field('condition', 'like-new')
      .field('startingPrice', 600)
      .field('minimumBidIncrement', 50)
      .field('closingTime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .attach('image', png, 'calc.png');

    assert.equal(createRes.status, 201);
    const listingId = createRes.body.listing._id;

    // Delete image using removePhoto: true
    const deletePhotoRes = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set(authHeader(seller.token))
      .field('removePhoto', 'true');

    assert.equal(deletePhotoRes.status, 200);
    assert.deepEqual(deletePhotoRes.body.listing.photos, []);
  });

  it('POST /api/listings accepts up to 5 images and records all relative paths', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const reqBuilder = request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Mountain Bike Full Package')
      .field('category', 'cycle')
      .field('description', '21 gear bicycle with lock, helmet, and pump included.')
      .field('condition', 'good')
      .field('startingPrice', 4500)
      .field('minimumBidIncrement', 100)
      .field('closingTime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

    // Attach 5 images
    for (let i = 1; i <= 5; i++) {
      reqBuilder.attach('images', pngBuffer, `bike${i}.png`);
    }

    const res = await reqBuilder;

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.listing.photos.length, 5);
    res.body.listing.photos.forEach((p) => {
      assert.match(p, /^\/uploads\/listing-.*\.png$/);
      const filename = path.basename(p);
      const filePath = path.join(UPLOADS_DIR, filename);
      assert.ok(fs.existsSync(filePath));
      fs.unlinkSync(filePath);
    });
  });

  it('POST /api/listings rejects upload exceeding 5 images', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const reqBuilder = request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Gaming Mouse')
      .field('category', 'electronics')
      .field('description', 'RGB gaming mouse with high DPI sensor.')
      .field('condition', 'like-new')
      .field('startingPrice', 800)
      .field('minimumBidIncrement', 50)
      .field('closingTime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

    // Attach 6 images (exceeds max 5)
    for (let i = 1; i <= 6; i++) {
      reqBuilder.attach('images', pngBuffer, `mouse${i}.png`);
    }

    const res = await reqBuilder;
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Maximum 5 images allowed/);
  });

  it('PATCH /api/listings/:id records editHistory audit trail when fields are modified', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const createRes = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Study Lamp Original')
      .field('category', 'electronics')
      .field('description', 'Original detailed description for the lamp.')
      .field('condition', 'fair')
      .field('startingPrice', 200)
      .field('minimumBidIncrement', 20)
      .field('closingTime', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .attach('image', png, 'lamp.png');

    assert.equal(createRes.status, 201);
    const listingId = createRes.body.listing._id;

    // Update description, condition, and starting price before bidding starts
    const updateRes = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set(authHeader(seller.token))
      .field('title', 'Study Lamp Updated Title')
      .field('condition', 'good')
      .field('startingPrice', 250)
      .field('reason', 'Corrected condition and price');

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.listing.title, 'Study Lamp Updated Title');
    assert.equal(updateRes.body.listing.condition, 'good');
    assert.equal(updateRes.body.listing.startingPrice, 250);

    // Verify editHistory audit trail
    assert.ok(Array.isArray(updateRes.body.listing.editHistory));
    assert.equal(updateRes.body.listing.editHistory.length, 1);
    const entry = updateRes.body.listing.editHistory[0];
    assert.equal(entry.reason, 'Corrected condition and price');
    const changedFields = entry.changes.map((c) => c.field);
    assert.ok(changedFields.includes('title'));
    assert.ok(changedFields.includes('condition'));
    assert.ok(changedFields.includes('startingPrice'));

    // Clean up created file
    if (createRes.body.listing.photos[0]) {
      const p = path.join(UPLOADS_DIR, path.basename(createRes.body.listing.photos[0]));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('Anti-sniping protection: valid bid in final 30s extends auction by 60s and records audit event', async () => {
    const bidder = await createTestUser({
      name: 'Sniper Bob',
      email: 'bob@campus.edu'
    });

    // Create listing closing in 20 seconds (within final 30s window)
    const originalClosing = new Date(Date.now() + 20 * 1000);
    const createRes = await request(app)
      .post('/api/listings')
      .set(authHeader(seller.token))
      .field('title', 'Rare Textbook')
      .field('category', 'books')
      .field('description', 'Hard to find algorithms textbook.')
      .field('condition', 'good')
      .field('startingPrice', 500)
      .field('minimumBidIncrement', 50)
      .field('closingTime', originalClosing.toISOString());

    assert.equal(createRes.status, 201);
    const listingId = createRes.body.listing._id;

    // Place a valid bid within the final 20 seconds
    const bidRes = await request(app)
      .post(`/api/listings/${listingId}/bids`)
      .set(authHeader(bidder.token))
      .send({ amount: 500 });

    assert.equal(bidRes.status, 201);
    assert.equal(bidRes.body.extended, true);
    assert.ok(new Date(bidRes.body.closingTime) > originalClosing);

    // Verify listing details reflects extension and audit history
    const getRes = await request(app).get(`/api/listings/${listingId}`);
    assert.equal(getRes.status, 200);
    assert.ok(new Date(getRes.body.listing.closingTime) > originalClosing);
    assert.ok(getRes.body.listing.editHistory.length >= 1);
    assert.match(
      getRes.body.listing.editHistory[0].reason,
      /Anti-sniping extension/
    );
  });
});

