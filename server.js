const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Подключение к PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Создание таблиц при запуске
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
            
            CREATE TABLE IF NOT EXISTS tournaments (
                id TEXT PRIMARY KEY,
                title TEXT,
                description TEXT,
                banner_url TEXT,
                status TEXT,
                teams TEXT[],
                created_by BIGINT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
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
        
        if (user.is_banned) {
            return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
        }
        
        const token = Buffer.from(`${id}:${Date.now()}`).toString('base64');
        res.json({ 
            success: true, 
            token, 
            user,
            isAdmin: user.is_admin,
            isTournamentAdmin: user.is_tournament_admin
        });
    } catch (err) {
        console.error('Auth error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Стать админом через секретное имя
app.post('/api/become-admin', async (req, res) => {
    const { userId, secretName } = req.body;
    
    if (secretName === 'ghosty') {
        await pool.query('UPDATE users SET is_admin = true WHERE telegram_id = $1', [userId]);
        res.json({ success: true, message: 'Теперь вы админ!' });
    } else {
        res.json({ success: false, message: 'Неверное секретное имя' });
    }
});

// ==================== ПРОФИЛЬ ====================
app.get('/api/profile/:id', async (req, res) => {
    try {
        const user = (await pool.query('SELECT * FROM users WHERE telegram_id = $1', [req.params.id])).rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/profile/:id', async (req, res) => {
    const { username, description, avatar_url, banner_url } = req.body;
    try {
        await pool.query(
            'UPDATE users SET username = COALESCE($1, username), description = COALESCE($2, description), avatar_url = COALESCE($3, avatar_url), banner_url = COALESCE($4, banner_url) WHERE telegram_id = $5',
            [username, description, avatar_url, banner_url, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== КОМАНДЫ ====================
app.get('/api/teams', async (req, res) => {
    try {
        const teams = (await pool.query('SELECT * FROM teams ORDER BY created_at DESC')).rows;
        res.json(teams);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/teams/:id', async (req, res) => {
    try {
        const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
        if (!team) return res.status(404).json({ error: 'Team not found' });
        res.json(team);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/teams', async (req, res) => {
    const { name, ownerId, description } = req.body;
    const id = Date.now().toString();
    try {
        await pool.query(
            'INSERT INTO teams (id, name, owner_id, description, members) VALUES ($1, $2, $3, $4, $5)',
            [id, name, ownerId, description || '', [ownerId.toString()]]
        );
        await pool.query('UPDATE users SET team_id = $1 WHERE telegram_id = $2', [id, ownerId]);
        res.json({ id, name, ownerId, description, members: [ownerId] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/teams/:id/join', async (req, res) => {
    const { userId } = req.body;
    try {
        const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
        
        if (!team) return res.status(404).json({ error: 'Команда не найдена' });
        if (team.members.includes(userId.toString())) return res.status(400).json({ error: 'Вы уже в команде' });
        if (team.members.length >= 10) return res.status(400).json({ error: 'Команда полная' });
        
        team.members.push(userId.toString());
        await pool.query('UPDATE teams SET members = $1 WHERE id = $2', [team.members, req.params.id]);
        await pool.query('UPDATE users SET team_id = $1 WHERE telegram_id = $2', [req.params.id, userId]);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/teams/:id/leave', async (req, res) => {
    const { userId } = req.body;
    try {
        const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
        
        if (!team) return res.status(404).json({ error: 'Команда не найдена' });
        if (team.owner_id == userId) {
            return res.status(403).json({ error: 'Создатель не может покинуть команду' });
        }
        
        const members = team.members.filter(m => m != userId);
        await pool.query('UPDATE teams SET members = $1 WHERE id = $2', [members, req.params.id]);
        await pool.query('UPDATE users SET team_id = NULL WHERE telegram_id = $1', [userId]);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/teams/:id/delete', async (req, res) => {
    const { userId } = req.body;
    try {
        const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id])).rows[0];
        
        if (!team) return res.status(404).json({ error: 'Команда не найдена' });
        
        const user = (await pool.query('SELECT is_admin FROM users WHERE telegram_id = $1', [userId])).rows[0];
        if (team.owner_id != userId && !user?.is_admin) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        for (const member of team.members) {
            await pool.query('UPDATE users SET team_id = NULL WHERE telegram_id = $1', [member]);
        }
        
        await pool.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/teams/:id', async (req, res) => {
    const { name, description, avatar_url, banner_url } = req.body;
    try {
        await pool.query(
            'UPDATE teams SET name = COALESCE($1, name), description = COALESCE($2, description), avatar_url = COALESCE($3, avatar_url), banner_url = COALESCE($4, banner_url) WHERE id = $5',
            [name, description, avatar_url, banner_url, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Получить команду пользователя
app.get('/api/user/team/:userId', async (req, res) => {
    try {
        const user = (await pool.query('SELECT team_id FROM users WHERE telegram_id = $1', [req.params.userId])).rows[0];
        if (!user?.team_id) return res.json({ team: null });
        const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [user.team_id])).rows[0];
        res.json({ team: team || null });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== МАТЧИ ====================
app.get('/api/matches', async (req, res) => {
    try {
        const matches = (await pool.query('SELECT * FROM matches ORDER BY created_at DESC')).rows;
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/matches', async (req, res) => {
    const { teamId, createdBy } = req.body;
    try {
        const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [teamId])).rows[0];
        if (!team) return res.status(404).json({ error: 'Команда не найдена' });
        
        const id = Date.now().toString();
        await pool.query(
            'INSERT INTO matches (id, team1, team1_name, created_by, status) VALUES ($1, $2, $3, $4, $5)',
            [id, teamId, team.name, createdBy, 'searching']
        );
        res.json({ id, team1: teamId, team1Name: team.name, status: 'searching' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/matches/:id/join', async (req, res) => {
    const { teamId } = req.body;
    try {
        const match = (await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id])).rows[0];
        if (!match) return res.status(404).json({ error: 'Матч не найден' });
        if (match.status !== 'searching') return res.status(400).json({ error: 'Матч уже начат' });
        if (match.team2) return res.status(400).json({ error: 'Матч уже занят' });
        
        const team = (await pool.query('SELECT * FROM teams WHERE id = $1', [teamId])).rows[0];
        if (!team) return res.status(404).json({ error: 'Команда не найдена' });
        
        await pool.query(
            'UPDATE matches SET team2 = $1, team2_name = $2, status = $3 WHERE id = $4',
            [teamId, team.name, 'ready', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/matches/:id/code', async (req, res) => {
    const { gameCode } = req.body;
    try {
        await pool.query('UPDATE matches SET game_code = $1 WHERE id = $2', [gameCode, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/matches/:id/finish', async (req, res) => {
    const { winner } = req.body;
    try {
        await pool.query('UPDATE matches SET status = $1, winner = $2 WHERE id = $3', ['finished', winner, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/matches/:id/delete', async (req, res) => {
    const { userId } = req.body;
    try {
        const match = (await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id])).rows[0];
        if (!match) return res.status(404).json({ error: 'Матч не найден' });
        
        const user = (await pool.query('SELECT is_admin FROM users WHERE telegram_id = $1', [userId])).rows[0];
        if (match.created_by != userId && !user?.is_admin) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        
        await pool.query('DELETE FROM matches WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== ТУРНИРЫ ====================
app.get('/api/tournaments', async (req, res) => {
    try {
        const tournaments = (await pool.query('SELECT * FROM tournaments ORDER BY created_at DESC')).rows;
        res.json(tournaments);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/tournaments', async (req, res) => {
    const { createdBy, title, description } = req.body;
    const id = Date.now().toString();
    try {
        await pool.query(
            'INSERT INTO tournaments (id, title, description, status, teams, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, title, description || '', 'registration', [], createdBy]
        );
        res.json({ id, title, description, status: 'registration', teams: [] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/tournaments/:id/register', async (req, res) => {
    const { teamId } = req.body;
    try {
        const tournament = (await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id])).rows[0];
        if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
        
        if (!tournament.teams.includes(teamId)) {
            tournament.teams.push(teamId);
            await pool.query('UPDATE tournaments SET teams = $1 WHERE id = $2', [tournament.teams, req.params.id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== АДМИНКА ====================
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = (await pool.query('SELECT telegram_id, username, is_banned, team_id FROM users')).rows;
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/ban', async (req, res) => {
    const { targetId, ban } = req.body;
    try {
        await pool.query('UPDATE users SET is_banned = $1 WHERE telegram_id = $2', [ban, targetId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/delete-user', async (req, res) => {
    const { targetId } = req.body;
    try {
        await pool.query('DELETE FROM users WHERE telegram_id = $1', [targetId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/teams', async (req, res) => {
    try {
        const teams = (await pool.query('SELECT * FROM teams')).rows;
        res.json(teams);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/delete-team', async (req, res) => {
    const { teamId } = req.body;
    try {
        await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/matches', async (req, res) => {
    try {
        const matches = (await pool.query('SELECT * FROM matches')).rows;
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/delete-match', async (req, res) => {
    const { matchId } = req.body;
    try {
        await pool.query('DELETE FROM matches WHERE id = $1', [matchId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/tournaments', async (req, res) => {
    try {
        const tournaments = (await pool.query('SELECT * FROM tournaments')).rows;
        res.json(tournaments);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/delete-tournament', async (req, res) => {
    const { tournamentId } = req.body;
    try {
        await pool.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const users = (await pool.query('SELECT COUNT(*) FROM users')).rows[0];
        const teams = (await pool.query('SELECT COUNT(*) FROM teams')).rows[0];
        const matches = (await pool.query('SELECT COUNT(*) FROM matches')).rows[0];
        const tournaments = (await pool.query('SELECT COUNT(*) FROM tournaments')).rows[0];
        const banned = (await pool.query('SELECT COUNT(*) FROM users WHERE is_banned = true')).rows[0];
        res.json({
            totalUsers: parseInt(users.count),
            totalTeams: parseInt(teams.count),
            totalMatches: parseInt(matches.count),
            totalTournaments: parseInt(tournaments.count),
            bannedUsers: parseInt(banned.count)
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Nulls Community API running on port ${PORT}`);
});
