import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

// Serve static files from the dist directory
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '../dist')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

const raffles = new Map();
const MAX_RAFFLES = 5;
const MAX_PARTICIPANTS = 100;
const SYSTEM_ADMIN_KEY = 'admin123';

// Raffle Expiration Cleanup (Every 5 minutes)
setInterval(() => {
    const now = Date.now();
    const EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes

    for (const [raffleId, raffle] of raffles.entries()) {
        if (now - raffle.createdAt > EXPIRATION_TIME) {
            console.log(`Raffle expired and deleted: ${raffleId}`);
            io.to(raffleId).emit('error', 'Çekilişin süresi doldu ve kapatıldı.');
            raffles.delete(raffleId);
        }
    }
}, 5 * 60 * 1000);

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send initial raffle list
    socket.on('search_raffles', (query) => {
        const results = Array.from(raffles.values())
            .filter(r => r.raffleId.toLowerCase().includes(query.toLowerCase()) && r.status === 'waiting')
            .map(r => ({ raffleId: r.raffleId, participantCount: r.participants.length }));
        socket.emit('search_results', results);
    });

    socket.on('create_raffle', ({ raffleId, password, adminName }) => {
        if (raffles.size >= MAX_RAFFLES) {
            socket.emit('error', `Sistemde şu an çok fazla çekiliş var. Limit: ${MAX_RAFFLES}`);
            return;
        }

        if (raffles.has(raffleId)) {
            socket.emit('error', 'Bu çekiliş ismi zaten alınmış.');
            return;
        }

        const raffleData = {
            raffleId,
            password,
            adminId: socket.id,
            participants: [{ id: socket.id, name: adminName }],
            status: 'waiting',
            results: null,
            createdAt: Date.now(),
        };

        raffles.set(raffleId, raffleData);
        socket.join(raffleId);
        socket.emit('raffle_created', raffleData);
        console.log(`Raffle created: ${raffleId} by ${adminName}`);
    });

    socket.on('join_raffle', ({ raffleId, password, participantName }) => {
        const raffle = raffles.get(raffleId);

        if (!raffle) {
            socket.emit('error', 'Çekiliş bulunamadı.');
            return;
        }

        if (raffle.password !== password) {
            socket.emit('error', 'Hatalı şifre.');
            return;
        }

        if (raffle.status !== 'waiting') {
            socket.emit('error', 'Çekiliş çoktan başladı.');
            return;
        }

        if (raffle.participants.length >= MAX_PARTICIPANTS) {
            socket.emit('error', `Bu çekiliş doldu. Maksimum katılımcı: ${MAX_PARTICIPANTS}`);
            return;
        }

        if (raffle.participants.some(p => p.name === participantName)) {
            socket.emit('error', 'Bu isim çekilişte zaten var.');
            return;
        }

        const newParticipant = { id: socket.id, name: participantName };
        raffle.participants.push(newParticipant);
        socket.join(raffleId);

        socket.emit('raffle_joined', {
            raffleId,
            participants: raffle.participants,
            adminId: raffle.adminId
        });

        io.to(raffleId).emit('update_participants', raffle.participants);
    });

    socket.on('kick_participant', ({ raffleId, participantId }) => {
        const raffle = raffles.get(raffleId);
        if (!raffle || raffle.adminId !== socket.id) return;

        const participantIndex = raffle.participants.findIndex(p => p.id === participantId);
        if (participantIndex !== -1 && participantId !== raffle.adminId) {
            const kickedParticipant = raffle.participants[participantIndex];
            raffle.participants.splice(participantIndex, 1);

            io.to(participantId).emit('kicked', 'Çekiliş yöneticisi tarafından çıkarıldınız.');
            io.to(raffleId).emit('update_participants', raffle.participants);
            console.log(`${kickedParticipant.name} kicked from raffle: ${raffleId}`);
        }
    });

    socket.on('start_raffle', (raffleId) => {
        const raffle = raffles.get(raffleId);
        if (!raffle || raffle.adminId !== socket.id) return;
        if (raffle.participants.length < 2) {
            socket.emit('error', 'Çekiliş için en az 2 kişi gerekiyor.');
            return;
        }

        raffle.status = 'drawing';
        io.to(raffleId).emit('raffle_started');

        setTimeout(() => {
            const results = performRaffle(raffle.participants);
            raffle.results = results;
            raffle.status = 'finished';

            raffle.participants.forEach(p => {
                const target = results.find(r => r.from.id === p.id).to;
                io.to(p.id).emit('raffle_result', { targetName: target.name });
            });

            console.log(`Raffle finished: ${raffleId}`);
        }, 5000);
    });

    // System Admin Events
    socket.on('system_admin_login', (key) => {
        if (key === SYSTEM_ADMIN_KEY) {
            const allRaffles = Array.from(raffles.values()).map(r => ({
                raffleId: r.raffleId,
                participantCount: r.participants.length,
                status: r.status,
                createdAt: r.createdAt
            }));
            socket.emit('system_admin_authenticated', allRaffles);
        } else {
            socket.emit('error', 'Hatalı sistem admin anahtarı.');
        }
    });

    socket.on('system_admin_delete', (raffleId) => {
        if (raffles.has(raffleId)) {
            io.to(raffleId).emit('error', 'Bu çekiliş sistem yöneticisi tarafından kapatıldı.');
            raffles.delete(raffleId);
            socket.emit('system_admin_action_success', 'Çekiliş silindi.');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        for (const [raffleId, raffle] of raffles.entries()) {
            const participantIndex = raffle.participants.findIndex(p => p.id === socket.id);

            if (participantIndex !== -1) {
                // Remove the participant
                raffle.participants.splice(participantIndex, 1);
                console.log(`User ${socket.id} removed from raffle: ${raffleId}`);

                if (raffle.participants.length === 0) {
                    // Delete raffle if empty
                    raffles.delete(raffleId);
                    console.log(`Raffle ${raffleId} deleted (empty).`);
                } else {
                    // Reassign admin if the disconnected user was the admin
                    if (raffle.adminId === socket.id) {
                        raffle.adminId = raffle.participants[0].id;
                        console.log(`New admin for ${raffleId}: ${raffle.adminId}`);
                    }
                    // Notify remaining participants
                    io.to(raffleId).emit('update_participants', raffle.participants);
                    // Also emit current raffle data to sync adminId
                    io.to(raffleId).emit('raffle_updated', {
                        participants: raffle.participants,
                        adminId: raffle.adminId
                    });
                }
            }
        }
    });
});

function performRaffle(participants) {
    let receivers = [...participants];
    let results = [];
    let success = false;

    while (!success) {
        receivers = shuffle([...participants]);
        success = true;
        for (let i = 0; i < participants.length; i++) {
            if (participants[i].id === receivers[i].id) {
                success = false;
                break;
            }
        }
    }

    for (let i = 0; i < participants.length; i++) {
        results.push({
            from: participants[i],
            to: receivers[i]
        });
    }

    return results;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const PORT = process.env.PORT || 3001;

// Handle SPA routing - send all other requests to index.html
app.get(/.*/, (req, res) => {
    res.sendFile('index.html', { root: path.join(__dirname, '../dist') });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
