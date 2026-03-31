let currentUser = null;
let currentToken = null;
let isAdmin = false;
let isTournamentAdmin = false;
let currentTeamView = null;

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
            console.error('Cloudinary error:', data);
            tg.showAlert('❌ Ошибка: ' + (data.error?.message || 'проверь настройки'));
        }
    } catch (error) {
        console.error('Upload error:', error);
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
    currentToken = data.token;
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
        document.getElementById('banner').style.backgroundImage = '';
        document.getElementById('banner').style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)';
    }
    
    // Получаем команду пользователя
    const userTeamRes = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const userTeam = await userTeamRes.json();
    
    const teamInfo = document.getElementById('teamInfo');
    if (teamInfo) {
        if (userTeam.team) {
            teamInfo.innerHTML = `
                <div class="user-team-card" onclick="showTeamDetail('${userTeam.team.id}')">
                    🏠 <strong>${escapeHtml(userTeam.team.name)}</strong>
                    <span class="team-link">→</span>
                </div>
            `;
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
    
    // Проверка на секретное имя для админа
    if (username === 'ghosty') {
        const response = await fetch('/api/become-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.telegram_id, secretName: username })
        });
        const result = await response.json();
        if (result.success) {
            isAdmin = true;
            tg.showAlert('🎉 Поздравляю! Теперь вы администратор!');
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
    tg.showAlert('✅ Профиль обновлен');
}

function closeModal() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
}

function editAvatar() {
    selectImage('avatar');
}

// ==================== КОМАНДЫ ====================
async function loadTeams() {
    const response = await fetch('/api/teams');
    const teams = await response.json();
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <button class="create-btn" onclick="showCreateTeamModal()">➕ Создать команду</button>
        <div class="teams-grid">
            ${teams.map(team => `
                <div class="card team-card" onclick="showTeamDetail('${team.id}')">
                    <div class="team-avatar">
                        ${team.avatar_url ? `<img src="${team.avatar_url}" class="team-avatar-img">` : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>'}
                    </div>
                    <h3>${escapeHtml(team.name)}</h3>
                    <p>${escapeHtml(team.description || 'Нет описания')}</p>
                    <div class="team-stats">👥 ${team.members?.length || 0}/6 участников</div>
                    ${team.owner_id == currentUser.telegram_id ? '<span class="owner-badge">👑 Создатель</span>' : ''}
                </div>
            `).join('')}
        </div>
    `;
}

async function showTeamDetail(teamId) {
    currentTeamView = teamId;
    const response = await fetch(`/api/teams/${teamId}`);
    const team = await response.json();
    const isTeamAdmin = team.owner_id == currentUser.telegram_id;
    const isMember = team.members?.includes(currentUser.telegram_id.toString());
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <button class="back-btn" onclick="loadTeams()">← Назад к командам</button>
        <div class="team-detail">
            <div class="team-banner" style="background-image: url('${team.banner_url || ''}'); background-size: cover; background-position: center;">
                ${!team.banner_url ? '<div class="team-banner-placeholder"></div>' : ''}
                ${isTeamAdmin ? `<button class="edit-banner-btn" onclick="selectImage('banner', '${teamId}')">✏️ Изменить баннер</button>` : ''}
            </div>
            <div class="team-detail-avatar">
                ${team.avatar_url ? `<img src="${team.avatar_url}" class="team-detail-img">` : '<div class="team-detail-img-placeholder">👥</div>'}
                ${isTeamAdmin ? `<button class="edit-avatar-btn" onclick="selectImage('avatar', '${teamId}')">✏️</button>` : ''}
            </div>
            <h2>${escapeHtml(team.name)}</h2>
            <p class="team-description">${escapeHtml(team.description || 'Нет описания')}</p>
            
            <div class="team-info-row">
                <div class="team-info-item">
                    <span class="info-label">👑 Создатель</span>
                    <span class="info-value">${team.owner_id == currentUser.telegram_id ? 'Вы' : `ID: ${team.owner_id}`}</span>
                </div>
                <div class="team-info-item">
                    <span class="info-label">👥 Участники</span>
                    <span class="info-value">${team.members?.length || 0}/6</span>
                </div>
            </div>
            
            <div class="team-members">
                <h3>📋 Список участников</h3>
                <div class="members-list">
                    ${team.members?.map(memberId => `
                        <div class="member-item">
                            <span class="member-avatar">👤</span>
                            <span class="member-name">Игрок ${memberId}</span>
                            ${memberId == team.owner_id ? '<span class="member-role owner">Создатель</span>' : ''}
                            ${memberId == currentUser.telegram_id ? '<span class="member-role you">Вы</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            
            ${!isMember && team.members?.length < 6 ? 
                `<button class="join-team-btn" onclick="joinTeam('${teamId}')">🚀 Вступить в команду</button>` : ''}
            
            ${isMember && !isTeamAdmin && team.members?.length > 1 ? 
                `<button class="leave-team-btn" onclick="leaveTeam('${teamId}')">🚪 Покинуть команду</button>` : ''}
            
            ${isTeamAdmin ? `
                <div class="team-admin-actions">
                    <button class="edit-team-btn" onclick="editTeam('${teamId}')">✏️ Редактировать команду</button>
                    <button class="delete-team-btn" onclick="deleteTeam('${teamId}')">🗑️ Удалить команду</button>
                </div>
            ` : ''}
        </div>
    `;
}

async function joinTeam(teamId) {
    const response = await fetch(`/api/teams/${teamId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    
    const result = await response.json();
    if (result.success) {
        tg.showAlert('✅ Вы вступили в команду!');
        await loadProfile();
        showTeamDetail(teamId);
    } else {
        tg.showAlert(result.error || 'Ошибка при вступлении');
    }
}

async function leaveTeam(teamId) {
    const confirm = await tg.showPopup({
        title: 'Покинуть команду',
        message: 'Вы уверены, что хотите покинуть команду?',
        buttons: [
            { id: 'yes', type: 'destructive', text: 'Покинуть' },
            { id: 'no', type: 'cancel', text: 'Отмена' }
        ]
    });
    
    if (confirm !== 'yes') return;
    
    const response = await fetch(`/api/teams/${teamId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    
    const result = await response.json();
    if (result.success) {
        tg.showAlert('✅ Вы покинули команду');
        await loadProfile();
        loadTeams();
    } else {
        tg.showAlert(result.error || 'Ошибка');
    }
}

async function deleteTeam(teamId) {
    const confirm = await tg.showPopup({
        title: 'Удалить команду',
        message: 'Вы уверены? Это действие нельзя отменить!',
        buttons: [
            { id: 'yes', type: 'destructive', text: 'Удалить' },
            { id: 'no', type: 'cancel', text: 'Отмена' }
        ]
    });
    
    if (confirm !== 'yes') return;
    
    const response = await fetch(`/api/teams/${teamId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    
    const result = await response.json();
    if (result.success) {
        tg.showAlert('✅ Команда удалена');
        await loadProfile();
        loadTeams();
    } else {
        tg.showAlert(result.error || 'Ошибка');
    }
}

function showCreateTeamModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>✨ Создать команду</h3>
            <input type="text" id="teamName" placeholder="Название команды" maxlength="30">
            <textarea id="teamDesc" placeholder="Описание команды" rows="3" maxlength="200"></textarea>
            <div class="modal-buttons">
                <button onclick="createTeam()">✅ Создать</button>
                <button onclick="closeModal()">❌ Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function createTeam() {
    const name = document.getElementById('teamName')?.value.trim();
    const description = document.getElementById('teamDesc')?.value.trim();
    
    if (!name) {
        tg.showAlert('Введите название команды');
        return;
    }
    
    if (name.length < 3) {
        tg.showAlert('Название должно быть минимум 3 символа');
        return;
    }
    
    const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            description,
            ownerId: currentUser.telegram_id
        })
    });
    
    const result = await response.json();
    if (result.id) {
        closeModal();
        tg.showAlert('✅ Команда создана!');
        await loadProfile();
        loadTeams();
    } else {
        tg.showAlert('Ошибка при создании');
    }
}

async function editTeam(teamId) {
    const response = await fetch(`/api/teams/${teamId}`);
    const team = await response.json();
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>✏️ Редактировать команду</h3>
            <input type="text" id="editTeamName" placeholder="Название" value="${escapeHtml(team.name)}">
            <textarea id="editTeamDesc" placeholder="Описание" rows="3">${escapeHtml(team.description || '')}</textarea>
            <button class="upload-btn" onclick="selectImage('avatar', '${teamId}'); closeModal();">📸 Загрузить аватарку</button>
            <button class="upload-btn" onclick="selectImage('banner', '${teamId}'); closeModal();">🖼️ Загрузить баннер</button>
            <div class="modal-buttons">
                <button onclick="saveTeam('${teamId}')">💾 Сохранить</button>
                <button onclick="closeModal()">❌ Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveTeam(teamId) {
    const name = document.getElementById('editTeamName')?.value.trim();
    const description = document.getElementById('editTeamDesc')?.value.trim();
    
    const updates = {};
    if (name) updates.name = name;
    if (description) updates.description = description;
    
    await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    
    closeModal();
    tg.showAlert('✅ Команда обновлена');
    showTeamDetail(teamId);
}

// ==================== МАТЧИ ====================
async function loadMatches() {
    const response = await fetch('/api/matches');
    const matches = await response.json();
    
    const userTeamRes = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const userTeam = await userTeamRes.json();
    const hasTeam = userTeam.team !== null;
    const userTeamId = userTeam.team?.id;
    
    const content = document.getElementById('content');
    content.innerHTML = `
        ${!hasTeam ? 
            `<div class="warning-banner">⚠️ Чтобы создать или найти матч, нужно быть в команде</div>` : 
            `<button class="create-btn" onclick="createMatch()">🎮 Создать матч (2v2)</button>`
        }
        <div class="matches-list">
            ${matches.map(match => `
                <div class="card match-card">
                    <div class="match-header">
                        <span class="match-status ${match.status}">
                            ${match.status === 'searching' ? '🔍 Поиск соперника' : 
                              match.status === 'ready' ? '✅ Готов к игре' : 
                              '🏆 Завершен'}
                        </span>
                    </div>
                    <div class="match-teams">
                        <div class="team-block ${match.team1 === userTeamId ? 'your-team' : ''}">
                            <strong>${escapeHtml(match.team1_name)}</strong>
                            ${match.team1 === userTeamId ? ' (ваша)' : ''}
                        </div>
                        <div class="vs">VS</div>
                        <div class="team-block ${match.team2 === userTeamId ? 'your-team' : ''}">
                            ${match.team2_name ? `<strong>${escapeHtml(match.team2_name)}</strong>` : '❓ Ожидание'}
                            ${match.team2 === userTeamId ? ' (ваша)' : ''}
                        </div>
                    </div>
                    ${match.game_code ? `<div class="match-code">🎮 Код игры: <strong>${match.game_code}</strong></div>` : ''}
                    ${match.winner ? `<div class="match-winner">🏆 Победитель: <strong>${match.winner === match.team1 ? match.team1_name : match.team2_name}</strong></div>` : ''}
                    
                    <div class="match-actions">
                        ${match.status === 'searching' && hasTeam && !match.team2 && match.team1 !== userTeamId ? 
                            `<button onclick="joinMatch('${match.id}')">➕ Присоединиться</button>` : ''}
                        
                        ${match.status === 'ready' && (match.team1 === userTeamId || match.team2 === userTeamId) && !match.game_code ? 
                            `<button class="code-btn" onclick="setGameCode('${match.id}')">📝 Отправить код</button>` : ''}
                        
                        ${match.status === 'ready' && (match.team1 === userTeamId || match.team2 === userTeamId) && match.game_code ? 
                            `<button class="finish-btn" onclick="finishMatch('${match.id}', '${match.team1 === userTeamId ? match.team1 : match.team2}')">🏆 Завершить матч</button>` : ''}
                        
                        ${(match.created_by == currentUser.telegram_id || isAdmin) && match.status !== 'finished' ? 
                            `<button class="delete-btn" onclick="deleteMatch('${match.id}')">🗑️ Удалить матч</button>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function createMatch() {
    const userTeamRes = await fetch(`/api/user/team/${currentUser.telegram_id}`);
    const userTeam = await userTeamRes.json();
    
    if (!userTeam.team) {
        tg.showAlert('Сначала вступите в команду');
        return;
    }
    
    const response = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            teamId: userTeam.team.id,
            createdBy: currentUser.telegram_id
        })
    });
    
    const match = await response.json();
    tg.showAlert('✅ Матч создан! Ждем соперника');
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
    tg.showAlert('✅ Вы присоединились к матчу!');
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
    tg.showAlert('✅ Код отправлен сопернику!');
    loadMatches();
}

async function finishMatch(matchId, winnerTeamId) {
    const result = await tg.showPopup({
        title: 'Завершить матч',
        message: 'Кто победил?',
        buttons: [
            { id: 'team1', type: 'default', text: 'Наша команда' },
            { id: 'team2', type: 'default', text: 'Соперник' },
            { id: 'cancel', type: 'cancel', text: 'Отмена' }
        ]
    });
    
    if (result === 'cancel') return;
    
    const matchRes = await fetch(`/api/matches/${matchId}`);
    const match = await matchRes.json();
    const winner = result === 'team1' ? winnerTeamId : (winnerTeamId === match.team1 ? match.team2 : match.team1);
    
    await fetch(`/api/matches/${matchId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner: winner })
    });
    tg.showAlert('🏆 Матч завершен!');
    loadMatches();
}

