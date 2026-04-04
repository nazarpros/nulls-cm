const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,
                username TEXT,
                avatar_url TEXT,
                banner_url TEXT,
                description TEXT,
                team_id TEXT,
                is_admin BOOLEAN DEFAULT false,
                is_tournament_admin BOOLEAN DEFAULT false,
                is_banned BOOLEAN DEFAULT false,
                prediction_points INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT,
                owner_id BIGINT,
                description TEXT,
                avatar_url TEXT,
                banner_url TEXT,
                members TEXT[],
                pending_members TEXT[],
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS matches (
                id TEXT PRIMARY KEY,
                team1 TEXT,
                team2 TEXT,
                team1_name TEXT,
                team2_name TEXT,
                created_by BIGINT,
                game_code TEXT,
                status TEXT,
                winner TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS match_queue (
                id SERIAL PRIMARY KEY,
                team_id TEXT NOT NULL,
                team_name TEXT,
                joined_at TIMESTAMP DEFAULT NOW(),
                status TEXT DEFAULT 'waiting'
            );
            
            CREATE TABLE IF NOT EXISTS team_invites (
                id SERIAL PRIMARY KEY,
                team_id TEXT NOT NULL,
                player_id BIGINT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(team_id, player_id)
            );
            
            CREATE TABLE IF NOT EXISTS tournaments (
                id TEXT PRIMARY KEY,
                title TEXT,
                description TEXT,
                banner_url TEXT,
                avatar_url TEXT,
                status TEXT DEFAULT 'registration',
                teams TEXT[],
                created_by BIGINT,
                owner_id BIGINT,
                prize_pool TEXT,
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS tournament_matches (
                id TEXT PRIMARY KEY,
                tournament_id TEXT,
                team1_id TEXT,
                team2_id TEXT,
                team1_name TEXT,
                team2_name TEXT,
                round INTEGER,
                score TEXT,
                winner_id TEXT,
                status TEXT DEFAULT 'scheduled',
                prediction_deadline TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS predictions (
                id SERIAL PRIMARY KEY,
                match_id TEXT,
                user_id BIGINT,
                predicted_winner_id TEXT,
                points_awarded INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS prediction_points INTEGER DEFAULT 0;`);
        await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS banner_url TEXT;`);
        await pool.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
        
        console.log('✅ Database initialized');
    } catch (err) {
        console.error('Database init error:', err);
    }
}

initDB();

// ==================== АВТОРИЗАЦИЯ ====================
app.post('/api/auth/telegram', async (req, res) => {
    const { id, username, first_name, photo_url } = req.body;
    try {
        const existing = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [id]);
        if (existing.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (telegram_id, username, avatar_url, is_admin) VALUES ($1, $2, $3, $4)',
                [id, username || first_name, photo_url || null, username === 'memorypatapim']
            );
        }
        const user = (await pool.query('SELECT * FROM users WHERE telegram_id = $1', [id])).rows[0];
        if (user.is_banned) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
        const token = Buffer.from(`${id}:${Date.now()}`).toString('base64');
        res.json({ success: true, token, user, isAdmin: user.is_admin, isTournamentAdmin: user.is_tournament_admin });
    } catch (err) {
        console.error('Auth error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/become-admin', async (req, res) => {
    const { userId, secretName } = req.body;
    if (secretName === 'ghosty') {
        await pool.query('UPDATE users SET is_admin = true WHERE telegram_id = $1', [userId]);
        res.json({ success: true, message: 'Теперь вы администратор' });
    } else {
        res.json({ success: false, message: 'Неверное имя' });
    }
});

// ==================== ПРОФИЛЬ ====================
app.get('/api/profile/:id', async (req, res) => {
    const user = (await pool.query('SELECT * FROM users WHERE telegram_id = $1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    let team = null;
    if (user.team_id) {
        team = (await pool.query('SELECT id, name, avatar_url FROM teams WHERE id = $1', [user.team_id])).rows[0];
    }
    
    res.json({ ...user, team });
});

app.put('/api/profile/:id', async (req, res) => {
    const { username, description, avatar_url, banner_url } = req.body;
    await pool.query(
        'UPDATE users SET username = COALESCE($1, username), description = COALESCE($2, description), avatar_url = COALESCE($3, avatar_url), banner_url = COALESCE($4, banner_url) WHERE telegram_id = $5',
        [username, description, avatar_url, banner_url, req.params.id]
    );
    res.json({ success: true });
});

// ==================== КОМАНДЫ ====================
app.get('/api/teams', async (req, res) => {
    const teams = (await pool.query('SELECT * FROM teams ORDER BY created_at DESC')).rows;
    res.json(teams);
});

app.get('/api/teams/:id', async (req, res) => {
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
    if (!team) return res.status(404).json({ error: 'Team not found' });
    
    const membersWithInfo = [];
    for (const memberId of team.members || []) {
        const user = (await pool.query('SELECT telegram_id, username, avatar_url FROM users WHERE telegram_id = $1', [memberId])).rows[0];
        if (user) membersWithInfo.push(user);
    }
    
    res.json({ ...team, membersInfo: membersWithInfo });
});

app.post('/api/teams', async (req, res) => {
    const { name, ownerId, description } = req.body;
    const id = Date.now().toString();
    await pool.query(
        'INSERT INTO teams (id, name, owner_id, description, members, pending_members) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, name, ownerId, description || '', [ownerId.toString()], []]
    );
    await pool.query('UPDATE users SET team_id = $1 WHERE telegram_id = $2', [id, ownerId]);
    res.json({ id, name, ownerId, description, members: [ownerId], pending_members: [] });
});

app.post('/api/teams/:id/request-join', async (req, res) => {
    const { userId } = req.body;
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });
    if (team.members.includes(userId.toString())) return res.status(400).json({ error: 'Вы уже в команде' });
    if (team.pending_members?.includes(userId.toString())) return res.status(400).json({ error: 'Запрос уже отправлен' });
    
    const pending = team.pending_members || [];
    pending.push(userId.toString());
    await pool.query('UPDATE teams SET pending_members = $1 WHERE id = $2', [pending, req.params.id]);
    res.json({ success: true, message: 'Запрос отправлен владельцу' });
});

app.post('/api/teams/:id/accept-member', async (req, res) => {
    const { userId, ownerId } = req.body;
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });
    if (team.owner_id != ownerId) return res.status(403).json({ error: 'Только владелец' });
    if (team.members.length >= 10) return res.status(400).json({ error: 'Команда полная' });
    
    team.members.push(userId.toString());
    const pending = (team.pending_members || []).filter(id => id != userId);
    await pool.query('UPDATE teams SET members = $1, pending_members = $2 WHERE id = $3', [team.members, pending, req.params.id]);
    await pool.query('UPDATE users SET team_id = $1 WHERE telegram_id = $2', [req.params.id, userId]);
    res.json({ success: true });
});

