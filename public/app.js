// ==================== ИНИЦИАЛИЗАЦИЯ ====================
let currentUser = null;
let isAdmin = false;
let isTournamentAdmin = false;

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ==================== CLOUDINARY ====================
const CLOUD_NAME = 'dew0bxfzo';
const UPLOAD_PRESET = 'nulls_community';

async function uploadImageToCloudinary(file, type, teamId = null) {
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
            
            if (teamId) {
                const teamRes = await fetch(`/api/teams/${teamId}`);
                const team = await teamRes.json();
                if (type === 'avatar') {
                    team.avatar_url = imageUrl;
                } else {
                    team.banner_url = imageUrl;
                }
                await fetch(`/api/teams/${teamId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(team)
                });
                showTeamDetail(teamId);
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
            tg.showAlert('✅ Изображение загружено');
        } else {
            tg.showAlert('❌ Ошибка загрузки');
        }
    } catch (error) {
        console.error(error);
        tg.showAlert('❌ Ошибка загрузки');
    }
}

function selectImage(type, teamId = null) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadImageToCloudinary(file, type, teamId);
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
    if (isTournamentAdmin || isAdmin) showTournamentAdminButton();
    
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
            teamInfo.innerHTML = `<div class="user-team-card" onclick="showTeamDetail('${userTeam.team.id}')">🏠 <strong>${escapeHtml(userTeam.team.name)}</strong> →</div>`;
        } else {
            teamInfo.innerHTML = `<div class="user-team-card">🏠 Вы не в команде</div>`;
        }
    }
}

function editProfile() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>✏️ Редактировать профиль</h3>
            <input type="text" id="editUsername" placeholder="Имя" value="${escapeHtml(currentUser.username || '')}">
            <textarea id="editDescription" placeholder="О себе" rows="3">${escapeHtml(currentUser.description || '')}</textarea>
            <button class="upload-btn" onclick="selectImage('avatar'); closeModal();">📸 Загрузить аватарку</button>
            <button class="upload-btn" onclick="selectImage('banner'); closeModal();">🖼️ Загрузить баннер</button>
            <div class="modal-buttons">
                <button onclick="saveProfile()">💾 Сохранить</button>
                <button onclick="closeModal()">❌ Отмена</button>
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
            tg.showAlert('Теперь вы админ!');
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
        <button class="create-btn" onclick="showCreateTeamModal()">➕ Создать команду</button>
        <div class="teams-grid">
            ${teams.map(team => `
                <div class="card team-card" onclick="showTeamDetail('${team.id}')">
                    <div class="team-avatar">
                        ${team.avatar_url ? `<img src="${team.avatar_url}" class="team-avatar-img">` : '👥'}
                    </div>
                    <h3>${escapeHtml(team.name)}</h3>
                    <p>${escapeHtml(team.description || 'Нет описания')}</p>
                    <div class="team-stats">👥 ${team.members?.length || 0}/10 участников</div>
                    ${team.owner_id == currentUser.telegram_id ? '<span class="owner-badge">Создатель</span>' : ''}
                </div>
            `).join('')}
        </div>
    `;
}

async function showTeamDetail(teamId) {
    const res = await fetch(`/api/teams/${teamId}`);
    const team = await res.json();
    const isTeamAdmin = team.owner_id == currentUser.telegram_id;
    const isMember = team.members?.includes(currentUser.telegram_id.toString());
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <button class="back-btn" onclick="loadTeams()">← Назад</button>
        <div class="team-detail">
            <div class="team-banner" style="background-image: url('${team.banner_url || ''}'); background-size: cover; background-position: center;">
                ${!team.banner_url ? '<div class="team-banner-placeholder"></div>' : ''}
                ${isTeamAdmin ? `<button class="edit-banner-btn" onclick="selectImage('banner', '${teamId}')">✏️ Изменить баннер</button>` : ''}
            </div>
            <div class="team-detail-avatar">
                ${team.avatar_url ? `<img src="${team.avatar_url}" class="team-detail-img">` : '<div class="team-detail-img-placeholder">👥</div>'}
                ${isTeamAdmin ? `<button class="edit-avatar-btn" onclick="selectImage('avatar', '${teamId}')">✏️ Изменить аватар</button>` : ''}
            </div>
            <h2>${escapeHtml(team.name)}</h2>
            <p class="team-description">${escapeHtml(team.description || 'Нет описания')}</p>
            <div class="team-members">
                <h3>Участники (${team.members?.length || 0}/10)</h3>
                <div class="members-list">
                    ${team.members?.map(m => `<div class="member-item">👤 Игрок ${m} ${m == team.owner_id ? '(создатель)' : ''} ${m == currentUser.telegram_id ? '(вы)' : ''}</div>`).join('')}
                </div>
            </div>
            ${!isMember && team.members?.length < 10 ? `<button class="join-team-btn" onclick="joinTeam('${teamId}')">Вступить</button>` : ''}
            ${isMember && !isTeamAdmin ? `<button class="leave-team-btn" onclick="leaveTeam('${teamId}')">Покинуть</button>` : ''}
            ${isTeamAdmin ? `<button class="delete-team-btn" onclick="deleteTeam('${teamId}')">Удалить команду</button>` : ''}
        </div>
    `;
}

async function joinTeam(teamId) {
    await fetch(`/api/teams/${teamId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    tg.showAlert('Вы вступили в команду');
    await loadUserTeam();
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
    await loadUserTeam();
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
    await loadUserTeam();
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

async function loadUserTeam() {
    if (!currentUser) return;
    const res = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const data = await res.json();
    const teamInfo = document.getElementById('teamInfo');
    if (teamInfo) {
        if (data.team) {
            teamInfo.innerHTML = `<div class="user-team-card" onclick="showTeamDetail('${data.team.id}')">🏠 <strong>${escapeHtml(data.team.name)}</strong> →</div>`;
        } else {
            teamInfo.innerHTML = `<div class="user-team-card">🏠 Вы не в команде</div>`;
        }
    }
}

// ==================== МАТЧИ (ОЧЕРЕДЬ, ЛЮБОЙ ЗАВЕРШАЕТ) ====================
async function loadMatches() {
    const res = await fetch('/api/matches');
    const matches = await res.json();
    const userTeamRes = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const userTeam = await userTeamRes.json();
    const myTeamId = userTeam.team?.id;

    const content = document.getElementById('content');
    if (!myTeamId) {
        content.innerHTML = `<div class="warning-banner">⚠️ Чтобы участвовать в матчах, вступите в команду</div>`;
        return;
    }

    const myMatches = matches.filter(m => m.team1 === myTeamId || m.team2 === myTeamId);
    const availableMatches = matches.filter(m => m.status === 'searching' && m.team1 !== myTeamId && !m.team2);

    let html = `<button class="create-btn" onclick="createMatch()">🎮 Создать матч (2v2)</button>`;

    if (availableMatches.length) {
        html += `<h3>Доступные матчи</h3>`;
        availableMatches.forEach(m => {
            html += `
                <div class="card match-card">
                    <div class="match-teams"><strong>${escapeHtml(m.team1_name)}</strong> ищет соперника</div>
                    <button onclick="joinMatch('${m.id}')">➕ Присоединиться</button>
                </div>
            `;
        });
    }

    if (myMatches.length) {
        html += `<h3>Мои матчи</h3>`;
        myMatches.forEach(m => {
            const isHost = m.team1 === myTeamId;
            const opponent = isHost ? m.team2_name : m.team1_name;
            html += `
                <div class="card match-card">
                    <div class="match-teams">
                        <strong>${escapeHtml(m.team1_name)}</strong> vs <strong>${escapeHtml(m.team2_name || '???')}</strong>
                    </div>
                    <div class="match-status ${m.status}">
                        ${m.status === 'searching' ? '⏳ Ожидание соперника' : (m.status === 'ready' ? '✅ Готов к игре' : '🏆 Завершён')}
                    </div>
                    ${m.game_code ? `<div class="match-code">🎮 Код: <strong>${m.game_code}</strong></div>` : ''}
                    ${m.winner ? `<div class="match-winner">🏆 Победитель: ${m.winner === m.team1 ? m.team1_name : m.team2_name}</div>` : ''}
                    <div class="match-actions">
                        ${m.status === 'ready' && !m.game_code && isHost ? 
                            `<button class="code-btn" onclick="setGameCode('${m.id}')">📝 Отправить код</button>` : ''}
                        ${m.status === 'ready' && m.game_code && (m.team1 === myTeamId || m.team2 === myTeamId) ? 
                            `<button class="finish-btn" onclick="finishMatch('${m.id}')">🏆 Завершить матч</button>` : ''}
                        ${(m.created_by == currentUser.telegram_id || isAdmin) && m.status !== 'finished' ? 
                            `<button class="delete-btn" onclick="deleteMatch('${m.id}')">🗑️ Удалить матч</button>` : ''}
                    </div>
                </div>
            `;
        });
    }

    if (!availableMatches.length && !myMatches.length) {
        html += `<div class="card">Нет активных матчей. Создайте новый!</div>`;
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
    loadMatches();
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
    loadMatches();
}

async function setGameCode(matchId) {
    const code = prompt('Введите код из Brawl Stars:');
    if (!code) return;
    await fetch(`/api/matches/${matchId}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode: code })
    });
    tg.showAlert('Код отправлен');
    loadMatches();
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
    loadMatches();
}

async function deleteMatch(matchId) {
    if (!confirm('Удалить матч?')) return;
    await fetch(`/api/matches/${matchId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    tg.showAlert('Матч удалён');
    loadMatches();
}

// ==================== ТУРНИРЫ (ЗАГЛУШКА) ====================
async function loadTournaments() {
    const content = document.getElementById('content');
    content.innerHTML = `<div class="card">🏆 Турниры появятся позже</div>`;
}

// ==================== АДМИНКА ====================
async function showAdminPanel() {
    const statsRes = await fetch('/api/admin/stats');
    const stats = await statsRes.json();
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="admin-panel">
            <h2>👑 Админ панель</h2>
            <div class="admin-stats-grid">
                <div class="admin-stat-card">👥 Пользователи: ${stats.totalUsers}</div>
                <div class="admin-stat-card">👥 Команды: ${stats.totalTeams}</div>
                <div class="admin-stat-card">⚔️ Матчи: ${stats.totalMatches}</div>
                <div class="admin-stat-card">🏆 Турниры: ${stats.totalTournaments}</div>
                <div class="admin-stat-card">🚫 Забанено: ${stats.bannedUsers}</div>
            </div>
            <div class="admin-tabs">
                <button class="admin-tab active" onclick="loadAdminUsers()">👥 Пользователи</button>
                <button class="admin-tab" onclick="loadAdminTeams()">👥 Команды</button>
                <button class="admin-tab" onclick="loadAdminMatches()">⚔️ Матчи</button>
                <button class="admin-tab" onclick="loadAdminTournaments()">🏆 Турниры</button>
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
        <h3>👥 Пользователи</h3>
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
        <h3>👥 Команды</h3>
        ${teams.map(t => `
            <div class="admin-item-card">
                <div>
                    <strong>${escapeHtml(t.name)}</strong>
                    <span class="item-id">ID: ${t.id}</span>
                    <span>👥 ${t.members?.length || 0} участников</span>
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
        <h3>⚔️ Матчи</h3>
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
        <h3>🏆 Турниры</h3>
        ${tournaments.map(t => `
            <div class="admin-item-card">
                <div>
                    <strong>${escapeHtml(t.title)}</strong>
                    <span class="item-id">Статус: ${t.status}</span>
                    <span>👥 ${t.teams?.length || 0} команд</span>
                </div>
                <button onclick="deleteTournament('${t.id}')" class="small-btn danger">Удалить</button>
            </div>
        `).join('')}
    `;
}

// Админские действия
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
            document.getElementById('content').innerHTML = '<div id="teamInfo"></div>';
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

function showTournamentAdminButton() {
    const nav = document.querySelector('.nav');
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.setAttribute('data-page', 'tournament-admin');
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M8 4l4 2 4-2"/><path d="M8 12h8"/><path d="M12 8v12"/><rect x="4" y="4" width="16" height="16" rx="2"/></svg><span>Турниры</span>`;
    btn.onclick = () => tg.showAlert('Турнирная админка в разработке');
    nav.appendChild(btn);
}

// Глобальные функции
window.selectImage = selectImage;
window.editProfile = editProfile;
window.saveProfile = saveProfile;
window.closeModal = closeModal;
window.loadTeams = loadTeams;
window.showTeamDetail = showTeamDetail;
window.joinTeam = joinTeam;
window.leaveTeam = leaveTeam;
window.deleteTeam = deleteTeam;
window.showCreateTeamModal = showCreateTeamModal;
window.createTeam = createTeam;
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
window.deleteMatchAdmin = deleteMatchAdmin;
window.deleteTournament = deleteTournament;

initAuth();
