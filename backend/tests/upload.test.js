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
});