app.post('/api/teams/:id/reject-member', async (req, res) => {
    const { userId, ownerId } = req.body;
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });
    if (team.owner_id != ownerId) return res.status(403).json({ error: 'Только владелец' });
    
    const pending = (team.pending_members || []).filter(id => id != userId);
    await pool.query('UPDATE teams SET pending_members = $1 WHERE id = $2', [pending, req.params.id]);
    res.json({ success: true });
});

app.get('/api/teams/:id/requests', async (req, res) => {
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const pending = team.pending_members || [];
    const users = [];
    for (const id of pending) {
        const user = (await pool.query('SELECT telegram_id, username, avatar_url FROM users WHERE telegram_id = $1', [id])).rows[0];
        if (user) users.push(user);
    }
    res.json(users);
});

app.post('/api/teams/:id/leave', async (req, res) => {
    const { userId } = req.body;
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });
    if (team.owner_id == userId) return res.status(403).json({ error: 'Создатель не может покинуть команду' });
    const members = team.members.filter(m => m != userId);
    await pool.query('UPDATE teams SET members = $1 WHERE id = $2', [members, req.params.id]);
    await pool.query('UPDATE users SET team_id = NULL WHERE telegram_id = $1', [userId]);
    res.json({ success: true });
});

app.post('/api/teams/:id/delete', async (req, res) => {
    const { userId } = req.body;
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });
    const user = (await pool.query('SELECT is_admin FROM users WHERE telegram_id = $1', [userId])).rows[0];
    if (team.owner_id != userId && !user?.is_admin) return res.status(403).json({ error: 'Нет прав' });
    for (const member of team.members) await pool.query('UPDATE users SET team_id = NULL WHERE telegram_id = $1', [member]);
    await pool.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});

app.put('/api/teams/:id', async (req, res) => {
    const { name, description, avatar_url, banner_url } = req.body;
    await pool.query(
        'UPDATE teams SET name = COALESCE($1, name), description = COALESCE($2, description), avatar_url = COALESCE($3, avatar_url), banner_url = COALESCE($4, banner_url) WHERE id = $5',
        [name, description, avatar_url, banner_url, req.params.id]
    );
    res.json({ success: true });
});

