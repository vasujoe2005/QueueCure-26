const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const connectDb = require('./config/db');
const queueRoutes = require('./routes/queueRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { getQueueSnapshot } = require('./controllers/queueController');

dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST', 'PATCH'],
  },
});

app.set('io', io);
app.use(cors({ origin: clientOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'queuecure-express' });
});

app.use('/api/queue', queueRoutes);
app.use('/api/analytics', analyticsRoutes);

io.on('connection', async (socket) => {
  socket.emit('queue:update', await getQueueSnapshot());
});

connectDb()
  .then(() => {
    server.listen(port, () => {
      console.log(`Express API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start Express API:', error.message);
    process.exit(1);
  });
