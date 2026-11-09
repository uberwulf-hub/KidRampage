#!/usr/bin/env node
'use strict';
/* =====================================================================
   BOOM BROTHERS home-network server
   Run it on ONE computer:   node server.js
   Then everyone opens the address it prints (e.g. http://192.168.1.23:8080).
   No npm install needed: this file only uses what comes with Node.js.

   It does two jobs:
   1. Serves the game (index.html + game.js) to every device in the house.
   2. Is a "relay": one player HOSTS and gets a 4-letter room code, the others
      JOIN with that code, and the relay passes their messages along.

   The relay rules are in server/relay/relay-core.mjs, the same file the
   Cloudflare version (server/relay/worker.mjs) uses for playing between houses.
   They match Race Track Mayhem's relay.
   ===================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;
const MAX_MESSAGE = 1 << 20; // 1 MB
const FILES = { '/': 'index.html', '/index.html': 'index.html', '/game.js': 'game.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

// The relay rules live in server/relay/relay-core.mjs, shared with the Cloudflare version.
let Room, newCode, PROTOCOL;
const rooms = new Map(); // code -> Room
const sendTo = (c, data) => (typeof data === 'string' ? c.sendText(data) : c.sendBinary(Buffer.from(data)));
const closeConn = (c, code, reason) => c.close(code, reason);

// ---------------------------------------------------------------- web pages
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/rooms') { // open games on this server, so kids can just tap one
    const list = [...rooms.values()].filter(r => r.peers.has(1)).map(r => ({ code: r.code, players: r.peers.size }));
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ server: 'boombros', protocol: PROTOCOL, rooms: list }));
    return;
  }
  const name = FILES[url];
  if (!name) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, name), (err, data) => {
    if (err) { res.writeHead(500); res.end('Could not read ' + name); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- minimal WebSocket (RFC 6455)
class Conn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frag = []; this.fragBinary = false; this.open = true;
    this.onmessage = () => {}; this.onclose = () => {};
    socket.on('data', d => this.data(d));
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }
  data(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      if (!this.open || this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_MESSAGE) { this.close(1009, 'Too big'); return; }
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = Buffer.from(this.buf.subarray(off + (masked ? 4 : 0), need));
      if (masked) { const mask = this.buf.subarray(off, off + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]; }
      this.buf = this.buf.subarray(need);
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this.frame(0xA, payload); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2) this.fragBinary = op === 0x2;
      this.frag.push(payload);
      if (fin) { const msg = Buffer.concat(this.frag); this.frag = []; this.onmessage(msg, this.fragBinary); }
    }
  }
  frame(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }
  sendText(s) { this.frame(0x1, Buffer.from(s, 'utf8')); }
  sendBinary(b) { this.frame(0x2, b); }
  close(code = 1000, reason = '') {
    if (this.open) {
      const r = Buffer.from(reason.slice(0, 100), 'utf8'), p = Buffer.alloc(2 + r.length);
      p.writeUInt16BE(code, 0); r.copy(p, 2);
      try { this.frame(0x8, p); } catch (e) { /* ignore */ }
      this.socket.end();
    }
    this.closed();
  }
  closed() { if (!this.open) return; this.open = false; this.onclose(); }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const c = new Conn(socket);
  const url = new URL(req.url, 'http://x');
  const refuse = (code, msg) => { c.sendText(JSON.stringify({ t: 'error', msg })); c.close(code, msg); };
  if (Number(url.searchParams.get('v')) !== PROTOCOL) return refuse(4005, 'This game is a different version than the server. Update the game!');
  const parts = url.pathname.split('/').filter(Boolean);
  let room, id;
  if (parts[0] === 'host') {
    let code;
    do { code = newCode(); } while (rooms.has(code));
    room = new Room(code, sendTo, closeConn); rooms.set(code, room);
    id = room.addHost(c);
    log('Game ' + code + ' is being hosted.');
  } else if (parts[0] === 'join' && parts[1]) {
    room = rooms.get(parts[1].toUpperCase().replace(/[^A-Z]/g, ''));
    if (!room || room.empty) return refuse(4004, 'No game with that code. Check the letters!');
    id = room.addGuest(c);
    if (!id) return;
    log('Someone joined game ' + room.code + '.');
  } else return refuse(4000, 'Bad request');
  c.onmessage = (data, binary) => room.onMessage(id, binary ? data : data.toString('utf8'));
  c.onclose = () => {
    room.onLeave(id);
    if (room.empty && rooms.get(room.code) === room) { rooms.delete(room.code); log('Game ' + room.code + ' ended.'); }
  };
});

function log(s) { console.log(new Date().toLocaleTimeString() + '  ' + s); }

import(require('url').pathToFileURL(path.join(__dirname, 'server', 'relay', 'relay-core.mjs')).href).then(core => {
  ({ Room, newCode, PROTOCOL } = core);
  server.listen(PORT, ready);
});
function ready() {
  const addrs = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) addrs.push(a.address);
  console.log('\n  BOOM BROTHERS home server is running!\n');
  console.log('  On this computer:   http://localhost:' + PORT);
  for (const a of addrs) console.log('  On other devices:   http://' + a + ':' + PORT);
  console.log('\n  Pick PLAY ONLINE > HOST A GAME on one device, then JOIN A GAME on the others.');
  console.log('  Windows may ask to let Node.js use the network: choose Allow (Private networks).');
  console.log('  Press Ctrl+C to stop.\n');
}
