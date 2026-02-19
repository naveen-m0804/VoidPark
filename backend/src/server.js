// =============================================
// ParkEase - Server Entry Point
// =============================================
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const { testConnection } = require('./config/database');
const { initializeFirebase } = require('./config/firebase');
const { initializeSocket } = require('./sockets/socketHandler');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// ── Global Middleware ──
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(morgan(config.isDev ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));

// ── Health Check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'ParkEase API is running.',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    },
  });
});

// ── API Routes ──
app.use('/api/v1', routes);

// ── Serve Frontend (Production) ──
// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.originalUrl} not found.`,
    data: null,
  });
});

// ── Global Error Handler ──
app.use(errorHandler);

// ── Start Server ──
async function startServer() {
  try {
    console.log('\\n🚀 Starting ParkEase Server...\\n');

    // 1. Test database connection
    await testConnection();

    // 2. Initialize Firebase Admin
    initializeFirebase();

    // 3. Initialize Socket.IO
    const io = initializeSocket(server, config.corsOrigins);
    app.set('io', io);

    // 4. Start HTTP server
    server.listen(config.port, () => {
      console.log(`\n${'='.repeat(40)}`);
      console.log(`   🅿️  ParkEase Server Running`);
      console.log(`${'='.repeat(40)}`);
      console.log(`   🌐 Server:      Listening on port ${config.port}`);
      console.log(`   🌍 Env:         ${config.nodeEnv}`);
      console.log(`${'='.repeat(40)}\n`);
    });
  } catch (err) {
    console.error('\n❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

// ── Graceful Shutdown ──
process.on('SIGTERM', () => {
  console.log('\\n🛑 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('   Server closed.');
    process.exit(0);
  });
});

startServer();

module.exports = app;
