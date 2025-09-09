# WebRTC Demo

A prototype Node.js + Express application demonstrating **1-way video streaming**, **2-way audio communication**, and the ability for a real estate appraiser to **take snapshots** of the homeowner’s video feed. Designed to showcase how remote inspection could work without an on-site visit.

---

## Features

- **WebRTC peer-to-peer** connection:
  - Homeowner shares video + audio.
  - Appraiser sends audio only.
- **Secure HTTPS + WebSocket signaling** powered by Node.js and Express.
- **Snapshots**: Appraiser can capture frames from the homeowner’s video feed, which are stored locally on the server with timestamps.
- **Session links**: Appraiser creates a unique session link for the homeowner.

---

## Technologies Used

- [Node.js](https://nodejs.org/) — server runtime  
- [Express](https://expressjs.com/) — HTTP + WebSocket server  
- [ws](https://www.npmjs.com/package/ws) — WebSocket signaling  
- [WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) — real-time peer connection  
- [ngrok](https://ngrok.com/) — optional tunneling to test outside your LAN  

---

## Getting Started

Follow these steps from a clean machine.

### 1. Install prerequisites
- Install [Node.js](https://nodejs.org/) (v18 or later recommended).
- Install [npm](https://www.npmjs.com/) (comes with Node.js).
- Install [git](https://git-scm.com/) if not already installed.

### 2. Clone the repository
```bash
git clone https://github.com/ChrisLehto/webRTC-demo.git
cd webRTC-demo
```

### 3. Install dependencies
```bash
npm ci
```

### 4. Generate local HTTPS certificates
WebRTC requires HTTPS to access the camera/microphone.

Easiest option is [mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install
mkcert 127.0.0.1 localhost
```

This generates `cert.pem` and `key.pem` files. Place them in the project root.

Alternatively, you can generate self-signed certs with OpenSSL:
```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365
```

### 5. Start the server
```bash
npm start
```

By default the app runs on **https://localhost:3000**.

### 6. Test on another device
Open a terminal and run ngrok:
```bash
ngrok http https://localhost:3000
```

Use the public **ngrok URL** to create a session and share the Homeowner link.

---

## Project Structure

```
project-root/
├── server.js           # Express + WebSocket signaling server
├── package.json        # Dependencies
├── package-lock.json   # Exact versions of dependencies
├── public/             # Static frontend files
│   ├── index.html      # Session creation
│   ├── appraiser.html  # Appraiser console
│   └── homeowner.html  # Homeowner console
├── capture/            # Snapshot images (ignored in Git)
├── .gitignore
└── README.md
```

---

## Next Steps

- Add TURN server for reliable NAT traversal.
- Streamline email invitations.
- UI polish for production readiness.

---

## License

MIT
