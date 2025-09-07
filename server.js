const path = require('path');
const fs = require('fs');
const express = require('express');
const https = require('https');
const {WebSocketServer} = require('ws');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
app.use(express.json({limit: '25mb'}));
app.use(express.static(path.join(__dirname, 'public')));

const captureDir = path.join(__dirname, 'capture');

if(!fs.existsSync(captureDir))
    fs.mkdirSync(captureDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const roomId = req.query.roomId || "default";
        const dir = path.join(captureDir, roomId);

        if(!fs.existsSync(dir)){
            fs.mkdirSync(dir, {recursive: true});
        }

        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        cb(null, `${ts}.jpg`);
    }
});

const upload = multer({storage});

app.use('/captures', express.static(captureDir));

const keyPath  = process.env.SSL_KEY  || path.join(__dirname, 'key.pem');
const certPath = process.env.SSL_CERT || path.join(__dirname, 'cert.pem');

const server = https.createServer({
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
}, app);

const rooms = new Map();

function makeId(len = 6){
    return crypto.randomBytes(9).toString('base64url').slice(0, len);
}

app.post('/api/sessions', (req, res) => {
    const id = makeId();
    rooms.set(id, {homeowner: null, appraiser: null});

    const host = req.headers.host;
    const proto = 'https';
    const homeownerUrl = `${proto}://${host}/homeowner.html?room=${id}`;
    const appraiserUrl = `${proto}://${host}/appraiser.html?room=${id}`;

    res.json({id, homeownerUrl, appraiserUrl});
});

const wss = new WebSocketServer({server, path: '/ws'});

function getBuddy(room, role){
    if(!room) 
        return null;

    return role === 'homeowner' ? room.appraiser : room.homeowner;
}

wss.on('connection', (ws) => {
    ws.meta = {roomId: null, role: null};

    ws.on('message', (raw) => {
        let msg;

        try{
            msg = JSON.parse(raw);
        }catch{
            return ws.send(JSON.stringify({type: 'error', reason: 'bad_json'}));
        }

        if(msg.type === 'join') {
            const {roomId, role} = msg;

            if(!roomId || !['homeowner', 'appraiser'].includes(role)){
                return ws.send(JSON.stringify({type: 'error', reason: 'bad_join'}));
            }

            let room = rooms.get(roomId);

            if(!room){
                room = {homeowner: null, appraiser: null};
                rooms.set(roomId, room);
            }

            if(role === 'homeowner'){
                room.homeowner = ws;
            }else{
                room.appraiser = ws;
            }

            ws.meta = {roomId, role};

            ws.send(JSON.stringify({type: 'joined', role, roomId}));

            const buddy = getBuddy(room, role);

            if(buddy && buddy.readyState === buddy.OPEN){
                ws.send(JSON.stringify({type: 'peer-ready', peer: buddy.meta.role}));
                buddy.send(JSON.stringify({type: 'peer-ready', peer: role}));
            }
            return;
        }

        if(msg.type === 'signal'){
            const {roomId, data} = msg;
            const room = rooms.get(roomId);

            if(!room)
                return;

            const buddy = getBuddy(room, ws.meta.role);
            
            if(buddy && buddy.readyState === buddy.OPEN){
                buddy.send(JSON.stringify({type: 'signal', from: ws.meta.role, data}));
            }
            return;
        }

        if(msg.type === "capture_request"){
            const {roomId} = msg;
            const room = rooms.get(roomId);

            if(!room)
                return;

            const buddy = getBuddy(room, ws.meta.role);

            if(buddy && buddy.readyState === buddy.OPEN){
                buddy.send(JSON.stringify({type: 'capture_request'}));
            }
            return;
        }

        if(msg.type === "photo_uploaded"){
            const {roomId} = msg;
            const room = rooms.get(roomId);
            
            if(!room)
                return;

            const buddy = getBuddy(room, ws.meta.role);

            if(buddy && buddy.readyState === buddy.OPEN){
                buddy.send(JSON.stringify({type: "photo_uploaded"}));
            }
        }
    });

    ws.on('close', () => {
        const {roomId, role} = ws.meta || {};

        if(!roomId || !role) return;

        const room = rooms.get(roomId);

        if(!room) return;

        if(role === 'homeowner' && room.homeowner === ws)
            room.homeowner = null;

        if(role === 'appraiser' && room.appraiser === ws)
            room.appraiser = null;

        const buddy = getBuddy(room, role);

        if(buddy && buddy.readyState === buddy.OPEN)
            buddy.send(JSON.stringify({type: 'peer-left', peer: role}));

        if(!room.homeowner && !room.appraiser) 
            rooms.delete(roomId);

        const dir = path.join(captureDir, roomId);

        if(fs.existsSync(dir)){
            fs.rmSync(dir, {recursive: true, force: true});
            console.log("Cleaned up: ", dir);
        }
    });
});

app.post("/upload", upload.single("photo"), (req, res) => {
    const roomId = req.query.roomId || "default";
    const{latitude, longitude, accuracy} = req.body;
    const photoUrl = `/captures/${roomId}/${req.file.filename}`;

    console.log("Photo saved:", req.file.path);
    console.log("Location:", latitude, longitude, "±", accuracy, "m");

    const room = rooms.get(roomId);
    if(room) {
        const buddy = getBuddy(room, "homeowner");
        if(buddy && buddy.readyState === buddy.OPEN){
            buddy.send(JSON.stringify({type: "photo_uploaded", url: photoUrl}));
        }
    }

    res.json({ok: true, url: photoUrl});
})

server.listen(3000, () => {
    console.log(`Server running at https://192.168.86.100:3000`);
    console.log(`Also accessible at https://localhost:3000`);
});
