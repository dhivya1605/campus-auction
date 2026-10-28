import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearDatabase,
  authHeader
} from './testHelper.js';

describe('Auth & Health API Tests', () => {
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

  it('GET /api/health should return 200 and system status', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database, 'connected');
  });

  it('POST /api/auth/register should register a new user and return token without passwordHash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Aarav Patel',
        email: 'aarav@campus.edu',
        password: 'securePassword123'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    assert.equal(res.body.user.name, 'Aarav Patel');
    assert.equal(res.body.user.email, 'aarav@campus.edu');
    assert.equal(res.body.user.passwordHash, undefined);
  });

  it('POST /api/auth/register should reject duplicate emails with 409 Conflict', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'User One',
      email: 'dup@campus.edu',
      password: 'password123'
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'User Two',
      email: 'dup@campus.edu',
      password: 'password456'
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
  });

  it('POST /api/auth/register should reject invalid inputs with 400 Bad Request', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: '',
      email: 'not-an-email',
      password: '123'
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.errors));
  });

  it('POST /api/auth/login should authenticate valid user and reject invalid password', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Login User',
      email: 'login@campus.edu',
      password: 'correctPassword123'
    });

    // Valid login
    const validRes = await request(app).post('/api/auth/login').send({
      email: 'login@campus.edu',
      password: 'correctPassword123'
    });
    assert.equal(validRes.status, 200);
    assert.ok(validRes.body.token);
    assert.equal(validRes.body.user.passwordHash, undefined);

    // Invalid password
    const invalidRes = await request(app).post('/api/auth/login').send({
      email: 'login@campus.edu',
      password: 'wrongPassword'
    });
    assert.equal(invalidRes.status, 401);
  });

  it('GET /api/auth/me should return current user for authenticated request', async () => {
    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Me User',
      email: 'me@campus.edu',
      password: 'password123'
    });

    const token = regRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.email, 'me@campus.edu');
    assert.equal(meRes.body.user.passwordHash, undefined);

    // Unauthenticated request
    const unauthRes = await request(app).get('/api/auth/me');
    assert.equal(unauthRes.status, 401);
  });
});

