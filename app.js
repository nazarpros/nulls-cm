// Добавляем переменную
let isTournamentAdmin = false;

// Обновляем initAuth
async function initAuth() {
    // ... существующий код ...
    
    const data = await response.json();
    currentToken = data.token;
    currentUser = data.user;
    isAdmin = data.isAdmin || false;
    isTournamentAdmin = data.isTournamentAdmin || false;
    
    // Показываем кнопки в зависимости от ролей
    if (isAdmin) {
        showAdminButton();
    }
    if (isTournamentAdmin || isAdmin) {
        showTournamentAdminButton();
    }
    
    showPage('profile');
}

// Кнопка турнирной админки
function showTournamentAdminButton() {
    const nav = document.querySelector('.nav');
    const tournamentAdminBtn = document.createElement('button');
    tournamentAdminBtn.className = 'nav-btn';
    tournamentAdminBtn.innerHTML = '🎮 ТУРНИРЫ';
    tournamentAdminBtn.onclick = () => showPage('tournament-admin');
    nav.appendChild(tournamentAdminBtn);
}

// Турнирная админ панель
async function showTournamentAdminPanel() {
    if (!isTournamentAdmin && !isAdmin) {
        alert('Доступ только для организаторов турниров');
        return;
    }
    
    const content = document.getElementById('content');
    
    // Получаем список турниров
    const response = await fetch('/api/tournaments');
    const tournaments = await response.json();
    
    content.innerHTML = `
        <div class="tournament-admin-panel">
            <h2>🎮 Управление турнирами</h2>
            
            <button class="create-tournament-btn" onclick="showCreateTournamentModal()">
                ➕ Создать новый турнир
            </button>
            
            <div class="tournaments-list-admin">
                ${tournaments.map(t => `
                    <div class="tournament-card-admin">
                        <div class="tournament-header">
                            <h3>${t.title}</h3>
                            <span class="status ${t.status}">${getStatusText(t.status)}</span>
                        </div>
                        <p>${t.description || 'Нет описания'}</p>
                        <p>🏆 Приз: ${t.prizePool || 'Не указан'}</p>
                        <p>👥 Команд: ${t.teams.length}</p>
                        <div class="tournament-actions">
                            <button onclick="manageTournament('${t.id}')">📋 Управлять</button>
                            <button onclick="showTournamentDetails('${t.id}')">👁️ Просмотр</button>
                            ${isAdmin ? `<button onclick="deleteTournament('${t.id}')" class="danger">🗑️ Удалить</button>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Управление конкретным турниром
async function manageTournament(tournamentId) {
    const response = await fetch(`/api/tournaments/${tournamentId}/full`);
    const tournament = await response.json();
    
    // Получаем список всех команд для регистрации
    const teamsResponse = await fetch('/api/teams');
    const allTeams = await teamsResponse.json();
    const availableTeams = allTeams.filter(t => !tournament.teams.includes(t.id));
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="tournament-manager">
            <button onclick="showTournamentAdminPanel()" class="back-btn">← Назад</button>
            
            <div class="tournament-info">
                <h2>${tournament.title}</h2>
                <p>${tournament.description}</p>
                <p>🏆 ${tournament.prizePool}</p>
                <div class="status-control">
                    <label>Статус турнира:</label>
                    <select onchange="updateTournamentStatus('${tournament.id}', this.value)">
                        <option value="registration" ${tournament.status === 'registration' ? 'selected' : ''}>📝 Регистрация</option>
                        <option value="ongoing" ${tournament.status === 'ongoing' ? 'selected' : ''}>⚔️ Идет</option>
                        <option value="finished" ${tournament.status === 'finished' ? 'selected' : ''}>🏆 Завершен</option>
                    </select>
                </div>
            </div>
            
            <div class="tournament-section">
                <h3>📝 Регистрация команд</h3>
                <div class="register-team">
                    <select id="teamSelect">
                        <option value="">Выберите команду</option>
                        ${availableTeams.map(t => `
                            <option value="${t.id}">${t.name} (${t.members.length} игроков)</option>
                        `).join('')}
                    </select>
                    <button onclick="registerTeamToTournament('${tournament.id}')">➕ Зарегистрировать</button>
                </div>
                
                <h4>Зарегистрированные команды:</h4>
                <div class="teams-list">
                    ${tournament.fullTeams.map(team => `
                        <div class="team-item">
                            <span>${team.name}</span>
                            <button onclick="unregisterTeam('${tournament.id}', '${team.id}')" class="danger-small">✖️</button>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="tournament-section">
                <h3>⚔️ Сетка турнира</h3>
                <button onclick="showCreateMatchModal('${tournament.id}')">➕ Создать матч</button>
                <div class="matches-list">
                    ${(tournament.matches || []).map(match => `
                        <div class="match-item">
                            <span>${getTeamName(match.team1, allTeams)} vs ${getTeamName(match.team2, allTeams)}</span>
                            <span>Раунд ${match.round}</span>
                            ${match.status === 'finished' ? 
                                `<span>Счет: ${match.score} | Победитель: ${getTeamName(match.winner, allTeams)}</span>` :
                                `<button onclick="setMatchResult('${tournament.id}', '${match.id}')">📝 Указать результат</button>`
                            }
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="tournament-section">
                <h3>🎲 Предикты и шансы</h3>
                <button onclick="showAddPredictionModal('${tournament.id}')">➕ Добавить прогноз</button>
                <div class="predictions-list">
                    ${(tournament.predictions || []).map(p => `
                        <div class="prediction-item">
                            <p>Матч #${p.matchId.slice(-6)}</p>
                            <div class="odds">
                                <span>Команда 1: ${p.team1Odds || '1.0'}x</span>
                                <span>Команда 2: ${p.team2Odds || '1.0'}x</span>
                            </div>
                            <div class="votes">
                                <span>Голосов: ${p.votesCount.team1} vs ${p.votesCount.team2}</span>
                            </div>
                            <button onclick="editOdds('${tournament.id}', '${p.matchId}')">✏️ Изменить шансы</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// Функции управления турниром
window.registerTeamToTournament = async (tournamentId) => {
    const teamId = document.getElementById('teamSelect').value;
    if (!teamId) {
        alert('Выберите команду');
        return;
    }
    
    await fetch(`/api/tournaments/${tournamentId}/register-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: currentUser.telegramId,
            teamId 
        })
    });
    
    alert('Команда зарегистрирована!');
    manageTournament(tournamentId);
};

window.unregisterTeam = async (tournamentId, teamId) => {
    if (!confirm('Удалить команду из турнира?')) return;
    
    await fetch(`/api/tournaments/${tournamentId}/unregister-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: currentUser.telegramId,
            teamId 
        })
    });
    
    manageTournament(tournamentId);
};

window.updateTournamentStatus = async (tournamentId, status) => {
    await fetch('/api/admin/tournament-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: currentUser.telegramId,
            tournamentId,
            status 
        })
    });
    
    alert('Статус обновлен');
    manageTournament(tournamentId);
};

