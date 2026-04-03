let currentUser = null;
let isAdmin = false;
let isTournamentAdmin = false;

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ==================== CLOUDINARY ====================
const CLOUD_NAME = 'dew0bxfzo';
const UPLOAD_PRESET = 'nulls_community';

async function uploadImageToCloudinary(file, type, targetId = null, targetType = 'profile') {
    tg.showPopup({
        title: 'Загрузка',
        message: 'Загружаем изображение...',
        buttons: [{ type: 'ok' }]
    });
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    
    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.secure_url) {
            const imageUrl = data.secure_url;
            
            if (targetType === 'team') {
                const teamRes = await fetch(`/api/teams/${targetId}`);
                const team = await teamRes.json();
                if (type === 'avatar') {
                    team.avatar_url = imageUrl;
                } else {
                    team.banner_url = imageUrl;
                }
                await fetch(`/api/teams/${targetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(team)
                });
                showTeamDetail(targetId);
            } else if (targetType === 'tournament') {
                const updates = {};
                if (type === 'banner') updates.banner_url = imageUrl;
                if (type === 'avatar') updates.avatar_url = imageUrl;
                await fetch(`/api/tournaments/${targetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                showTournamentDetail(targetId);
            } else {
                const updates = {};
                if (type === 'avatar') {
                    updates.avatar_url = imageUrl;
                } else {
                    updates.banner_url = imageUrl;
                }
                await fetch(`/api/profile/${currentUser.telegram_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                await loadProfile();
            }
            tg.showAlert('Изображение загружено');
        } else {
            tg.showAlert('Ошибка загрузки');
        }
    } catch (error) {
        console.error(error);
        tg.showAlert('Ошибка загрузки');
    }
}

function selectImage(type, targetId = null, targetType = 'profile') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadImageToCloudinary(file, type, targetId, targetType);
        }
    };
    input.click();
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function closeModal() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
}

async function showUserProfile(userId) {
    const res = await fetch(`/api/profile/${userId}`);
    const user = await res.json();
    tg.showPopup({
        title: `Профиль ${user.username}`,
        message: `Очки предиктов: ${user.prediction_points || 0}\n${user.team ? `Команда: ${user.team.name}` : 'Без команды'}`,
        buttons: [{ type: 'close', text: 'Закрыть' }]
    });
}

// ==================== АВТОРИЗАЦИЯ ====================
async function initAuth() {
    const user = tg.initDataUnsafe.user;
    if (!user) return;
    
    document.getElementById('username').textContent = user.username || user.first_name;
    if (user.photo_url) {
        document.getElementById('avatar').src = user.photo_url;
    }
    
    const response = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: user.id,
            username: user.username || user.first_name,
            first_name: user.first_name,
            photo_url: user.photo_url
        })
    });
    
    const data = await response.json();
    currentUser = data.user;
    isAdmin = data.isAdmin || false;
    isTournamentAdmin = data.isTournamentAdmin || false;
    
    await loadProfile();
    
    if (isAdmin) showAdminButton();
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => {
            const page = btn.getAttribute('data-page');
            if (page) showPage(page);
        };
    });
    
    showPage('profile');
}

async function loadProfile() {
    if (!currentUser) return;
    
    const response = await fetch(`/api/profile/${currentUser.telegram_id}`);
    const profile = await response.json();
    currentUser = profile;
    
    document.getElementById('username').textContent = profile.username;
    document.getElementById('description').textContent = profile.description || 'Игрок в Brawl Stars';
    
    if (profile.avatar_url) {
        document.getElementById('avatar').src = profile.avatar_url;
    }
    
    if (profile.banner_url) {
        document.getElementById('banner').style.backgroundImage = `url(${profile.banner_url})`;
        document.getElementById('banner').style.backgroundSize = 'cover';
        document.getElementById('banner').style.backgroundPosition = 'center';
    } else {
        document.getElementById('banner').style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)';
    }
    
    const userTeamRes = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const userTeam = await userTeamRes.json();
    const teamInfo = document.getElementById('teamInfo');
    if (teamInfo) {
        if (userTeam.team) {
            teamInfo.innerHTML = `<div class="user-team-card" onclick="showTeamDetail('${userTeam.team.id}')">Команда: <strong>${escapeHtml(userTeam.team.name)}</strong></div>`;
        } else {
            teamInfo.innerHTML = `<div class="user-team-card">Без команды</div>`;
        }
    }
}

function editProfile() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редактировать профиль</h3>
            <input type="text" id="editUsername" placeholder="Имя" value="${escapeHtml(currentUser.username || '')}">
            <textarea id="editDescription" placeholder="О себе" rows="3">${escapeHtml(currentUser.description || '')}</textarea>
            <button class="upload-btn" onclick="selectImage('avatar'); closeModal();">Загрузить аватарку</button>
            <button class="upload-btn" onclick="selectImage('banner'); closeModal();">Загрузить баннер</button>
            <div class="modal-buttons">
                <button onclick="saveProfile()">Сохранить</button>
                <button onclick="closeModal()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveProfile() {
    const username = document.getElementById('editUsername')?.value.trim();
    const description = document.getElementById('editDescription')?.value.trim();
    
    if (username === 'ghosty') {
        const res = await fetch('/api/become-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.telegram_id, secretName: username })
        });
        const result = await res.json();
        if (result.success) {
            isAdmin = true;
            tg.showAlert('Теперь вы администратор');
            showAdminButton();
        } else {
            tg.showAlert(result.message);
        }
    }
    
    const updates = {};
    if (username && username !== 'ghosty') updates.username = username;
    if (description) updates.description = description;
    
    if (Object.keys(updates).length > 0) {
        await fetch(`/api/profile/${currentUser.telegram_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
    }
    
    closeModal();
    await loadProfile();
    tg.showAlert('Профиль обновлён');
}

// ==================== КОМАНДЫ ====================
async function loadTeams() {
    const res = await fetch('/api/teams');
    const teams = await res.json();
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="search-bar">
            <input type="text" id="teamSearch" placeholder="Поиск команд..." oninput="searchTeams()">
        </div>
        <button class="create-btn" onclick="showCreateTeamModal()">Создать команду</button>
        <div id="teamsList" class="teams-grid">
            ${teams.map(team => `
                <div class="card team-card" onclick="showTeamDetail('${team.id}')">
                    <div class="team-avatar">
                        ${team.avatar_url ? `<img src="${team.avatar_url}" class="team-avatar-img">` : '👥'}
                    </div>
                    <h3>${escapeHtml(team.name)}</h3>
                    <p>${escapeHtml(team.description || 'Нет описания')}</p>
                    <div class="team-stats">Участников: ${team.members?.length || 0}/10</div>
                    ${team.owner_id == currentUser.telegram_id ? '<span class="owner-badge">Создатель</span>' : ''}
                </div>
            `).join('')}
        </div>
    `;
}

async function searchTeams() {
    const query = document.getElementById('teamSearch')?.value;
    if (!query) {
        loadTeams();
        return;
    }
    const res = await fetch(`/api/search/teams?q=${encodeURIComponent(query)}`);
    const teams = await res.json();
    const container = document.getElementById('teamsList');
    if (container) {
        container.innerHTML = teams.map(team => `
            <div class="card team-card" onclick="showTeamDetail('${team.id}')">
                <div class="team-avatar">
                    ${team.avatar_url ? `<img src="${team.avatar_url}" class="team-avatar-img">` : '👥'}
                </div>
                <h3>${escapeHtml(team.name)}</h3>
                <p>${escapeHtml(team.description || 'Нет описания')}</p>
                <div class="team-stats">Участников: ${team.members?.length || 0}/10</div>
            </div>
        `).join('');
    }
}

async function showTeamDetail(teamId) {
    const res = await fetch(`/api/teams/${teamId}`);
    const team = await res.json();
    const isTeamAdmin = team.owner_id == currentUser.telegram_id;
    const isMember = team.members?.includes(currentUser.telegram_id.toString());
    
    let requestsHtml = '';
    if (isTeamAdmin) {
        const requestsRes = await fetch(`/api/teams/${teamId}/requests`);
        const requests = await requestsRes.json();
        if (requests.length > 0) {
            requestsHtml = `
                <div class="requests-section">
                    <h3>Заявки на вступление</h3>
                    ${requests.map(req => `
                        <div class="request-item">
                            <span>${escapeHtml(req.username)}</span>
                            <div>
                                <button onclick="acceptMember('${teamId}', '${req.telegram_id}')">Принять</button>
                                <button onclick="rejectMember('${teamId}', '${req.telegram_id}')">Отклонить</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <button class="back-btn" onclick="loadTeams()">Назад</button>
        <div class="team-detail">
            <div class="team-banner" style="background-image: url('${team.banner_url || ''}'); background-size: cover; background-position: center;">
                ${!team.banner_url ? '<div class="team-banner-placeholder"></div>' : ''}
                ${isTeamAdmin ? `<button class="edit-banner-btn" onclick="selectImage('banner', '${teamId}', 'team')">Изменить баннер</button>` : ''}
            </div>
            <div class="team-detail-avatar">
                ${team.avatar_url ? `<img src="${team.avatar_url}" class="team-detail-img">` : '<div class="team-detail-img-placeholder">👥</div>'}
                ${isTeamAdmin ? `<button class="edit-avatar-btn" onclick="selectImage('avatar', '${teamId}', 'team')">✏️</button>` : ''}
            </div>
            <h2>${escapeHtml(team.name)}</h2>
            <p class="team-description">${escapeHtml(team.description || 'Нет описания')}</p>
            <div class="team-members">
                <h3>Участники (${team.membersInfo?.length || 0}/10)</h3>
                <div class="members-list">
                    ${(team.membersInfo || []).map(m => `
                        <div class="member-item" onclick="showUserProfile('${m.telegram_id}')">
                            <img src="${m.avatar_url || 'https://via.placeholder.com/32'}" class="member-avatar">
                            <span class="member-name">${escapeHtml(m.username)}</span>
                            ${m.telegram_id == team.owner_id ? '<span class="member-role owner">Создатель</span>' : ''}
                            ${m.telegram_id == currentUser.telegram_id ? '<span class="member-role you">Вы</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            ${requestsHtml}
            ${!isMember && team.members?.length < 10 ? `<button class="request-join-btn" onclick="requestJoinTeam('${teamId}')">Запросить вступление</button>` : ''}
            ${isMember && !isTeamAdmin ? `<button class="leave-team-btn" onclick="leaveTeam('${teamId}')">Покинуть команду</button>` : ''}
            ${isTeamAdmin ? `<button class="delete-team-btn" onclick="deleteTeam('${teamId}')">Удалить команду</button>` : ''}
        </div>
    `;
}

async function requestJoinTeam(teamId) {
    await fetch(`/api/teams/${teamId}/request-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    tg.showAlert('Заявка отправлена владельцу команды');
}

async function acceptMember(teamId, userId) {
    await fetch(`/api/teams/${teamId}/accept-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ownerId: currentUser.telegram_id })
    });
    tg.showAlert('Игрок принят в команду');
    showTeamDetail(teamId);
    await loadProfile();
}

async function rejectMember(teamId, userId) {
    await fetch(`/api/teams/${teamId}/reject-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ownerId: currentUser.telegram_id })
    });
    tg.showAlert('Заявка отклонена');
    showTeamDetail(teamId);
}

async function leaveTeam(teamId) {
    if (!confirm('Покинуть команду?')) return;
    await fetch(`/api/teams/${teamId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    tg.showAlert('Вы покинули команду');
    await loadProfile();
    loadTeams();
}

async function deleteTeam(teamId) {
    if (!confirm('Удалить команду навсегда?')) return;
    await fetch(`/api/teams/${teamId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    tg.showAlert('Команда удалена');
    await loadProfile();
    loadTeams();
}

function showCreateTeamModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Создать команду</h3>
            <input type="text" id="teamName" placeholder="Название">
            <textarea id="teamDesc" placeholder="Описание" rows="3"></textarea>
            <div class="modal-buttons">
                <button onclick="createTeam()">Создать</button>
                <button onclick="closeModal()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function createTeam() {
    const name = document.getElementById('teamName')?.value.trim();
    const description = document.getElementById('teamDesc')?.value.trim();
    if (!name) return tg.showAlert('Введите название');
    await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, ownerId: currentUser.telegram_id })
    });
    closeModal();
    tg.showAlert('Команда создана');
    loadTeams();
}

// ==================== МАТЧИ (ОБЫЧНЫЕ) ====================
async function loadRegularMatches() {
    const res = await fetch('/api/matches');
    const matches = await res.json();
    const userTeamRes = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const userTeam = await userTeamRes.json();
    const myTeamId = userTeam.team?.id;

    const content = document.getElementById('content');
    if (!myTeamId) {
        content.innerHTML = `<div class="warning-banner">Чтобы участвовать в матчах, вступите в команду</div>`;
        return;
    }

    const myMatches = matches.filter(m => m.team1 === myTeamId || m.team2 === myTeamId);
    const availableMatches = matches.filter(m => m.status === 'searching' && m.team1 !== myTeamId && !m.team2);

    let html = `<button class="create-btn" onclick="createMatch()">Создать матч (2x2)</button>`;

    if (availableMatches.length) {
        html += `<h3>Доступные матчи</h3>`;
        availableMatches.forEach(m => {
            html += `
                <div class="card match-card">
                    <div class="match-teams"><strong>${escapeHtml(m.team1_name)}</strong> ищет соперника</div>
                    <button onclick="joinMatch('${m.id}')">Присоединиться</button>
                </div>
            `;
        });
    }

    if (myMatches.length) {
        html += `<h3>Мои матчи</h3>`;
        myMatches.forEach(m => {
            const isHost = m.team1 === myTeamId;
            html += `
                <div class="card match-card">
                    <div class="match-teams">
                        <strong>${escapeHtml(m.team1_name)}</strong> vs <strong>${escapeHtml(m.team2_name || '???')}</strong>
                    </div>
                    <div class="match-status ${m.status}">
                        ${m.status === 'searching' ? 'Ожидание соперника' : (m.status === 'ready' ? 'Готов к игре' : 'Завершён')}
                    </div>
                    ${m.game_code ? `<div class="match-code">Код: <strong>${m.game_code}</strong></div>` : ''}
                    ${m.winner ? `<div class="match-winner">Победитель: ${m.winner === m.team1 ? m.team1_name : m.team2_name}</div>` : ''}
                    <div class="match-actions">
                        ${m.status === 'ready' && !m.game_code && isHost ? 
                            `<button class="code-btn" onclick="setGameCode('${m.id}')">Отправить код</button>` : ''}
                        ${m.status === 'ready' && m.game_code && (m.team1 === myTeamId || m.team2 === myTeamId) ? 
                            `<button class="finish-btn" onclick="finishMatch('${m.id}')">Завершить матч</button>` : ''}
                        ${(m.created_by == currentUser.telegram_id || isAdmin) && m.status !== 'finished' ? 
                            `<button class="delete-btn" onclick="deleteMatch('${m.id}')">Удалить матч</button>` : ''}
                    </div>
                </div>
            `;
        });
    }

    if (!availableMatches.length && !myMatches.length) {
        html += `<div class="card">Нет активных матчей. Создайте новый</div>`;
    }
    content.innerHTML = html;
}

async function createMatch() {
    const userTeamRes = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const userTeam = await userTeamRes.json();
    if (!userTeam.team) {
        tg.showAlert('Сначала вступите в команду');
        return;
    }
    await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: userTeam.team.id, createdBy: currentUser.telegram_id })
    });
    tg.showAlert('Матч создан, ждём соперника');
    loadRegularMatches();
}

