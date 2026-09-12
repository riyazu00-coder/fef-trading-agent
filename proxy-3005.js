const net = require('net');

const server = net.createServer((fromSocket) => {
  const toSocket = net.createConnection({ host: '127.0.0.1', port: 3000 }, () => {
    fromSocket.pipe(toSocket);
    toSocket.pipe(fromSocket);
  });

  fromSocket.on('error', () => {});
  toSocket.on('error', () => {});
});

server.listen(3005, '0.0.0.0', () => {
  console.log('Port forwarder running: 0.0.0.0:3005 -> 127.0.0.1:3000');
});
