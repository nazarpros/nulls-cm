// В начало файла, после ADMIN_USERNAME
const TOURNAMENT_ADMINS = new Set(); // Храним ID турнирных админов
// Можно сразу добавить кого-то:
// TOURNAMENT_ADMINS.add(123456789); // ID пользователя

// Middleware для проверки турнирного админа
function isTournamentAdmin(req, res, next) {
    const { userId } = req.body;
    const user = users.get(parseInt(userId));
    
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    
    // Полный админ или турнирный админ
    if (user.username === ADMIN_USERNAME || TOURNAMENT_ADMINS.has(user.telegramId)) {
        next();
    } else {
        res.status(403).json({ error: 'Доступ только для турнирных админов' });
    }
}

// Обновляем модель пользователя
app.post('/api/auth/telegram', (req, res) => {
    const { id, username, first_name, photo_url } = req.body;
    
    if (!users.has(id)) {
        users.set(id, {
            telegramId: id,
            username: username || first_name,
            isAdmin: username === ADMIN_USERNAME,
            isTournamentAdmin: TOURNAMENT_ADMINS.has(id), // Проверяем есть ли в списке
            avatarUrl: photo_url || null,
            bannerUrl: null,
            description: '🎮 Игрок в Brawl Stars',
            links: [],
            isBanned: false,
            createdAt: new Date()
        });
    }
    
    const user = users.get(id);
    
    if (user.username === ADMIN_USERNAME) {
        adminId = id;
    }
    
    if (user.isBanned) {
        return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    }
    
    const token = Buffer.from(`${id}:${Date.now()}`).toString('base64');
    res.json({ 
        success: true, 
        token, 
        user: users.get(id),
        isAdmin: user.username === ADMIN_USERNAME,
        isTournamentAdmin: user.isTournamentAdmin || false
    });
});

// ==================== УПРАВЛЕНИЕ ТУРНИРНЫМИ АДМИНАМИ (только для главного админа) ====================

// Добавить турнирного админа
app.post('/api/admin/add-tournament-admin', isAdmin, (req, res) => {
    const { targetId } = req.body;
    
    const user = users.get(parseInt(targetId));
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    
    TOURNAMENT_ADMINS.add(parseInt(targetId));
    user.isTournamentAdmin = true;
    users.set(user.telegramId, user);
    
    res.json({ success: true, message: `@${user.username} теперь турнирный админ` });
});

// Удалить турнирного админа
app.post('/api/admin/remove-tournament-admin', isAdmin, (req, res) => {
    const { targetId } = req.body;
    
    TOURNAMENT_ADMINS.delete(parseInt(targetId));
    
    const user = users.get(parseInt(targetId));
    if (user) {
        user.isTournamentAdmin = false;
        users.set(user.telegramId, user);
    }
    
    res.json({ success: true, message: 'Турнирный админ удален' });
});

// Получить список турнирных админов
app.get('/api/admin/tournament-admins', isAdmin, (req, res) => {
    const admins = Array.from(TOURNAMENT_ADMINS).map(id => {
        const user = users.get(id);
        return user ? { id: user.telegramId, username: user.username } : null;
    }).filter(a => a);
    
    res.json(admins);
});

// ==================== ТУРНИРНАЯ АДМИНКА (обновляем эндпоинты) ====================

// Создать турнир (теперь и турнирные админы могут)
app.post('/api/tournaments', isTournamentAdmin, (req, res) => {
    const { createdBy, title, description, prizePool, startDate } = req.body;
    const tournament = {
        id: Date.now().toString(),
        createdBy,
        title,
        description,
        prizePool: prizePool || '🏆 Победитель получает славу!',
        bannerUrl: null,
        status: 'registration',
        teams: [], // ID команд
        matches: [],
        predictions: [],
        odds: {}, // Шансы/коэффициенты
        startDate: startDate || new Date(),
        registeredPlayers: [],
        createdAt: new Date()
    };
    tournaments.set(tournament.id, tournament);
    res.json(tournament);
});

// Зарегистрировать команду на турнир (только турнирный админ)
app.post('/api/tournaments/:id/register-team', isTournamentAdmin, (req, res) => {
    const tournament = tournaments.get(req.params.id);
    const { teamId } = req.body;
    
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    if (tournament.status !== 'registration') {
        return res.status(403).json({ error: 'Регистрация на турнир закрыта' });
    }
    if (tournament.teams.includes(teamId)) {
        return res.status(400).json({ error: 'Команда уже зарегистрирована' });
    }
    
    tournament.teams.push(teamId);
    tournaments.set(req.params.id, tournament);
    
    res.json({ success: true, tournament });
});