async function joinMatch(matchId) {
    const userTeamRes = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const userTeam = await userTeamRes.json();
    if (!userTeam.team) {
        tg.showAlert('Сначала вступите в команду');
        return;
    }
    await fetch(`/api/matches/${matchId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: userTeam.team.id })
    });
    tg.showAlert('Вы присоединились к матчу');
    loadRegularMatches();
}

async function setGameCode(matchId) {
    const code = prompt('Введите код из Brawl Stars');
    if (!code) return;
    await fetch(`/api/matches/${matchId}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode: code })
    });
    tg.showAlert('Код отправлен');
    loadRegularMatches();
}

async function finishMatch(matchId) {
    const result = await tg.showPopup({
        title: 'Завершить матч',
        message: 'Какая команда победила?',
        buttons: [
            { id: 'team1', type: 'default', text: 'Первая команда' },
            { id: 'team2', type: 'default', text: 'Вторая команда' },
            { id: 'cancel', type: 'cancel', text: 'Отмена' }
        ]
    });
    if (result === 'cancel') return;
    const match = await fetch(`/api/matches/${matchId}`).then(r => r.json());
    const winner = result === 'team1' ? match.team1 : match.team2;
    await fetch(`/api/matches/${matchId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner })
    });
    tg.showAlert('Матч завершён');
    loadRegularMatches();
}

async function deleteMatch(matchId) {
    if (!confirm('Удалить матч?')) return;
    await fetch(`/api/matches/${matchId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    tg.showAlert('Матч удалён');
    loadRegularMatches();
}

// ==================== ТУРНИРНЫЕ МАТЧИ ====================
async function loadTournamentMatches() {
    const res = await fetch('/api/tournaments');
    const tournaments = await res.json();
    const content = document.getElementById('content');
    
    let html = `<div class="tournament-matches-list">`;
    
    for (const tournament of tournaments) {
        const fullTournament = await fetch(`/api/tournaments/${tournament.id}/full`).then(r => r.json());
        
        if (fullTournament.matches && fullTournament.matches.length > 0) {
            html += `<div class="tournament-section">
                <h3>${escapeHtml(tournament.title)}</h3>
                <div class="tournament-matches">`;
            
            for (const match of fullTournament.matches) {
                const canPredict = match.status !== 'finished' && (!match.prediction_deadline || new Date() < new Date(match.prediction_deadline));
                const myPrediction = match.predictions?.find(p => p.user_id == currentUser.telegram_id);
                
                html += `
                    <div class="card tournament-match-card">
                        <div class="match-header">
                            <div class="match-teams">
                                <span class="team ${match.winner_id === match.team1_id ? 'winner' : ''}">${escapeHtml(match.team1_name)}</span>
                                <span class="vs">VS</span>
                                <span class="team ${match.winner_id === match.team2_id ? 'winner' : ''}">${escapeHtml(match.team2_name)}</span>
                            </div>
                            ${match.score ? `<div class="match-score">Счёт: ${match.score}</div>` : ''}
                            ${match.prediction_deadline ? `<div class="prediction-deadline">Прогнозы до: ${new Date(match.prediction_deadline).toLocaleString()}</div>` : ''}
                        </div>
                        <div class="predictions-stats">
                            <span>Прогнозы: ${match.team1Votes || 0} vs ${match.team2Votes || 0}</span>
                        </div>
                        ${canPredict ? `
                            <div class="predict-actions">
                                <button onclick="makePrediction('${tournament.id}', '${match.id}', '${match.team1_id}')" class="predict-btn">${escapeHtml(match.team1_name)}</button>
                                <button onclick="makePrediction('${tournament.id}', '${match.id}', '${match.team2_id}')" class="predict-btn">${escapeHtml(match.team2_name)}</button>
                            </div>
                        ` : ''}
                        ${myPrediction ? `<div class="my-prediction">Ваш прогноз: ${myPrediction.predicted_winner_id === match.team1_id ? match.team1_name : match.team2_name} ${myPrediction.points_awarded ? `(+${myPrediction.points_awarded} очков)` : ''}</div>` : ''}
                    </div>
                `;
            }
            
            html += `</div></div>`;
        }
    }
    
    if (!tournaments.some(t => t.matches?.length > 0)) {
        html += `<div class="card">Нет активных турнирных матчей</div>`;
    }
    
    html += `</div>`;
    content.innerHTML = html;
}

// ==================== ТУРНИРЫ ====================
async function loadTournaments() {
    const res = await fetch('/api/tournaments');
    const tournaments = await res.json();
    const content = document.getElementById('content');
    
    let html = `<button class="create-btn" onclick="showCreateTournamentModal()">Создать турнир</button>`;
    html += `<div class="tournaments-list">`;
    
    for (const t of tournaments) {
        const isOwner = t.owner_id == currentUser.telegram_id || isAdmin;
        html += `
            <div class="card tournament-card" onclick="showTournamentDetail('${t.id}')">
                <div class="tournament-header">
                    <div class="tournament-avatar">${t.avatar_url ? `<img src="${t.avatar_url}" class="tournament-avatar-img">` : '🏆'}</div>
                    <div class="tournament-info-header">
                        <h3>${escapeHtml(t.title)}</h3>
                        ${isOwner ? '<span class="owner-badge">Владелец</span>' : ''}
                    </div>
                </div>
                <p>${escapeHtml(t.description || 'Нет описания')}</p>
                <div class="tournament-stats">
                    <span>Команд: ${t.teams?.length || 0}</span>
                    <span class="tournament-status ${t.status}">${t.status === 'registration' ? 'Регистрация' : t.status === 'ongoing' ? 'Идёт' : 'Завершён'}</span>
                    ${t.prize_pool ? `<span>Приз: ${escapeHtml(t.prize_pool)}</span>` : ''}
                </div>
            </div>
        `;
    }
    html += `</div>`;
    content.innerHTML = html;
}

async function showTournamentDetail(tournamentId) {
    const res = await fetch(`/api/tournaments/${tournamentId}/full`);
    const tournament = await res.json();
    const isOwner = tournament.owner_id == currentUser.telegram_id || isAdmin;
    
    const content = document.getElementById('content');
    let html = `<button class="back-btn" onclick="loadTournaments()">Назад</button>`;
    html += `
        <div class="tournament-detail">
            <div class="tournament-banner" style="background-image: url('${tournament.banner_url || ''}'); background-size: cover;">
                ${!tournament.banner_url ? '<div class="tournament-banner-placeholder">🏆</div>' : ''}
                ${isOwner ? `<button class="edit-banner-btn" onclick="selectImage('banner', '${tournamentId}', 'tournament')">Изменить баннер</button>` : ''}
            </div>
            <div class="tournament-avatar-container">
                ${tournament.avatar_url ? `<img src="${tournament.avatar_url}" class="tournament-avatar-img">` : '<div class="tournament-avatar-placeholder">🏆</div>'}
                ${isOwner ? `<button class="edit-avatar-btn" onclick="selectImage('avatar', '${tournamentId}', 'tournament')">✏️</button>` : ''}
            </div>
            <h2>${escapeHtml(tournament.title)}</h2>
            <p class="tournament-description">${escapeHtml(tournament.description || 'Нет описания')}</p>
            <div class="tournament-info">
                <div class="info-item">Команд: ${tournament.teams?.length || 0}</div>
                <div class="info-item">Приз: ${escapeHtml(tournament.prize_pool || 'Не указан')}</div>
                <div class="info-item">Статус: <span class="tournament-status ${tournament.status}">${tournament.status === 'registration' ? 'Регистрация' : tournament.status === 'ongoing' ? 'Идёт' : 'Завершён'}</span></div>
            </div>
    `;
    
    if (isOwner) {
        html += `
            <div class="tournament-admin-panel">
                <h3>Управление турниром</h3>
                <div class="admin-buttons">
                    <button onclick="changeTournamentStatus('${tournamentId}', 'ongoing')">Начать турнир</button>
                    <button onclick="changeTournamentStatus('${tournamentId}', 'finished')">Завершить турнир</button>
                    <button onclick="showRegisterTeamModal('${tournamentId}')">Добавить команду</button>
                    <button onclick="showCreateMatchModal('${tournamentId}')">Создать матч</button>
                </div>
            </div>
        `;
    }
    
    html += `
        <div class="tournament-teams-section">
            <h3>Участники (${tournament.teams?.length || 0})</h3>
            <div class="tournament-teams">
    `;
    
    if (tournament.teams?.length) {
        for (const teamId of tournament.teams) {
            const team = await fetch(`/api/teams/${teamId}`).then(r => r.json());
            html += `<div class="tournament-team-card">${escapeHtml(team.name)}</div>`;
        }
    } else {
        html += `<p class="empty-message">Пока нет зарегистрированных команд</p>`;
    }
    
    html += `</div></div>`;
    
    if (tournament.matches?.length) {
        html += `<h3>Матчи турнира</h3>`;
        for (const match of tournament.matches) {
            const canPredict = match.status !== 'finished' && (!match.prediction_deadline || new Date() < new Date(match.prediction_deadline));
            const myPrediction = match.predictions?.find(p => p.user_id == currentUser.telegram_id);
            
            html += `
                <div class="tournament-match-card">
                    <div class="match-header">
                        <div class="match-teams">
                            <span class="team ${match.winner_id === match.team1_id ? 'winner' : ''}">${escapeHtml(match.team1_name)}</span>
                            <span class="vs">VS</span>
                            <span class="team ${match.winner_id === match.team2_id ? 'winner' : ''}">${escapeHtml(match.team2_name)}</span>
                        </div>
                        ${match.score ? `<div class="match-score">Счёт: ${match.score}</div>` : ''}
                        ${match.prediction_deadline ? `<div class="prediction-deadline">Прогнозы до: ${new Date(match.prediction_deadline).toLocaleString()}</div>` : ''}
                    </div>
                    <div class="predictions-stats">
                        <span>Прогнозы: ${match.team1Votes || 0} vs ${match.team2Votes || 0}</span>
                    </div>
                    ${canPredict ? `
                        <div class="predict-actions">
                            <button onclick="makePrediction('${tournamentId}', '${match.id}', '${match.team1_id}')" class="predict-btn">${escapeHtml(match.team1_name)}</button>
                            <button onclick="makePrediction('${tournamentId}', '${match.id}', '${match.team2_id}')" class="predict-btn">${escapeHtml(match.team2_name)}</button>
                        </div>
                    ` : ''}
                    ${myPrediction ? `<div class="my-prediction">Ваш прогноз: ${myPrediction.predicted_winner_id === match.team1_id ? match.team1_name : match.team2_name} ${myPrediction.points_awarded ? `(+${myPrediction.points_awarded} очков)` : ''}</div>` : ''}
                    ${isOwner && match.status !== 'finished' ? `
                        <div class="match-admin">
                            <button onclick="setMatchResult('${tournamentId}', '${match.id}')">Указать результат</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }
    } else {
        html += `<p class="empty-message">Матчи ещё не созданы</p>`;
    }
    
    content.innerHTML = html;
}

function showCreateTournamentModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Создать турнир</h3>
            <input type="text" id="tournamentTitle" placeholder="Название турнира">
            <textarea id="tournamentDesc" placeholder="Описание" rows="3"></textarea>
            <input type="text" id="tournamentPrize" placeholder="Призовой фонд">
            <div class="modal-buttons">
                <button onclick="createTournament()">Создать</button>
                <button onclick="closeModal()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function createTournament() {
    const title = document.getElementById('tournamentTitle')?.value.trim();
    const description = document.getElementById('tournamentDesc')?.value.trim();
    const prizePool = document.getElementById('tournamentPrize')?.value.trim();
    if (!title) return tg.showAlert('Введите название');
    await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: currentUser.telegram_id, title, description, prizePool })
    });
    closeModal();
    tg.showAlert('Турнир создан');
    loadTournaments();
}