window.showCreateMatchModal = (tournamentId) => {
    const teams = prompt('Введите ID команд через пробел (сначала первая, потом вторая):\nПример: team123 team456');
    if (!teams) return;
    
    const [team1Id, team2Id] = teams.split(' ');
    
    fetch(`/api/tournaments/${tournamentId}/create-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: currentUser.telegramId,
            team1Id,
            team2Id,
            round: 1
        })
    }).then(() => {
        alert('Матч создан!');
        manageTournament(tournamentId);
    });
};

window.setMatchResult = async (tournamentId, matchId) => {
    const score = prompt('Введите счет (например: 2-1):');
    const winner = prompt('Введите ID команды-победителя:');
    if (!score || !winner) return;
    
    await fetch(`/api/tournaments/${tournamentId}/match-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: currentUser.telegramId,
            matchId,
            score,
            winner
        })
    });
    
    alert('Результат сохранен!');
    manageTournament(tournamentId);
};

window.showAddPredictionModal = (tournamentId) => {
    const matchId = prompt('ID матча:');
    const team1Odds = prompt('Коэффициент на команду 1 (например: 1.5):');
    const team2Odds = prompt('Коэффициент на команду 2 (например: 2.0):');
    
    if (!matchId || !team1Odds || !team2Odds) return;
    
    fetch(`/api/tournaments/${tournamentId}/add-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: currentUser.telegramId,
            matchId,
            team1Odds: parseFloat(team1Odds),
            team2Odds: parseFloat(team2Odds)
        })
    }).then(() => {
        alert('Прогноз добавлен!');
        manageTournament(tournamentId);
    });
};

window.editOdds = async (tournamentId, matchId) => {
    const team1Odds = prompt('Новый коэффициент на команду 1:');
    const team2Odds = prompt('Новый коэффициент на команду 2:');
    
    if (!team1Odds || !team2Odds) return;
    
    await fetch(`/api/tournaments/${tournamentId}/update-odds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: currentUser.telegramId,
            matchId,
            team1Odds: parseFloat(team1Odds),
            team2Odds: parseFloat(team2Odds)
        })
    });
    
    alert('Шансы обновлены!');
    manageTournament(tournamentId);
};

function getTeamName(teamId, teams) {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : teamId;
}

function getStatusText(status) {
    const statuses = {
        'registration': '📝 Регистрация',
        'ongoing': '⚔️ Идет',
        'finished': '🏆 Завершен'
    };
    return statuses[status] || status;
}

// Обновляем showPage
async function showPage(page) {
    const content = document.getElementById('content');
    
    switch(page) {
        case 'profile':
            await loadProfile();
            content.innerHTML = '<p>👤 Ваш профиль отображается выше</p>';
            break;
        case 'teams':
            await loadTeams();
            break;
        case 'matches':
            await loadMatches();
            break;
        case 'tournaments':
            await loadTournaments();
            break;
        case 'tournament-admin':
            if (isTournamentAdmin || isAdmin) {
                await showTournamentAdminPanel();
            } else {
                alert('Доступ только для организаторов турниров');
            }
            break;
        case 'admin':
            if (isAdmin) {
                await showAdminPanel();
            } else {
                alert('Доступ запрещен');
            }
            break;
    }
    
    // Обновляем активную кнопку
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(page === 'tournament-admin' ? 'ТУРНИРЫ' : page)) {
            btn.classList.add('active');
        }
    });
                  }