async function deleteMatch(matchId) {
    const result = await tg.showPopup({
        title: 'Удалить матч',
        message: 'Вы уверены?',
        buttons: [
            { id: 'yes', type: 'destructive', text: 'Удалить' },
            { id: 'no', type: 'cancel', text: 'Отмена' }
        ]
    });
    
    if (result !== 'yes') return;
    
    await fetch(`/api/matches/${matchId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegram_id })
    });
    tg.showAlert('✅ Матч удален');
    loadMatches();
}

// ==================== ТУРНИРЫ ====================
async function loadTournaments() {
    const response = await fetch('/api/tournaments');
    const tournaments = await response.json();
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="tournaments-list">
            ${tournaments.map(t => `
                <div class="card tournament-card">
                    <h3>🏆 ${escapeHtml(t.title)}</h3>
                    <p>${escapeHtml(t.description || 'Нет описания')}</p>
                    <div class="tournament-stats">
                        <span>👥 Команд: ${t.teams?.length || 0}</span>
                        <span class="tournament-status ${t.status}">${t.status === 'registration' ? '📝 Регистрация' : t.status === 'ongoing' ? '⚔️ Идет' : '🏆 Завершен'}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ==================== АДМИН ПАНЕЛЬ ====================
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
                    <span class="user-status ${u.is_banned ? 'banned' : 'active'}">
                        ${u.is_banned ? 'Забанен' : 'Активен'}
                    </span>
                    <button onclick="banUser(${u.telegram_id}, ${!u.is_banned})" class="small-btn">
                        ${u.is_banned ? 'Разбанить' : 'Забанить'}
                    </button>
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
    await fetch('/api/admin/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, ban })
    });
    tg.showAlert(ban ? 'Пользователь забанен' : 'Пользователь разбанен');
    loadAdminUsers();
};