// Удалить команду из турнира
app.post('/api/tournaments/:id/unregister-team', isTournamentAdmin, (req, res) => {
    const tournament = tournaments.get(req.params.id);
    const { teamId } = req.body;
    
    tournament.teams = tournament.teams.filter(t => t !== teamId);
    tournaments.set(req.params.id, tournament);
    
    res.json({ success: true });
});

// Добавить предикт (прогноз) для матча в турнире
app.post('/api/tournaments/:id/add-prediction', isTournamentAdmin, (req, res) => {
    const tournament = tournaments.get(req.params.id);
    const { matchId, team1Odds, team2Odds } = req.body;
    
    if (!tournament.predictions) tournament.predictions = [];
    
    tournament.predictions.push({
        matchId,
        team1Odds,
        team2Odds,
        votes: { team1: [], team2: [] },
        createdAt: new Date()
    });
    
    tournaments.set(req.params.id, tournament);
    res.json({ success: true, predictions: tournament.predictions });
});

// Обновить коэффициенты (шансы)
app.post('/api/tournaments/:id/update-odds', isTournamentAdmin, (req, res) => {
    const tournament = tournaments.get(req.params.id);
    const { matchId, team1Odds, team2Odds } = req.body;
    
    const prediction = tournament.predictions.find(p => p.matchId === matchId);
    if (prediction) {
        prediction.team1Odds = team1Odds;
        prediction.team2Odds = team2Odds;
        tournaments.set(req.params.id, tournament);
    }
    
    res.json({ success: true });
});

// Создать матч в турнире
app.post('/api/tournaments/:id/create-match', isTournamentAdmin, (req, res) => {
    const tournament = tournaments.get(req.params.id);
    const { team1Id, team2Id, round } = req.body;
    
    const match = {
        id: `${req.params.id}_${Date.now()}`,
        team1: team1Id,
        team2: team2Id,
        round: round || 1,
        status: 'scheduled',
        score: null,
        winner: null
    };
    
    if (!tournament.matches) tournament.matches = [];
    tournament.matches.push(match);
    tournaments.set(req.params.id, tournament);
    
    res.json({ success: true, match });
});

// Обновить результат матча
app.post('/api/tournaments/:id/match-result', isTournamentAdmin, (req, res) => {
    const tournament = tournaments.get(req.params.id);
    const { matchId, score, winner } = req.body;
    
    const match = tournament.matches.find(m => m.id === matchId);
    if (match) {
        match.score = score;
        match.winner = winner;
        match.status = 'finished';
        tournaments.set(req.params.id, tournament);
    }
    
    res.json({ success: true });
});

// Проголосовать за команду (обычные пользователи)
app.post('/api/tournaments/:id/vote', (req, res) => {
    const tournament = tournaments.get(req.params.id);
    const { matchId, team, userId } = req.body;
    
    const prediction = tournament.predictions.find(p => p.matchId === matchId);
    if (!prediction) return res.status(404).json({ error: 'Прогноз не найден' });
    
    // Удаляем старый голос если был
    prediction.votes.team1 = prediction.votes.team1.filter(id => id !== userId);
    prediction.votes.team2 = prediction.votes.team2.filter(id => id !== userId);
    
    // Добавляем новый
    if (team === 'team1') {
        prediction.votes.team1.push(userId);
    } else {
        prediction.votes.team2.push(userId);
    }
    
    tournaments.set(req.params.id, tournament);
    res.json({ success: true });
});

// Получить турнир с полной информацией
app.get('/api/tournaments/:id/full', (req, res) => {
    const tournament = tournaments.get(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Турнир не найден' });
    
    // Получаем полную информацию о командах
    const fullTeams = tournament.teams.map(teamId => {
        const team = teams.get(teamId);
        return team ? {
            id: team.id,
            name: team.name,
            avatarUrl: team.avatarUrl,
            members: team.members
        } : null;
    }).filter(t => t);
    
    res.json({
        ...tournament,
        fullTeams,
        predictions: tournament.predictions.map(p => ({
            ...p,
            votesCount: {
                team1: p.votes.team1.length,
                team2: p.votes.team2.length
            }
        }))
    });
});