function showRegisterTeamModal(tournamentId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Добавить команду</h3>
            <input type="text" id="teamSearchInput" placeholder="Поиск команды..." oninput="searchTeamsForTournament()">
            <div id="searchResults" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="modal-buttons">
                <button onclick="closeModal()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    window.currentTournamentId = tournamentId;
}

async function searchTeamsForTournament() {
    const query = document.getElementById('teamSearchInput')?.value;
    if (!query) {
        document.getElementById('searchResults').innerHTML = '';
        return;
    }
    const res = await fetch(`/api/search/teams?q=${encodeURIComponent(query)}`);
    const teams = await res.json();
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = teams.map(team => `
        <div class="search-result-item" onclick="registerTeamToTournament('${window.currentTournamentId}', '${team.id}')">
            <strong>${escapeHtml(team.name)}</strong> (${team.members?.length || 0}/10)
        </div>
    `).join('');
}

async function registerTeamToTournament(tournamentId, teamId) {
    await fetch(`/api/tournaments/${tournamentId}/register-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, userId: currentUser.telegram_id })
    });
    closeModal();
    tg.showAlert('Команда добавлена');
    showTournamentDetail(tournamentId);
}

function showCreateMatchModal(tournamentId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Создать матч</h3>
            <input type="text" id="team1Id" placeholder="ID команды 1">
            <input type="text" id="team2Id" placeholder="ID команды 2">
            <input type="number" id="matchRound" placeholder="Раунд">
            <input type="datetime-local" id="predictionDeadline">
            <div class="modal-buttons">
                <button onclick="createMatchInTournament('${tournamentId}')">Создать</button>
                <button onclick="closeModal()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function createMatchInTournament(tournamentId) {
    const team1Id = document.getElementById('team1Id')?.value.trim();
    const team2Id = document.getElementById('team2Id')?.value.trim();
    const round = parseInt(document.getElementById('matchRound')?.value) || 1;
    const predictionDeadline = document.getElementById('predictionDeadline')?.value;
    if (!team1Id || !team2Id) return tg.showAlert('Введите ID команд');
    await fetch(`/api/tournaments/${tournamentId}/create-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team1Id, team2Id, round, predictionDeadline: predictionDeadline ? new Date(predictionDeadline).toISOString() : null, userId: currentUser.telegram_id })
    });
    closeModal();
    tg.showAlert('Матч создан');
    showTournamentDetail(tournamentId);
}

