import mongoose from 'mongoose';

export const connectDB = async (customUri) => {
  const uri = customUri || process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined.');
  }

  try {
    const conn = await mongoose.connect(uri, {
      autoIndex: true
    });
    console.log(`[MongoDB] Connected to database: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection failed: ${error.message}`);
    throw error;
  }
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected from database');
  } catch (error) {
    console.error(`[MongoDB] Disconnection error: ${error.message}`);
  }
};

