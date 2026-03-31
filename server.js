const express = require('express');
const cors = require('cors');

const app = express(); // ЭТОЙ СТРОКИ НЕ ХВАТАЛО!

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Хранилища
const users = new Map();
const teams = new Map();
const matches = new Map();
const tournaments = new Map();
const TOURNAMENT_ADMINS = new Set();
const ADMIN_USERNAME = 'memorypatapim';

// ==================== АВТОРИЗАЦИЯ ====================
app.post('/api/auth/telegram', (req, res) => {
    const { id, username, first_name, photo_url } = req.body;
    
    if (!users.has(id)) {
        users.set(id, {
            telegramId: id,
            username: username || first_name,
            isAdmin: username === ADMIN_USERNAME,
            isTournamentAdmin: TOURNAMENT_ADMINS.has(id),
            avatarUrl: photo_url || null,
            bannerUrl: null,
            description: '🎮 Игрок в Brawl Stars',
            links: [],
            isBanned: false,
            createdAt: new Date()
        });
    }
    
    const user = users.get(id);
    
    if (user.isBanned) {
        return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    }
    
    const token = Buffer.from(`${id}:${Date.now()}`).toString('base64');
    res.json({ 
        success: true, 
        token, 
        user: users.get(id),
        isAdmin: user.isAdmin,
        isTournamentAdmin: user.isTournamentAdmin || false
    });
});

// ==================== ПРОФИЛЬ ====================
app.get('/api/profile/:id', (req, res) => {
    const user = users.get(parseInt(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

app.put('/api/profile/:id', (req, res) => {
    const user = users.get(parseInt(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    Object.assign(user, req.body);
    users.set(user.telegramId, user);
    res.json({ success: true, user });
});

// ==================== КОМАНДЫ ====================
app.get('/api/teams', (req, res) => {
    res.json(Array.from(teams.values()));
});

app.get('/api/teams/:id', (req, res) => {
    const team = teams.get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
});

app.post('/api/teams', (req, res) => {
    const { name, ownerId, description } = req.body;
    const id = Date.now().toString();
    const team = {
        id,
        name,
        ownerId,
        description: description || '',
        avatarUrl: null,
        bannerUrl: null,
        socialLinks: {},
        members: [ownerId],
        createdAt: new Date()
    };
    teams.set(id, team);
    res.json(team);
});

app.post('/api/teams/:id/join', (req, res) => {
    const team = teams.get(req.params.id);
    const { userId } = req.body;
    if (!team.members.includes(userId)) {
        team.members.push(userId);
        teams.set(req.params.id, team);
    }
    res.json({ success: true, team });
});

app.put('/api/teams/:id', (req, res) => {
    const team = teams.get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    Object.assign(team, req.body);
    teams.set(req.params.id, team);
    res.json({ success: true, team });
});

// ==================== МАТЧИ ====================
app.get('/api/matches', (req, res) => {
    res.json(Array.from(matches.values()));
});

app.post('/api/matches', (req, res) => {
    const { createdBy } = req.body;
    const match = {
        id: Date.now().toString(),
        createdBy,
        gameCode: null,
        participants: [createdBy],
        status: 'waiting',
        createdAt: new Date()
    };
    matches.set(match.id, match);
    res.json(match);
});

app.post('/api/matches/:id/join', (req, res) => {
    const match = matches.get(req.params.id);
    const { userId } = req.body;
    if (!match.participants.includes(userId) && match.participants.length < 6) {
        match.participants.push(userId);
        if (match.participants.length === 6) match.status = 'ready';
        matches.set(req.params.id, match);
    }
    res.json({ success: true, match });
});

app.post('/api/matches/:id/code', (req, res) => {
    const match = matches.get(req.params.id);
    const { userId, gameCode } = req.body;
    if (match.createdBy !== userId) {
        return res.status(403).json({ error: 'Only creator can set code' });
    }
    match.gameCode = gameCode;
    matches.set(req.params.id, match);
    res.json({ success: true, gameCode });
});

// ==================== ТУРНИРЫ ====================
app.get('/api/tournaments', (req, res) => {
    res.json(Array.from(tournaments.values()));
});

app.get('/api/tournaments/:id/full', (req, res) => {
    const tournament = tournaments.get(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    res.json(tournament);
});

app.post('/api/tournaments', (req, res) => {
    const { createdBy, title, description, prizePool } = req.body;
    const tournament = {
        id: Date.now().toString(),
        createdBy,
        title,
        description: description || '',
        prizePool: prizePool || '🏆 Победитель получает славу!',
        bannerUrl: null,
        status: 'registration',
        teams: [],
        matches: [],
        predictions: [],
        createdAt: new Date()
    };
    tournaments.set(tournament.id, tournament);
    res.json(tournament);
});

app.post('/api/tournaments/:id/register-team', (req, res) => {
    const tournament = tournaments.get(req.params.id);
    const { teamId } = req.body;
    if (!tournament.teams.includes(teamId)) {
        tournament.teams.push(teamId);
        tournaments.set(req.params.id, tournament);
    }
    res.json({ success: true });
});

// ==================== АДМИНКА ====================
function isAdmin(req, res, next) {
    const { userId } = req.body;
    const user = users.get(parseInt(userId));
    if (!user || user.username !== ADMIN_USERNAME) {
        return res.status(403).json({ error: 'Доступ только для админа' });
    }
    next();
}

app.get('/api/admin/users', isAdmin, (req, res) => {
    const allUsers = Array.from(users.values()).map(u => ({
        telegramId: u.telegramId,
        username: u.username,
        isBanned: u.isBanned,
        createdAt: u.createdAt
    }));
    res.json(allUsers);
});

app.post('/api/admin/ban', isAdmin, (req, res) => {
    const { targetId, ban } = req.body;
    const user = users.get(parseInt(targetId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.isBanned = ban;
    users.set(user.telegramId, user);
    res.json({ success: true });
});

app.post('/api/admin/delete-user', isAdmin, (req, res) => {
    const { targetId } = req.body;
    users.delete(parseInt(targetId));
    res.json({ success: true });
});

app.get('/api/admin/teams', isAdmin, (req, res) => {
    res.json(Array.from(teams.values()));
});

app.post('/api/admin/delete-team', isAdmin, (req, res) => {
    const { teamId } = req.body;
    teams.delete(teamId);
    res.json({ success: true });
});

app.get('/api/admin/tournaments', isAdmin, (req, res) => {
    res.json(Array.from(tournaments.values()));
});

app.post('/api/admin/delete-tournament', isAdmin, (req, res) => {
    const { tournamentId } = req.body;
    tournaments.delete(tournamentId);
    res.json({ success: true });
});

app.get('/api/admin/matches', isAdmin, (req, res) => {
    res.json(Array.from(matches.values()));
});

app.post('/api/admin/delete-match', isAdmin, (req, res) => {
    const { matchId } = req.body;
    matches.delete(matchId);
    res.json({ success: true });
});

app.get('/api/admin/stats', isAdmin, (req, res) => {
    res.json({
        totalUsers: users.size,
        totalTeams: teams.size,
        totalMatches: matches.size,
        totalTournaments: tournaments.size,
        bannedUsers: Array.from(users.values()).filter(u => u.isBanned).length
    });
});

app.post('/api/admin/tournament-status', isAdmin, (req, res) => {
    const { tournamentId, status } = req.body;
    const tournament = tournaments.get(tournamentId);
    if (tournament) {
        tournament.status = status;
        tournaments.set(tournamentId, tournament);
    }
    res.json({ success: true });
});

// ==================== ЗАПУСК ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Nulls Community API running on port ${PORT}`);
});
