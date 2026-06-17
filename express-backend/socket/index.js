function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.emit('connected', { socketId: socket.id });
  });
}

module.exports = registerSocketHandlers;
