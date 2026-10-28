import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import listingRoutes from './routes/listingRoutes.js';
import auctionRoutes from './routes/auctionRoutes.js';
import saleRoutes from './routes/saleRoutes.js';
import { notFoundMiddleware } from './middleware/notFoundMiddleware.js';
import { errorMiddleware } from './middleware/errorMiddleware.js';

export const createApp = () => {
  const app = express();

  // Basic security and parsing middleware
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    const dbStateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    const dbStatus = dbStateMap[mongoose.connection.readyState] || 'unknown';

    res.status(200).json({
      status: 'ok',
      service: 'campus-auction-backend',
      timestamp: new Date().toISOString(),
      database: dbStatus
    });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/auctions', auctionRoutes);
  app.use('/api/sales', saleRoutes);

  // Catch-all 404 handler
  app.use(notFoundMiddleware);

  // Centralized Error handler
  app.use(errorMiddleware);

  return app;
};

export default createApp();