app.get('/api/user/team/:userId', async (req, res) => {
    const user = (await pool.query('SELECT team_id FROM users WHERE telegram_id = $1', [req.params.userId])).rows[0];
    if (!user?.team_id) return res.json({ team: null });
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [user.team_id])).rows[0];
    res.json({ team: team || null });
});

app.get('/api/search/teams', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    const teams = (await pool.query('SELECT * FROM teams WHERE name ILIKE $1 LIMIT 20', [`%${q}%`])).rows;
    res.json(teams);
});

// Поиск игроков
app.get('/api/search/users', async (req, res) => {
    const { q, userId } = req.query;
    if (!q) return res.json([]);
    const users = (await pool.query('SELECT telegram_id, username, avatar_url, prediction_points FROM users WHERE username ILIKE $1 AND telegram_id != $2 LIMIT 20', [`%${q}%`, userId || 0])).rows;
    res.json(users);
});

// Приглашения в команду
app.post('/api/teams/invite', async (req, res) => {
    const { teamId, playerId, inviterId } = req.body;
    const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [teamId])).rows[0];
    if (!team) return res.status(404).json({ error: 'Команда не найдена' });
    if (team.owner_id != inviterId) return res.status(403).json({ error: 'Только создатель может приглашать' });
    
    await pool.query('INSERT INTO team_invites (team_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [teamId, playerId]);
    res.json({ success: true, message: 'Приглашение отправлено' });
});

app.get('/api/teams/invites/:playerId', async (req, res) => {
    const invites = (await pool.query('SELECT ti.*, t.name as team_name FROM team_invites ti JOIN teams t ON ti.team_id = t.id WHERE ti.player_id = $1 AND ti.status = $2', [req.params.playerId, 'pending'])).rows;
    res.json(invites);
});

app.post('/api/teams/invite/:teamId/respond', async (req, res) => {
    const { playerId, accept } = req.body;
    if (accept) {
        await pool.query('UPDATE team_invites SET status = $1 WHERE team_id = $2 AND player_id = $3', ['accepted', req.params.teamId, playerId]);
    } else {
        await pool.query('UPDATE team_invites SET status = $1 WHERE team_id = $2 AND player_id = $3', ['declined', req.params.teamId, playerId]);
    }
    res.json({ success: true });
});