window.deleteUser = async (targetId) => {
    if (!confirm('Удалить пользователя навсегда?')) return;
    await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId })
    });
    tg.showAlert('Пользователь удален');
    loadAdminUsers();
};

window.deleteTeamAdmin = async (teamId) => {
    if (!confirm('Удалить команду?')) return;
    await fetch('/api/admin/delete-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId })
    });
    tg.showAlert('Команда удалена');
    loadAdminTeams();
};

window.deleteMatchAdmin = async (matchId) => {
    if (!confirm('Удалить матч?')) return;
    await fetch('/api/admin/delete-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId })
    });
    tg.showAlert('Матч удален');
    loadAdminMatches();
};

window.deleteTournament = async (tournamentId) => {
    if (!confirm('Удалить турнир?')) return;
    await fetch('/api/admin/delete-tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId })
    });
    tg.showAlert('Турнир удален');
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
            if (isAdmin) {
                await showAdminPanel();
            } else {
                tg.showAlert('Доступ запрещен');
            }
            break;
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-page') === page) {
            btn.classList.add('active');
        }
    });
}

function showAdminButton() {
    const nav = document.querySelector('.nav');
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.setAttribute('data-page', 'admin');
    btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M8 4l4 2 4-2"></path>
            <path d="M8 12h8"></path>
            <path d="M12 8v12"></path>
            <rect x="4" y="4" width="16" height="16" rx="2"></rect>
        </svg>
        <span>Админ</span>
    `;
    btn.onclick = () => showPage('admin');
    nav.appendChild(btn);
}

function showTournamentAdminButton() {
    const nav = document.querySelector('.nav');
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.setAttribute('data-page', 'tournament-admin');
    btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M8 4l4 2 4-2"></path>
            <path d="M8 12h8"></path>
            <path d="M12 8v12"></path>
            <rect x="4" y="4" width="16" height="16" rx="2"></rect>
        </svg>
        <span>Турниры</span>
    `;
    btn.onclick = () => tg.showAlert('Турнирная админка в разработке');
    nav.appendChild(btn);
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Глобальные функции
window.selectImage = selectImage;
window.editProfile = editProfile;
window.saveProfile = saveProfile;
window.closeModal = closeModal;
window.editAvatar = editAvatar;
window.loadTeams = loadTeams;
window.showTeamDetail = showTeamDetail;
window.joinTeam = joinTeam;
window.leaveTeam = leaveTeam;
window.deleteTeam = deleteTeam;
window.showCreateTeamModal = showCreateTeamModal;
window.createTeam = createTeam;
window.editTeam = editTeam;
window.saveTeam = saveTeam;
window.createMatch = createMatch;
window.joinMatch = joinMatch;
window.setGameCode = setGameCode;
window.finishMatch = finishMatch;
window.deleteMatch = deleteMatch;
window.showPage = showPage;
window.banUser = banUser;
window.deleteUser = deleteUser;
window.deleteTeamAdmin = deleteTeamAdmin;
window.deleteMatchAdmin = deleteMatchAdmin;
window.deleteTournament = deleteTournament;
window.loadAdminUsers = loadAdminUsers;
window.loadAdminTeams = loadAdminTeams;
window.loadAdminMatches = loadAdminMatches;
window.loadAdminTournaments = loadAdminTournaments;

initAuth();