async function changeTournamentStatus(tournamentId, status) {
    await fetch(`/api/tournaments/${tournamentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, userId: currentUser.telegram_id })
    });
    tg.showAlert(`Статус изменён на ${status}`);
    showTournamentDetail(tournamentId);
}

async function setMatchResult(tournamentId, matchId) {
    const score = prompt('Введите счёт (например: 2:1)');
    if (!score) return;
    const winner = prompt('Введите ID команды-победителя');
    if (!winner) return;
    await fetch(`/api/tournaments/${tournamentId}/update-match-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, score, winnerId: winner, userId: currentUser.telegram_id })
    });
    tg.showAlert('Результат сохранён, очки начислены');
    showTournamentDetail(tournamentId);
}

async function makePrediction(tournamentId, matchId, predictedWinnerId) {
    await fetch(`/api/tournaments/${tournamentId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, predictedWinnerId, userId: currentUser.telegram_id })
    });
    tg.showAlert('Прогноз сохранён');
    showTournamentDetail(tournamentId);
}

async function showLeaderboard() {
    const res = await fetch('/api/leaderboard');
    const leaderboard = await res.json();
    const content = document.getElementById('content');
    content.innerHTML = `
        <button class="back-btn" onclick="showPage('profile')">Назад</button>
        <div class="leaderboard">
            <h2>Таблица лидеров</h2>
            ${leaderboard.map((u, i) => `
                <div class="leaderboard-item ${u.telegram_id == currentUser.telegram_id ? 'current-user' : ''}">
                    <span class="rank">${i + 1}</span>
                    <span class="username">${escapeHtml(u.username)}</span>
                    <span class="points">${u.prediction_points} очков</span>
                </div>
            `).join('')}
        </div>
    `;
}

// ==================== АДМИНКА ====================
async function showAdminPanel() {
    const statsRes = await fetch('/api/admin/stats');
    const stats = await statsRes.json();
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="admin-panel">
            <h2>Админ панель</h2>
            <div class="admin-stats-grid">
                <div class="admin-stat-card">Пользователи: ${stats.totalUsers}</div>
                <div class="admin-stat-card">Команды: ${stats.totalTeams}</div>
                <div class="admin-stat-card">Матчи: ${stats.totalMatches}</div>
                <div class="admin-stat-card">Турниры: ${stats.totalTournaments}</div>
                <div class="admin-stat-card">Забанено: ${stats.bannedUsers}</div>
            </div>
            <div class="admin-tabs">
                <button class="admin-tab active" onclick="loadAdminUsers()">Пользователи</button>
                <button class="admin-tab" onclick="loadAdminTeams()">Команды</button>
                <button class="admin-tab" onclick="loadAdminMatches()">Матчи</button>
                <button class="admin-tab" onclick="loadAdminTournaments()">Турниры</button>
            </div>
            <div id="adminContent"></div>
        </div>
    `;
    loadAdminUsers();
}

async function loadAdminUsers() {
    const res = await fetch('/api/admin/users');
    const users = await res.json();
    const adminContent = document.getElementById('adminContent');
    adminContent.innerHTML = `
        <h3>Пользователи</h3>
        ${users.map(u => `
            <div class="admin-user-card">
                <div>
                    <strong>${escapeHtml(u.username)}</strong>
                    <span class="user-id">ID: ${u.telegram_id}</span>
                    ${u.team_id ? `<span class="team-badge">В команде</span>` : ''}
                </div>
                <div class="admin-user-actions">
                    <span class="user-status ${u.is_banned ? 'banned' : 'active'}">${u.is_banned ? 'Забанен' : 'Активен'}</span>
                    <button onclick="banUser(${u.telegram_id}, ${!u.is_banned})" class="small-btn">${u.is_banned ? 'Разбанить' : 'Забанить'}</button>
                    <button onclick="deleteUser(${u.telegram_id})" class="small-btn danger">Удалить</button>
                </div>
            </div>
        `).join('')}
    `;
}

async function loadAdminTeams() {
    const res = await fetch('/api/admin/teams');
    const teams = await res.json();
    const adminContent = document.getElementById('adminContent');
    adminContent.innerHTML = `
        <h3>Команды</h3>
        ${teams.map(t => `
            <div class="admin-item-card">
                <div>
                    <strong>${escapeHtml(t.name)}</strong>
                    <span class="item-id">ID: ${t.id}</span>
                    <span>Участников: ${t.members?.length || 0}</span>
                </div>
                <button onclick="deleteTeamAdmin('${t.id}')" class="small-btn danger">Удалить</button>
            </div>
        `).join('')}
    `;
}

async function loadAdminMatches() {
    const res = await fetch('/api/admin/matches');
    const matches = await res.json();
    const adminContent = document.getElementById('adminContent');
    adminContent.innerHTML = `
        <h3>Матчи</h3>
        ${matches.map(m => `
            <div class="admin-item-card">
                <div>
                    <strong>${escapeHtml(m.team1_name)} vs ${escapeHtml(m.team2_name || '?')}</strong>
                    <span class="item-id">Статус: ${m.status}</span>
                </div>
                <button onclick="deleteMatchAdmin('${m.id}')" class="small-btn danger">Удалить</button>
            </div>
        `).join('')}
    `;
}

async function loadAdminTournaments() {
    const res = await fetch('/api/admin/tournaments');
    const tournaments = await res.json();
    const adminContent = document.getElementById('adminContent');
    adminContent.innerHTML = `
        <h3>Турниры</h3>
        ${tournaments.map(t => `
            <div class="admin-item-card">
                <div>
                    <strong>${escapeHtml(t.title)}</strong>
                    <span class="item-id">Статус: ${t.status}</span>
                    <span>Команд: ${t.teams?.length || 0}</span>
                </div>
                <button onclick="deleteTournament('${t.id}')" class="small-btn danger">Удалить</button>
            </div>
        `).join('')}
    `;
}

window.banUser = async (targetId, ban) => {
    await fetch('/api/admin/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetId, ban }) });
    tg.showAlert(ban ? 'Пользователь забанен' : 'Пользователь разбанен');
    loadAdminUsers();
};
window.deleteUser = async (targetId) => {
    if (!confirm('Удалить пользователя навсегда?')) return;
    await fetch('/api/admin/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetId }) });
    tg.showAlert('Пользователь удалён');
    loadAdminUsers();
};
window.deleteTeamAdmin = async (teamId) => {
    if (!confirm('Удалить команду?')) return;
    await fetch('/api/admin/delete-team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId }) });
    tg.showAlert('Команда удалена');
    loadAdminTeams();
};
window.deleteMatchAdmin = async (matchId) => {
    if (!confirm('Удалить матч?')) return;
    await fetch('/api/admin/delete-match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId }) });
    tg.showAlert('Матч удалён');
    loadAdminMatches();
};
window.deleteTournament = async (tournamentId) => {
    if (!confirm('Удалить турнир?')) return;
    await fetch('/api/admin/delete-tournament', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId }) });
    tg.showAlert('Турнир удалён');
    loadAdminTournaments();
};

// ==================== НАВИГАЦИЯ ====================
async function showPage(page) {
    const profileContainer = document.getElementById('profileContainer');
    if (page === 'profile') {
        profileContainer.style.display = 'block';
    } else {
        profileContainer.style.display = 'none';
    }
    
    switch(page) {
        case 'profile':
            await loadProfile();
            document.getElementById('content').innerHTML = '<div id="teamInfo"></div><button class="leaderboard-btn" onclick="showLeaderboard()">Таблица лидеров</button>';
            break;
        case 'teams':
            await loadTeams();
            break;
        case 'regular-matches':
            await loadRegularMatches();
            break;
        case 'tournament-matches':
            await loadTournamentMatches();
            break;
        case 'tournaments':
            await loadTournaments();
            break;
        case 'admin':
            if (isAdmin) await showAdminPanel();
            else tg.showAlert('Доступ запрещён');
            break;
        default:
            document.getElementById('content').innerHTML = '<div class="card">Страница не найдена</div>';
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-page') === page) btn.classList.add('active');
    });
}

function showAdminButton() {
    const nav = document.querySelector('.nav');
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.setAttribute('data-page', 'admin');
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M8 4l4 2 4-2"/><path d="M8 12h8"/><path d="M12 8v12"/><rect x="4" y="4" width="16" height="16" rx="2"/></svg><span>Админ</span>`;
    btn.onclick = () => showPage('admin');
    nav.appendChild(btn);
}

// Глобальные функции
window.selectImage = selectImage;
window.editProfile = editProfile;
window.saveProfile = saveProfile;
window.closeModal = closeModal;
window.loadTeams = loadTeams;
window.showTeamDetail = showTeamDetail;
window.showUserProfile = showUserProfile;
window.requestJoinTeam = requestJoinTeam;
window.acceptMember = acceptMember;
window.rejectMember = rejectMember;
window.leaveTeam = leaveTeam;
window.deleteTeam = deleteTeam;
window.showCreateTeamModal = showCreateTeamModal;
window.createTeam = createTeam;
window.searchTeams = searchTeams;
window.searchTeamsForTournament = searchTeamsForTournament;
window.registerTeamToTournament = registerTeamToTournament;
window.createMatch = createMatch;
window.joinMatch = joinMatch;
window.setGameCode = setGameCode;
window.finishMatch = finishMatch;
window.deleteMatch = deleteMatch;
window.showPage = showPage;
window.loadAdminUsers = loadAdminUsers;
window.loadAdminTeams = loadAdminTeams;
window.loadAdminMatches = loadAdminMatches;
window.loadAdminTournaments = loadAdminTournaments;
window.banUser = banUser;
window.deleteUser = deleteUser;
window.deleteTeamAdmin = deleteTeamAdmin;
window.deleteMatchAdmin;
window.deleteTournament = deleteTournament;
window.showTournamentDetail = showTournamentDetail;
window.showCreateTournamentModal = showCreateTournamentModal;
window.createTournament = createTournament;
window.showRegisterTeamModal = showRegisterTeamModal;
window.showCreateMatchModal = showCreateMatchModal;
window.createMatchInTournament = createMatchInTournament;
window.changeTournamentStatus = changeTournamentStatus;
window.setMatchResult = setMatchResult;
window.makePrediction = makePrediction;
window.showLeaderboard = showLeaderboard;
window.loadRegularMatches = loadRegularMatches;
window.loadTournamentMatches = loadTournamentMatches;

initAuth();
