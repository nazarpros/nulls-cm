const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Хранилища
const users = new Map();
const teams = new Map();
const matches = new Map();
const tournaments = new Map();
const TOURNAMENT_ADMINS = new Set();
const ADMINS = new Set();
const ADMIN_SECRET = 'ghosty';

// ==================== АВТОРИЗАЦИЯ ====================
app.post('/api/auth/telegram', (req, res) => {
    const { id, username, first_name, photo_url } = req.body;
    
    const isUserAdmin = ADMINS.has(id);
    
    if (!users.has(id)) {
        users.set(id, {
            telegramId: id,
            username: username || first_name,
            isAdmin: isUserAdmin,
            isTournamentAdmin: TOURNAMENT_ADMINS.has(id),
            avatarUrl: photo_url || null,
            bannerUrl: null,
            description: 'Игрок в Brawl Stars',
            teamId: null,
            links: [],
            isBanned: false,
            createdAt: new Date()
        });
    } else {
        const user = users.get(id);
        user.isAdmin = isUserAdmin;
        users.set(id, user);
    }
    
    const user = users.get(id);
    
    if (user.isBanned) {
        return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    }
    
    const token = Buffer.from(`${id}:${Date.now()}`).toString('base64');
    res.json({ 
        success: true, 
        token, 
        user,
        isAdmin: user.isAdmin,
        isTournamentAdmin: user.isTournamentAdmin || false
    });
});

// Стать админом
app.post('/api/become-admin', (req, res) => {
    const { userId, secretName } = req.body;
    const user = users.get(parseInt(userId));
    
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    if (secretName === ADMIN_SECRET) {
        ADMINS.add(parseInt(userId));
        user.isAdmin = true;
        users.set(userId, user);
        return res.json({ success: true, message: 'Теперь вы админ!' });
    }
    
    res.json({ success: false, message: 'Неверное секретное имя' });
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

// Получить команду пользователя
app.get('/api/user/team/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const user = users.get(userId);
    
    if (!user || !user.teamId) {
        return res.json({ team: null });
    }
    
    const team = teams.get(user.teamId);
    res.json({ team: team || null });
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
    
    // Обновляем пользователя
    const user = users.get(parseInt(ownerId));
    if (user) {
        user.teamId = id;
        users.set(ownerId, user);
    }
    
    res.json(team);
});

app.post('/api/teams/:id/join', (req, res) => {
    const team = teams.get(req.params.id);
    const { userId } = req.body;
    
    if (!team.members.includes(userId) && team.members.length < 6) {
        team.members.push(userId);
        teams.set(req.params.id, team);
        
        // Обновляем пользователя
        const user = users.get(parseInt(userId));
        if (user) {
            user.teamId = req.params.id;
            users.set(userId, user);
        }
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

// ==================== МАТЧИ МЕЖДУ КОМАНДАМИ 2v2 ====================
app.get('/api/matches', (req, res) => {
    res.json(Array.from(matches.values()));
});

// Создать матч (только для команд)
app.post('/api/matches', (req, res) => {
    const { teamId, createdBy } = req.body;
    const team = teams.get(teamId);
    
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });
    
    const match = {
        id: Date.now().toString(),
        team1: teamId,
        team2: null,
        team1Name: team.name,
        team2Name: null,
        createdBy,
        gameCode: null,
        status: 'searching', // searching, ready, finished
        winner: null,
        createdAt: new Date()
    };
    matches.set(match.id, match);
    res.json(match);
});

// Поиск матча (присоединиться как вторая команда)
app.post('/api/matches/:id/join', (req, res) => {
    const match = matches.get(req.params.id);
    const { teamId } = req.body;
    const team = teams.get(teamId);
    
    if (!match) return res.status(404).json({ error: 'Матч не найден' });
    if (match.status !== 'searching') return res.status(400).json({ error: 'Матч уже начат' });
    if (match.team2) return res.status(400).json({ error: 'Матч уже занят' });
    if (match.team1 === teamId) return res.status(400).json({ error: 'Нельзя играть против себя' });
    
    match.team2 = teamId;
    match.team2Name = team.name;
    match.status = 'ready';
    matches.set(req.params.id, match);
    
    res.json({ success: true, match });
});

// Отправить код игры
app.post('/api/matches/:id/code', (req, res) => {
    const match = matches.get(req.params.id);
    const { teamId, gameCode } = req.body;
    
    if (!match) return res.status(404).json({ error: 'Матч не найден' });
    if (match.team1 !== teamId && match.team2 !== teamId) {
        return res.status(403).json({ error: 'Только участники матча могут отправить код' });
    }
    
    match.gameCode = gameCode;
    matches.set(req.params.id, match);
    res.json({ success: true, gameCode });
});

// Завершить матч
app.post('/api/matches/:id/finish', (req, res) => {
    const match = matches.get(req.params.id);
    const { teamId, winner } = req.body;
    
    if (!match) return res.status(404).json({ error: 'Матч не найден' });
    if (match.team1 !== teamId && match.team2 !== teamId) {
        return res.status(403).json({ error: 'Только участники матча могут завершить' });
    }
    
    match.status = 'finished';
    match.winner = winner;
    matches.set(req.params.id, match);
    res.json({ success: true, match });
});

// Удалить матч (только создатель или админ)
app.post('/api/matches/:id/delete', (req, res) => {
    const match = matches.get(req.params.id);
    const { userId } = req.body;
    const user = users.get(parseInt(userId));
    
    if (!match) return res.status(404).json({ error: 'Матч не найден' });
    if (match.createdBy !== userId && !user?.isAdmin) {
        return res.status(403).json({ error: 'Нет прав для удаления' });
    }
    
    matches.delete(req.params.id);
    res.json({ success: true });
});

// ==================== ТУРНИРЫ ====================
app.get('/api/tournaments', (req, res) => {
    res.json(Array.from(tournaments.values()));
});

app.post('/api/tournaments', (req, res) => {
    const { createdBy, title, description } = req.body;
    const tournament = {
        id: Date.now().toString(),
        createdBy,
        title,
        description: description || '',
        bannerUrl: null,
        status: 'registration',
        teams: [],
        createdAt: new Date()
    };
    tournaments.set(tournament.id, tournament);
    res.json(tournament);
});

app.post('/api/tournaments/:id/register', (req, res) => {
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
    if (!user || !user.isAdmin) {
        return res.status(403).json({ error: 'Доступ только для админа' });
    }
    next();
}

app.get('/api/admin/users', isAdmin, (req, res) => {
    const allUsers = Array.from(users.values()).map(u => ({
        telegramId: u.telegramId,
        username: u.username,
        isBanned: u.isBanned,
        teamId: u.teamId,
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

app.get('/api/admin/matches', isAdmin, (req, res) => {
    res.json(Array.from(matches.values()));
});

app.post('/api/admin/delete-match', isAdmin, (req, res) => {
    const { matchId } = req.body;
    matches.delete(matchId);
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

app.get('/api/admin/stats', isAdmin, (req, res) => {
    res.json({
        totalUsers: users.size,
        totalTeams: teams.size,
        totalMatches: matches.size,
        totalTournaments: tournaments.size,
        bannedUsers: Array.from(users.values()).filter(u => u.isBanned).length
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Nulls Community API running on port ${PORT}`);
});