// ==================== МАТЧМЕЙКИНГ (ОЧЕРЕДЬ С КД) ====================
app.post('/api/matchmaking/join', async (req, res) => {
    const { teamId, teamName } = req.body;
    try {
        const existing = await pool.query('SELECT * FROM match_queue WHERE team_id = $1 AND status = $2', [teamId, 'waiting']);
        if (existing.rows.length > 0) {
            return res.json({ success: false, message: 'Команда уже в очереди' });
        }
        const activeMatch = await pool.query('SELECT * FROM matches WHERE (team1 = $1 OR team2 = $1) AND status != $2', [teamId, 'finished']);
        if (activeMatch.rows.length > 0) {
            return res.json({ success: false, message: 'Команда уже участвует в матче' });
        }
        
        await pool.query('INSERT INTO match_queue (team_id, team_name) VALUES ($1, $2)', [teamId, teamName]);
        
        const waiting = await pool.query('SELECT * FROM match_queue WHERE status = $1 ORDER BY joined_at ASC', ['waiting']);
        if (waiting.rows.length >= 2) {
            const teamA = waiting.rows[0];
            const teamB = waiting.rows[1];
            const matchId = Date.now().toString();
            await pool.query(
                'INSERT INTO matches (id, team1, team2, team1_name, team2_name, created_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [matchId, teamA.team_id, teamB.team_id, teamA.team_name, teamB.team_name, teamA.team_id, 'ready']
            );
            await pool.query('DELETE FROM match_queue WHERE team_id = $1 OR team_id = $2', [teamA.team_id, teamB.team_id]);
            return res.json({ success: true, matched: true, matchId });
        }
        res.json({ success: true, matched: false });
    } catch (err) {
        console.error('Matchmaking join error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/matchmaking/status/:teamId', async (req, res) => {
    const { teamId } = req.params;
    try {
        const activeMatch = await pool.query('SELECT * FROM matches WHERE (team1 = $1 OR team2 = $1) AND status != $2 ORDER BY created_at DESC LIMIT 1', [teamId, 'finished']);
        if (activeMatch.rows.length > 0) {
            return res.json({ inMatch: true, match: activeMatch.rows[0] });
        }
        const inQueue = await pool.query('SELECT * FROM match_queue WHERE team_id = $1 AND status = $2', [teamId, 'waiting']);
        if (inQueue.rows.length > 0) {
            return res.json({ inQueue: true });
        }
        res.json({ inQueue: false, inMatch: false });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/matchmaking/leave', async (req, res) => {
    const { teamId } = req.body;
    try {
        await pool.query('DELETE FROM match_queue WHERE team_id = $1', [teamId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== МАТЧИ ====================
app.get('/api/matches', async (req, res) => {
    const matches = (await pool.query('SELECT * FROM matches ORDER BY created_at DESC')).rows;
    res.json(matches);
});

app.post('/api/matches/:id/code', async (req, res) => {
    const { gameCode } = req.body;
    await pool.query('UPDATE matches SET game_code = $1 WHERE id = $2', [gameCode, req.params.id]);
    res.json({ success: true });
});

app.post('/api/matches/:id/finish', async (req, res) => {
    const { winner } = req.body;
    await pool.query('UPDATE matches SET status = $1, winner = $2 WHERE id = $3', ['finished', winner, req.params.id]);
    res.json({ success: true });
});

app.post('/api/matches/:id/delete', async (req, res) => {
    const { userId } = req.body;
    const match = (await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id])).rows[0];
    if (!match) return res.status(404).json({ error: 'Матч не найден' });
    const user = (await pool.query('SELECT is_admin FROM users WHERE telegram_id = $1', [userId])).rows[0];
    if (match.created_by != userId && !user?.is_admin) return res.status(403).json({ error: 'Нет прав' });
    await pool.query('DELETE FROM matches WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});

// ==================== ТУРНИРЫ ====================
app.get('/api/tournaments', async (req, res) => {
    const tournaments = (await pool.query('SELECT * FROM tournaments ORDER BY created_at DESC')).rows;
    res.json(tournaments);
});

app.put('/api/tournaments/:id', async (req, res) => {
    const { banner_url, avatar_url } = req.body;
    const updates = [];
    const values = [];
    if (banner_url !== undefined) {
        updates.push(`banner_url = $${values.length + 1}`);
        values.push(banner_url);
    }
    if (avatar_url !== undefined) {
        updates.push(`avatar_url = $${values.length + 1}`);
        values.push(avatar_url);
    }
    values.push(req.params.id);
    if (updates.length > 0) {
        await pool.query(`UPDATE tournaments SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    }
    res.json({ success: true });
});

app.get('/api/tournaments/:id/full', async (req, res) => {
    const tournament = (await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id])).rows[0];
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    const matches = (await pool.query('SELECT * FROM tournament_matches WHERE tournament_id = $1 ORDER BY round, created_at', [req.params.id])).rows;
    for (let match of matches) {
        const predictions = (await pool.query('SELECT * FROM predictions WHERE match_id = $1', [match.id])).rows;
        match.predictions = predictions;
        match.predictionsCount = predictions.length;
        match.team1Votes = predictions.filter(p => p.predicted_winner_id === match.team1_id).length;
        match.team2Votes = predictions.filter(p => p.predicted_winner_id === match.team2_id).length;
    }
    tournament.matches = matches;
    res.json(tournament);
});

app.post('/api/tournaments', async (req, res) => {
    const { createdBy, title, description, prizePool } = req.body;
    const user = (await pool.query('SELECT is_admin, is_tournament_admin FROM users WHERE telegram_id = $1', [createdBy])).rows[0];
    if (!user?.is_admin && !user?.is_tournament_admin) return res.status(403).json({ error: 'Нет прав на создание турнира' });
    
    const id = Date.now().toString();
    await pool.query(`INSERT INTO tournaments (id, title, description, status, teams, created_by, owner_id, prize_pool) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, 
        [id, title, description || '', 'registration', [], createdBy, createdBy, prizePool || null]);
    res.json({ id, title, description, status: 'registration', teams: [], prizePool });
});

app.post('/api/tournaments/:id/status', async (req, res) => {
    const { status, userId } = req.body;
    const tournament = (await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id])).rows[0];
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.owner_id != userId) return res.status(403).json({ error: 'Только владелец' });
    await pool.query('UPDATE tournaments SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
});

app.post('/api/tournaments/:id/register-team', async (req, res) => {
    const { teamId, userId } = req.body;
    const tournament = (await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id])).rows[0];
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status !== 'registration') return res.status(400).json({ error: 'Регистрация закрыта' });
    if (tournament.owner_id != userId) return res.status(403).json({ error: 'Только владелец' });
    if (!tournament.teams.includes(teamId)) {
        tournament.teams.push(teamId);
        await pool.query('UPDATE tournaments SET teams = $1 WHERE id = $2', [tournament.teams, req.params.id]);
    }
    res.json({ success: true });
});

app.post('/api/tournaments/:id/create-match', async (req, res) => {
    const { team1Id, team2Id, round, predictionDeadline, userId } = req.body;
    const matchId = `${req.params.id}_${Date.now()}`;
    const tournament = (await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id])).rows[0];
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.owner_id != userId) return res.status(403).json({ error: 'Только владелец' });
    
    const team1 = (await pool.query('SELECT name FROM teams WHERE id = $1', [team1Id])).rows[0];
    const team2 = (await pool.query('SELECT name FROM teams WHERE id = $1', [team2Id])).rows[0];
    if (!team1 || !team2) return res.status(404).json({ error: 'Команда не найдена' });
    
    await pool.query('INSERT INTO tournament_matches (id, tournament_id, team1_id, team2_id, team1_name, team2_name, round, prediction_deadline) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', 
        [matchId, req.params.id, team1Id, team2Id, team1.name, team2.name, round, predictionDeadline || null]);
    res.json({ success: true, matchId });
});

app.post('/api/tournaments/:id/update-match-result', async (req, res) => {
    const { matchId, score, winnerId, userId } = req.body;
    const tournament = (await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id])).rows[0];
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.owner_id != userId) return res.status(403).json({ error: 'Только владелец' });
    
    await pool.query('UPDATE tournament_matches SET score = $1, winner_id = $2, status = $3 WHERE id = $4', [score, winnerId, 'finished', matchId]);
    
    const predictions = (await pool.query('SELECT * FROM predictions WHERE match_id = $1', [matchId])).rows;
    for (const pred of predictions) {
        if (pred.predicted_winner_id === winnerId && pred.points_awarded === 0) {
            await pool.query('UPDATE users SET prediction_points = prediction_points + 15 WHERE telegram_id = $1', [pred.user_id]);
            await pool.query('UPDATE predictions SET points_awarded = 15 WHERE id = $1', [pred.id]);
        }
    }
    res.json({ success: true });
});

