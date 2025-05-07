const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let videoWaitingQueue = [];

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('find-video-partner', () => {
        if (videoWaitingQueue.length > 0) {
            const partner = videoWaitingQueue.shift();
            const room = `${socket.id}#${partner.id}`;

            socket.join(room);
            partner.join(room);

            io.to(socket.id).emit('video-partner-found', { room });
            io.to(partner.id).emit('video-partner-found', { room });
        } else {
            videoWaitingQueue.push(socket);
        }
    });

    socket.on('offer', ({ room, offer }) => {
        socket.to(room).emit('offer', offer);
    });

    socket.on('answer', ({ room, answer }) => {
        socket.to(room).emit('answer', answer);
    });

    socket.on('ice-candidate', ({ room, candidate }) => {
        socket.to(room).emit('ice-candidate', candidate);
    });

    socket.on('skip', ({ room }) => {
        socket.to(room).emit('exit');
        io.socketsLeave(room);
        videoWaitingQueue = videoWaitingQueue.filter(s => s.id !== socket.id);
    });

    socket.on('exit', ({ room }) => {
        socket.to(room).emit('exit');
        io.socketsLeave(room);
        videoWaitingQueue = videoWaitingQueue.filter(s => s.id !== socket.id);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        videoWaitingQueue = videoWaitingQueue.filter(s => s.id !== socket.id);
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
