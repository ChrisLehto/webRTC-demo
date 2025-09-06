const path = require('path');
const fs = require('fs');
const express = require('express');
const https = require('https');
const {WebSocketServer} = require('ws');
const crypto = require('crypto');

const app = express();
app.use(express.json({limit: '25mb'}));
app.use(express.static(path.join(__dirname, 'public')));

const captureDir = path.join(__dirname, 'capture');

if(!fs.existsSync(captureDir))
    fs.mkdirSync(captureDir);

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

app.post('/api/snap', (req, res) => {
    try{
        const{roomId, imageBase64} = req.body || {};
        if(!roomId || !imageBase64){
            return res.status(400).json({ok: false, error: 'roomId and imageBase64 required'}); 
        }
        const buf = Buffer.from(imageBase64, 'base64');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `capture-${roomId}-${ts}.jpg`;
        
        fs.writeFileSync(path.join(captureDir, filename), buf);
        return res.json({ok: true, url: `/captures/${filename}`, filename});
    }catch(e){
        console.error('snap error', e);
        return res.status(500).json({ok: false, error: 'internal_error'});
    }
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
    });
});

server.listen(3000, () => {
    console.log(`Server running at https://192.168.86.100:3000`);
    console.log(`Also accessible at https://localhost:3000`);
});