app.post('/api/tournaments/:id/predict', async (req, res) => {
    const { matchId, predictedWinnerId, userId } = req.body;
    const match = (await pool.query('SELECT * FROM tournament_matches WHERE id = $1', [matchId])).rows[0];
    if (!match) return res.status(404).json({ error: 'Матч не найден' });
    if (match.status === 'finished') return res.status(400).json({ error: 'Матч уже завершён' });
    if (match.prediction_deadline && new Date() > new Date(match.prediction_deadline)) return res.status(400).json({ error: 'Время для прогнозов истекло' });
    
    const existing = (await pool.query('SELECT * FROM predictions WHERE match_id = $1 AND user_id = $2', [matchId, userId])).rows[0];
    if (existing) {
        await pool.query('UPDATE predictions SET predicted_winner_id = $1 WHERE id = $2', [predictedWinnerId, existing.id]);
    } else {
        await pool.query('INSERT INTO predictions (match_id, user_id, predicted_winner_id) VALUES ($1, $2, $3)', [matchId, userId, predictedWinnerId]);
    }
    res.json({ success: true });
});

app.post('/api/tournaments/:id/batch-predict', async (req, res) => {
    const { predictions, userId } = req.body;
    const tournamentId = req.params.id;
    
    if (!predictions || !predictions.length) {
        return res.status(400).json({ error: 'Нет прогнозов' });
    }
    
    try {
        for (const pred of predictions) {
            const match = (await pool.query('SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [pred.matchId, tournamentId])).rows[0];
            if (!match) {
                return res.status(404).json({ error: `Матч ${pred.matchId} не найден` });
            }
            if (match.status === 'finished') {
                return res.status(400).json({ error: `Матч ${match.team1_name} vs ${match.team2_name} уже завершён` });
            }
            if (match.prediction_deadline && new Date() > new Date(match.prediction_deadline)) {
                return res.status(400).json({ error: `Время прогнозов на матч ${match.team1_name} vs ${match.team2_name} истекло` });
            }
        }
        
        for (const pred of predictions) {
            const existing = (await pool.query('SELECT * FROM predictions WHERE match_id = $1 AND user_id = $2', [pred.matchId, userId])).rows[0];
            if (existing) {
                await pool.query('UPDATE predictions SET predicted_winner_id = $1 WHERE id = $2', [pred.predictedWinnerId, existing.id]);
            } else {
                await pool.query('INSERT INTO predictions (match_id, user_id, predicted_winner_id) VALUES ($1, $2, $3)', [pred.matchId, userId, pred.predictedWinnerId]);
            }
        }
        
        res.json({ success: true, message: `Сохранено ${predictions.length} прогнозов` });
    } catch (err) {
        console.error('Batch predict error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    const leaderboard = (await pool.query('SELECT telegram_id, username, prediction_points FROM users ORDER BY prediction_points DESC LIMIT 50')).rows;
    res.json(leaderboard);
});

// ==================== АДМИНКА ====================
app.get('/api/admin/users', async (req, res) => {
    const users = (await pool.query('SELECT telegram_id, username, is_banned, team_id, prediction_points, is_admin, is_tournament_admin FROM users')).rows;
    res.json(users);
});

app.post('/api/admin/ban', async (req, res) => {
    const { targetId, ban } = req.body;
    await pool.query('UPDATE users SET is_banned = $1 WHERE telegram_id = $2', [ban, targetId]);
    res.json({ success: true });
});

app.post('/api/admin/delete-user', async (req, res) => {
    const { targetId } = req.body;
    await pool.query('DELETE FROM users WHERE telegram_id = $1', [targetId]);
    res.json({ success: true });
});

app.get('/api/admin/teams', async (req, res) => {
    const teams = (await pool.query('SELECT * FROM teams')).rows;
    res.json(teams);
});

app.post('/api/admin/delete-team', async (req, res) => {
    const { teamId } = req.body;
    await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
    res.json({ success: true });
});

app.get('/api/admin/matches', async (req, res) => {
    const matches = (await pool.query('SELECT * FROM matches')).rows;
    res.json(matches);
});

app.post('/api/admin/delete-match', async (req, res) => {
    const { matchId } = req.body;
    await pool.query('DELETE FROM matches WHERE id = $1', [matchId]);
    res.json({ success: true });
});

app.get('/api/admin/tournaments', async (req, res) => {
    const tournaments = (await pool.query('SELECT * FROM tournaments')).rows;
    res.json(tournaments);
});

app.post('/api/admin/delete-tournament', async (req, res) => {
    const { tournamentId } = req.body;
    await pool.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
    res.json({ success: true });
});

app.get('/api/admin/stats', async (req, res) => {
    const users = (await pool.query('SELECT COUNT(*) FROM users')).rows[0];
    const teams = (await pool.query('SELECT COUNT(*) FROM teams')).rows[0];
    const matches = (await pool.query('SELECT COUNT(*) FROM matches')).rows[0];
    const tournaments = (await pool.query('SELECT COUNT(*) FROM tournaments')).rows[0];
    const banned = (await pool.query('SELECT COUNT(*) FROM users WHERE is_banned = true')).rows[0];
    res.json({ totalUsers: parseInt(users.count), totalTeams: parseInt(teams.count), totalMatches: parseInt(matches.count), totalTournaments: parseInt(tournaments.count), bannedUsers: parseInt(banned.count) });
});

app.post('/api/admin/set-tournament-admin', async (req, res) => {
    const { targetId, isTournamentAdmin, adminId } = req.body;
    const admin = (await pool.query('SELECT is_admin FROM users WHERE telegram_id = $1', [adminId])).rows[0];
    if (!admin?.is_admin) return res.status(403).json({ error: 'Только главный админ' });
    await pool.query('UPDATE users SET is_tournament_admin = $1 WHERE telegram_id = $2', [isTournamentAdmin, targetId]);
    res.json({ success: true });
});

app.post('/api/admin/remove-points', async (req, res) => {
    const { targetId, points, adminId } = req.body;
    const admin = (await pool.query('SELECT is_admin FROM users WHERE telegram_id = $1', [adminId])).rows[0];
    if (!admin?.is_admin) return res.status(403).json({ error: 'Только админ' });
    await pool.query('UPDATE users SET prediction_points = prediction_points - $1 WHERE telegram_id = $2', [points, targetId]);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Nulls Community API running on port ${PORT}`);
});
