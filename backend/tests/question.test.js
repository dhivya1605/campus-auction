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
import { Question } from '../src/models/Question.js';
import { Notification, NOTIFICATION_EVENTS } from '../src/models/Notification.js';

describe('Questions and Answers Before Bidding Tests', () => {
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

  test('Buyer can submit a valid question; seller receives notification and question is saved', async () => {
    const { user: seller } = await createTestUser({ name: 'Seller Sam', email: 'sam@campus.edu' });
    const { user: buyer, token: buyerToken } = await createTestUser({
      name: 'Buyer Bob',
      email: 'bob@campus.edu'
    });

    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Scientific Calculator Casio fx-991EX',
      category: 'calculator',
      condition: 'like-new',
      description: 'Used for two exams. Comes with case.',
      startingPrice: 800,
      minimumBidIncrement: 50,
      currentPrice: 800,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    // 1. Submit question
    const askRes = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'Does this calculator include original solar panel cover?' });

    assert.equal(askRes.status, 201);
    assert.equal(askRes.body.success, true);
    assert.equal(askRes.body.question.question, 'Does this calculator include original solar panel cover?');
    assert.equal(askRes.body.question.status, 'unanswered');
    assert.equal(askRes.body.question.asker.name, 'Buyer Bob');

    // 2. Verified in DB
    const dbQuestion = await Question.findById(askRes.body.question._id);
    assert.ok(dbQuestion);
    assert.equal(dbQuestion.listing.toString(), listing._id.toString());
    assert.equal(dbQuestion.asker.toString(), buyer._id.toString());
    assert.equal(dbQuestion.seller.toString(), seller._id.toString());

    // 3. Question appears on listing GET
    const getRes = await request(app).get(`/api/listings/${listing._id}/questions`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.count, 1);
    assert.equal(getRes.body.questions[0].question, 'Does this calculator include original solar panel cover?');

    // 4. Seller received notification
    const sellerNotif = await Notification.findOne({
      recipient: seller._id,
      eventType: NOTIFICATION_EVENTS.QUESTION_ASKED
    });
    assert.ok(sellerNotif, 'Seller should receive QUESTION_ASKED notification');
    assert.match(sellerNotif.message, /solar panel cover/);
  });

  test('Listing questions isolation: A different listing does not show other listings questions', async () => {
    const { user: seller } = await createTestUser({ email: 'seller_iso@campus.edu' });
    const { token: buyerToken } = await createTestUser({ email: 'buyer_iso@campus.edu' });

    const now = new Date();
    const listing1 = await Listing.create({
      seller: seller._id,
      title: 'Listing 1',
      category: 'books',
      condition: 'good',
      description: 'Standard textbook for physics course',
      startingPrice: 100,
      minimumBidIncrement: 10,
      currentPrice: 100,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    const listing2 = await Listing.create({
      seller: seller._id,
      title: 'Listing 2',
      category: 'cycle',
      condition: 'fair',
      description: 'Campus bicycle in fair condition',
      startingPrice: 1500,
      minimumBidIncrement: 100,
      currentPrice: 1500,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    await request(app)
      .post(`/api/listings/${listing1._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'Is page 45 intact?' });

    const res1 = await request(app).get(`/api/listings/${listing1._id}/questions`);
    assert.equal(res1.body.count, 1);

    const res2 = await request(app).get(`/api/listings/${listing2._id}/questions`);
    assert.equal(res2.body.count, 0);
  });

  test('Seller can answer question; original asker receives notification; answer persists', async () => {
    const { user: seller, token: sellerToken } = await createTestUser({
      name: 'Seller Sam',
      email: 'sam2@campus.edu'
    });
    const { user: buyer, token: buyerToken } = await createTestUser({
      name: 'Buyer Bob',
      email: 'bob2@campus.edu'
    });

    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Engineering Mechanics Book',
      category: 'books',
      condition: 'good',
      description: 'Standard textbook',
      startingPrice: 300,
      minimumBidIncrement: 20,
      currentPrice: 300,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    // Ask question
    const askRes = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'Which edition is this textbook?' });
    const questionId = askRes.body.question._id;

    // Seller answers question
    const answerRes = await request(app)
      .patch(`/api/questions/${questionId}/answer`)
      .set(authHeader(sellerToken))
      .send({ answer: 'It is the 8th edition published in 2021.' });

    assert.equal(answerRes.status, 200);
    assert.equal(answerRes.body.success, true);
    assert.equal(answerRes.body.question.status, 'answered');
    assert.equal(answerRes.body.question.answer, 'It is the 8th edition published in 2021.');
    assert.ok(answerRes.body.question.answeredAt);

    // Asker received notification
    const buyerNotif = await Notification.findOne({
      recipient: buyer._id,
      eventType: NOTIFICATION_EVENTS.QUESTION_ANSWERED
    });
    assert.ok(buyerNotif, 'Buyer should receive QUESTION_ANSWERED notification');
    assert.match(buyerNotif.message, /8th edition/);

    // Question list now reflects answer
    const listRes = await request(app).get(`/api/listings/${listing._id}/questions`);
    assert.equal(listRes.body.questions[0].status, 'answered');
    assert.equal(listRes.body.questions[0].answer, 'It is the 8th edition published in 2021.');
  });

  test('Authorization: Unrelated user CANNOT answer questions belonging to another seller', async () => {
    const { user: seller } = await createTestUser({ email: 'actual_seller@campus.edu' });
    const { token: buyerToken } = await createTestUser({ email: 'buyer_auth@campus.edu' });
    const { token: randomUserToken } = await createTestUser({ email: 'imposter@campus.edu' });

    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Lab Notebook',
      category: 'other',
      condition: 'new',
      description: 'Brand new grid notebook for lab calculations',
      startingPrice: 50,
      minimumBidIncrement: 5,
      currentPrice: 50,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    const askRes = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'How many pages are in this book?' });

    const questionId = askRes.body.question._id;

    // Imposter tries to answer
    const unauthorizedRes = await request(app)
      .patch(`/api/questions/${questionId}/answer`)
      .set(authHeader(randomUserToken))
      .send({ answer: 'I am not the seller but I want to answer.' });

    assert.equal(unauthorizedRes.status, 403);
    assert.match(unauthorizedRes.body.message, /Only the seller/);

    // Confirm answer remains empty
    const checkQ = await Question.findById(questionId);
    assert.equal(checkQ.status, 'unanswered');
    assert.equal(checkQ.answer, null);
  });

  test('Validation: Rejects empty, too short, or overlong questions and answers', async () => {
    const { user: seller, token: sellerToken } = await createTestUser({ email: 's_val@campus.edu' });
    const { token: buyerToken } = await createTestUser({ email: 'b_val@campus.edu' });

    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Desk Lamp',
      category: 'electronics',
      condition: 'good',
      description: 'Study table LED lamp in good condition',
      startingPrice: 200,
      minimumBidIncrement: 20,
      currentPrice: 200,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    // 1. Empty question
    const emptyRes = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: '   ' });
    assert.equal(emptyRes.status, 400);

    // 2. Too short question (< 3 chars)
    const shortRes = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'hi' });
    assert.equal(shortRes.status, 400);

    // 3. Overlong question (> 500 chars)
    const longQuestion = 'a'.repeat(501);
    const longRes = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: longQuestion });
    assert.equal(longRes.status, 400);

    // Valid question for answer test
    const validQ = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'Does it come with an LED bulb?' });
    const qId = validQ.body.question._id;

    // 4. Empty answer
    const emptyAns = await request(app)
      .patch(`/api/questions/${qId}/answer`)
      .set(authHeader(sellerToken))
      .send({ answer: '   ' });
    assert.equal(emptyAns.status, 400);

    // 5. Overlong answer (> 1000 chars)
    const longAns = 'b'.repeat(1001);
    const longAnsRes = await request(app)
      .patch(`/api/questions/${qId}/answer`)
      .set(authHeader(sellerToken))
      .send({ answer: longAns });
    assert.equal(longAnsRes.status, 400);
  });

  test('Business rules: Sellers cannot ask questions on their own listing; Closed auctions reject new questions', async () => {
    const { user: seller, token: sellerToken } = await createTestUser({ email: 's_rules@campus.edu' });
    const { token: buyerToken } = await createTestUser({ email: 'b_rules@campus.edu' });

    const now = new Date();
    const activeListing = await Listing.create({
      seller: seller._id,
      title: 'Bicycle Gear',
      category: 'cycle',
      condition: 'good',
      description: 'Helmet and safety gear for cyclists',
      startingPrice: 400,
      minimumBidIncrement: 40,
      currentPrice: 400,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    // Seller self-asking rejected
    const selfAskRes = await request(app)
      .post(`/api/listings/${activeListing._id}/questions`)
      .set(authHeader(sellerToken))
      .send({ question: 'Can I ask my own question?' });
    assert.equal(selfAskRes.status, 400);
    assert.match(selfAskRes.body.message, /Sellers cannot ask questions on their own listing/);

    // Closed listing rejects questions
    const closedListing = await Listing.create({
      seller: seller._id,
      title: 'Old Books',
      category: 'books',
      condition: 'fair',
      description: 'Used semester course books in fair shape',
      startingPrice: 100,
      minimumBidIncrement: 10,
      currentPrice: 100,
      startTime: new Date(now.getTime() - 7200000),
      closingTime: new Date(now.getTime() - 3600000),
      status: 'completed'
    });

    const closedRes = await request(app)
      .post(`/api/listings/${closedListing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'Is this still available?' });
    assert.equal(closedRes.status, 400);
    assert.match(closedRes.body.message, /Bidding has ended or this auction is closed/);
  });

  test('Anti-spam: Rejects duplicate question submissions on the same listing', async () => {
    const { user: seller } = await createTestUser({ email: 's_spam@campus.edu' });
    const { token: buyerToken } = await createTestUser({ email: 'b_spam@campus.edu' });

    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Drafting Board',
      category: 'other',
      condition: 'good',
      description: 'A2 size drafting board for architecture engineering',
      startingPrice: 350,
      minimumBidIncrement: 30,
      currentPrice: 350,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    const q1 = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'Is the T-square included with this?' });
    assert.equal(q1.status, 201);

    // Exact duplicate attempt
    const qDup = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .set(authHeader(buyerToken))
      .send({ question: 'Is the T-square included with this?' });
    assert.equal(qDup.status, 400);
  });

  test('Unauthenticated user cannot submit a question; Nonexistent listing returns 404', async () => {
    const { user: seller } = await createTestUser({ email: 's_unauth@campus.edu' });
    const now = new Date();
    const listing = await Listing.create({
      seller: seller._id,
      title: 'Lab Kit',
      category: 'other',
      condition: 'good',
      description: 'Complete basic chemistry lab kit',
      startingPrice: 100,
      minimumBidIncrement: 10,
      currentPrice: 100,
      startTime: new Date(now.getTime() - 60000),
      closingTime: new Date(now.getTime() + 3600000),
      status: 'active'
    });

    // No auth token
    const unauthRes = await request(app)
      .post(`/api/listings/${listing._id}/questions`)
      .send({ question: 'Can I ask without logging in?' });
    assert.equal(unauthRes.status, 401);

    // Nonexistent listing
    const { token } = await createTestUser({ email: 'some_user@campus.edu' });
    const fakeId = '660000000000000000000000';
    const notFoundRes = await request(app)
      .post(`/api/listings/${fakeId}/questions`)
      .set(authHeader(token))
      .send({ question: 'Does this exist?' });
    assert.equal(notFoundRes.status, 404);
  });
});

