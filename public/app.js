// ==================== ИНИЦИАЛИЗАЦИЯ ====================
let currentUser = null;
let isAdmin = false;
let isTournamentAdmin = false;

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

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
    if (!user) {
        console.log('No Telegram user');
        return;
    }
    
    document.getElementById('username').textContent = user.username || user.first_name;
    if (user.photo_url) {
        document.getElementById('avatar').src = user.photo_url;
    }
    
    try {
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
        
        // Обновляем профиль
        document.getElementById('description').textContent = currentUser.description || 'Игрок в Brawl Stars';
        if (currentUser.avatar_url) document.getElementById('avatar').src = currentUser.avatar_url;
        if (currentUser.banner_url) {
            document.getElementById('banner').style.backgroundImage = `url(${currentUser.banner_url})`;
            document.getElementById('banner').style.backgroundSize = 'cover';
        }
        
        // Показываем кнопку админа, если нужно
        if (isAdmin) showAdminButton();
        
        // Загружаем команду пользователя
        await loadUserTeam();
        
        // Назначаем обработчики навигации
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                const page = btn.getAttribute('data-page');
                if (page) showPage(page);
            };
        });
        
        // Показываем профиль по умолчанию
        showPage('profile');
    } catch (err) {
        console.error('Auth error:', err);
        tg.showAlert('Ошибка подключения к серверу');
    }
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

// ==================== ПРОФИЛЬ ====================
async function loadProfile() {
    if (!currentUser) return;
    const res = await fetch(`/api/profile/${currentUser.telegram_id}`);
    const profile = await res.json();
    currentUser = profile;
    document.getElementById('username').textContent = profile.username;
    document.getElementById('description').textContent = profile.description || 'Игрок в Brawl Stars';
    if (profile.avatar_url) document.getElementById('avatar').src = profile.avatar_url;
    if (profile.banner_url) {
        document.getElementById('banner').style.backgroundImage = `url(${profile.banner_url})`;
        document.getElementById('banner').style.backgroundSize = 'cover';
    }
    await loadUserTeam();
}

function editProfile() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редактировать профиль</h3>
            <input type="text" id="editUsername" placeholder="Имя" value="${escapeHtml(currentUser.username || '')}">
            <textarea id="editDescription" placeholder="О себе" rows="3">${escapeHtml(currentUser.description || '')}</textarea>
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
                    <div class="team-avatar">${team.avatar_url ? `<img src="${team.avatar_url}" class="team-avatar-img">` : '👥'}</div>
                    <h3>${escapeHtml(team.name)}</h3>
                    <p>${escapeHtml(team.description || 'Нет описания')}</p>
                    <div class="team-stats">👥 ${team.members?.length || 0}/6</div>
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
            <div class="team-banner" style="background-image: url('${team.banner_url || ''}'); background-size: cover;">
                ${!team.banner_url ? '<div class="team-banner-placeholder"></div>' : ''}
            </div>
            <div class="team-detail-avatar">
                ${team.avatar_url ? `<img src="${team.avatar_url}" class="team-detail-img">` : '<div class="team-detail-img-placeholder">👥</div>'}
            </div>
            <h2>${escapeHtml(team.name)}</h2>
            <p class="team-description">${escapeHtml(team.description || 'Нет описания')}</p>
            <div class="team-members">
                <h3>Участники (${team.members?.length || 0}/6)</h3>
                <div class="members-list">
                    ${team.members?.map(m => `<div class="member-item">👤 Игрок ${m} ${m == team.owner_id ? '(создатель)' : ''} ${m == currentUser.telegram_id ? '(вы)' : ''}</div>`).join('')}
                </div>
            </div>
            ${!isMember && team.members?.length < 6 ? `<button class="join-team-btn" onclick="joinTeam('${teamId}')">Вступить</button>` : ''}
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

// ==================== МАТЧИ (заглушка) ====================
async function loadMatches() {
    document.getElementById('content').innerHTML = `<div class="card">Матчи появятся позже</div>`;
}

// ==================== ТУРНИРЫ (заглушка) ====================
async function loadTournaments() {
    document.getElementById('content').innerHTML = `<div class="card">Турниры появятся позже</div>`;
}

// ==================== АДМИНКА (твоя, исправленная) ====================
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
    tg.showAlert('Пользователь удалён');
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
    tg.showAlert('Матч удалён');
    loadAdminMatches();
};

window.deleteTournament = async (tournamentId) => {
    if (!confirm('Удалить турнир?')) return;
    await fetch('/api/admin/delete-tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId })
    });
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

// Экспорт глобальных функций
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

// Запуск
initAuth();
