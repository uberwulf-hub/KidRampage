// The relay's rules, shared by the Cloudflare version (worker.mjs) and the home
// network server (../../server.js). A "room" is one online game: the host is
// peer 1, everyone else gets a new number. Game data is passed along without
// being looked at; control messages are small JSON texts.
//
// Same rules and message format as Race Track Mayhem's relay
// (uberwulf-hub/Race-Track-Mayhem, server/relay/relay-core.mjs).
//   Text from the relay: welcome {id, code, peers}, join {id}, leave {id}, error {msg}
//   Text to the relay:   kick {id} (host only), stats
//   Binary game data:    [int32 little-endian peer id][1 channel byte][packet]
//                        sent with who it's for (0 = everyone else, -N = everyone but N),
//                        delivered with who it's from.

export const PROTOCOL = 1;
export const MAX_PEERS = 6;
// Kid-friendly room codes: 4 letters, no look-alikes (no I, O, 0, 1).
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return c;
}

/** One room. `send(ws, data)` and `close(ws, code, reason)` are supplied by the host platform. */
export class Room {
  constructor(code, send, close) {
    this.code = code;
    this.peers = new Map(); // id -> ws
    this.nextId = 2;
    this.send = send;
    this.close = close;
    this.stats = { binIn: 0, binOut: 0, textIn: 0 }; // for troubleshooting ({"t":"stats"})
  }

  addHost(ws) {
    this.peers.set(1, ws);
    this.send(ws, JSON.stringify({ t: "welcome", id: 1, code: this.code, peers: [] }));
    return 1;
  }

  addGuest(ws) {
    if (!this.peers.has(1)) {
      this.send(ws, JSON.stringify({ t: "error", msg: "That game has ended." }));
      this.close(ws, 4004, "That game has ended.");
      return 0;
    }
    if (this.peers.size >= MAX_PEERS) {
      this.send(ws, JSON.stringify({ t: "error", msg: "That game is full!" }));
      this.close(ws, 4003, "That game is full!");
      return 0;
    }
    const id = this.nextId++;
    const others = [...this.peers.keys()];
    this.peers.set(id, ws);
    this.send(ws, JSON.stringify({ t: "welcome", id, code: this.code, peers: others }));
    for (const [pid, pws] of this.peers) if (pid !== id) this.send(pws, JSON.stringify({ t: "join", id }));
    return id;
  }

  /** A message from peer `from`: a string (control) or binary game data. */
  onMessage(from, data) {
    if (typeof data === "string") {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      this.stats.textIn++;
      if (msg.t === "stats") {
        const ws = this.peers.get(from);
        if (ws) this.send(ws, JSON.stringify({ t: "stats", ...this.stats, peers: [...this.peers.keys()] }));
        return;
      }
      if (msg.t === "kick" && from === 1 && this.peers.has(msg.id)) {
        this.close(this.peers.get(msg.id), 4001, "Removed by the host.");
      }
      return;
    }
    this.stats.binIn++;
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.length < 5) return;
    const target = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(0, true);
    // Copy into a fresh ArrayBuffer (what every WebSocket send() accepts), stamped with who it's from.
    const out = bytes.slice().buffer;
    new DataView(out).setInt32(0, from, true);
    if (target > 0) {
      const ws = this.peers.get(target);
      if (ws) { this.send(ws, out); this.stats.binOut++; }
    } else {
      for (const [pid, ws] of this.peers) {
        if (pid !== from && pid !== -target) { this.send(ws, out); this.stats.binOut++; }
      }
    }
  }

  /** A peer left. If it was the host, the game is over for everyone. */
  onLeave(id) {
    if (!this.peers.has(id)) return;
    this.peers.delete(id);
    if (id === 1) {
      for (const ws of this.peers.values()) this.close(ws, 4002, "The host left the game.");
      this.peers.clear();
    } else {
      for (const ws of this.peers.values()) this.send(ws, JSON.stringify({ t: "leave", id }));
    }
  }

  get empty() { return this.peers.size === 0; }
}
