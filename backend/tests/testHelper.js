import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Listing } from '../src/models/Listing.js';
import { Bid } from '../src/models/Bid.js';
import { SaleOutcome } from '../src/models/SaleOutcome.js';

let mongod;
let appInstance;

export const setupTestEnvironment = async () => {
  process.env.JWT_SECRET = 'test_secret_for_automated_testing_purposes_only';
  process.env.NODE_ENV = 'test';

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  appInstance = createApp();
  return { app: appInstance, mongod };
};

export const teardownTestEnvironment = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
};

export const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
};

export const createTestUser = async ({
  name = 'Test Student',
  email = 'student@campus.edu',
  password = 'password123',
  role = 'student'
} = {}) => {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role
  });

  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'test_secret_for_automated_testing_purposes_only',
    { expiresIn: '1h' }
  );

  return { user, token };
};

export const authHeader = (token) => ({
  Authorization: `Bearer ${token}`
});

