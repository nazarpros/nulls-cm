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
                    team.avatarUrl = imageUrl;
                } else {
                    team.bannerUrl = imageUrl;
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
                    updates.avatarUrl = imageUrl;
                } else {
                    updates.bannerUrl = imageUrl;
                }
                await fetch(`/api/profile/${currentUser.telegramId}`, {
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
    
    const response = await fetch(`/api/profile/${currentUser.telegramId}`);
    const profile = await response.json();
    currentUser = profile;
    
    document.getElementById('username').textContent = profile.username;
    document.getElementById('description').textContent = profile.description || 'Игрок в Brawl Stars';
    
    if (profile.avatarUrl) {
        document.getElementById('avatar').src = profile.avatarUrl;
    }
    
    if (profile.bannerUrl) {
        document.getElementById('banner').style.backgroundImage = `url(${profile.bannerUrl})`;
        document.getElementById('banner').style.backgroundSize = 'cover';
        document.getElementById('banner').style.backgroundPosition = 'center';
    } else {
        document.getElementById('banner').style.backgroundImage = '';
        document.getElementById('banner').style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)';
    }
}

function editProfile() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редактировать профиль</h3>
            <input type="text" id="editUsername" placeholder="Имя" value="${currentUser.username || ''}">
            <textarea id="editDescription" placeholder="О себе" rows="3">${currentUser.description || ''}</textarea>
            <button class="upload-btn" onclick="selectImage('avatar'); closeModal();">📸 Загрузить аватарку</button>
            <button class="upload-btn" onclick="selectImage('banner'); closeModal();">🖼️ Загрузить баннер</button>
            <div class="modal-buttons">
                <button onclick="saveProfile()">Сохранить</button>
                <button onclick="closeModal()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveProfile() {
    const username = document.getElementById('editUsername')?.value;
    const description = document.getElementById('editDescription')?.value;
    
    const updates = {};
    if (username) updates.username = username;
    if (description) updates.description = description;
    
    await fetch(`/api/profile/${currentUser.telegramId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    
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
                        ${team.avatarUrl ? `<img src="${team.avatarUrl}" class="team-avatar-img">` : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>'}
                    </div>
                    <h3>${team.name}</h3>
                    <p>${team.description || 'Нет описания'}</p>
                    <div class="team-stats">${team.members.length}/6 участников</div>
                </div>
            `).join('')}
        </div>
    `;
}

async function showTeamDetail(teamId) {
    currentTeamView = teamId;
    const response = await fetch(`/api/teams/${teamId}`);
    const team = await response.json();
    const isTeamAdmin = team.ownerId === currentUser.telegramId;
    const isMember = team.members.includes(currentUser.telegramId);
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <button class="back-btn" onclick="loadTeams()">← Назад</button>
        <div class="team-detail">
            <div class="team-banner" style="background-image: url('${team.bannerUrl || ''}'); background-size: cover; background-position: center;">
                ${!team.bannerUrl ? '<div class="team-banner-placeholder"></div>' : ''}
                ${isTeamAdmin ? `<button class="edit-banner-btn" onclick="selectImage('banner', '${teamId}')">✏️ Изменить баннер</button>` : ''}
            </div>
            <div class="team-detail-avatar">
                ${team.avatarUrl ? `<img src="${team.avatarUrl}" class="team-detail-img">` : '<div class="team-detail-img-placeholder"></div>'}
                ${isTeamAdmin ? `<button class="edit-avatar-btn" onclick="selectImage('avatar', '${teamId}')">✏️</button>` : ''}
            </div>
            <h2>${team.name}</h2>
            <p class="team-description">${team.description || 'Нет описания'}</p>
            <div class="team-members">
                <h3>Участники (${team.members.length}/6)</h3>
                <div class="members-list">
                    ${team.members.map(memberId => `<div class="member-item">👤 Игрок ${memberId}</div>`).join('')}
                </div>
            </div>
            ${!isMember && team.members.length < 6 ? 
                `<button class="join-team-btn" onclick="joinTeam('${teamId}')">Вступить в команду</button>` : ''}
        </div>
    `;
}

async function joinTeam(teamId) {
    await fetch(`/api/teams/${teamId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegramId })
    });
    tg.showAlert('✅ Вы вступили в команду');
    showTeamDetail(teamId);
}

function showCreateTeamModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Создать команду</h3>
            <input type="text" id="teamName" placeholder="Название команды">
            <textarea id="teamDesc" placeholder="Описание команды" rows="3"></textarea>
            <div class="modal-buttons">
                <button onclick="createTeam()">Создать</button>
                <button onclick="closeModal()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function createTeam() {
    const name = document.getElementById('teamName')?.value;
    const description = document.getElementById('teamDesc')?.value;
    
    if (!name) {
        tg.showAlert('Введите название команды');
        return;
    }
    
    await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            description,
            ownerId: currentUser.telegramId
        })
    });
    
    closeModal();
    tg.showAlert('✅ Команда создана');
    loadTeams();
}

// ==================== МАТЧИ ====================
async function loadMatches() {
    const response = await fetch('/api/matches');
    const matches = await response.json();
    
    const content = document.getElementById('content');
    content.innerHTML = `
        <button class="create-btn" onclick="createMatch()">🎮 Создать матч 3x3</button>
        <div class="matches-list">
            ${matches.map(match => `
                <div class="card match-card">
                    <div class="match-header">
                        <span class="match-status ${match.status}">${match.status === 'waiting' ? '⏳ Ожидание' : '✅ Готов'}</span>
                        <span class="match-players">👥 ${match.participants.length}/6</span>
                    </div>
                    ${match.gameCode ? `<div class="match-code">🎮 Код: <strong>${match.gameCode}</strong></div>` : ''}
                    ${match.participants.length < 6 && !match.participants.includes(currentUser.telegramId) ? 
                        `<button onclick="joinMatch('${match.id}')">➕ Присоединиться</button>` : ''}
                    ${match.createdBy === currentUser.telegramId && !match.gameCode ? 
                        `<button class="code-btn" onclick="setGameCode('${match.id}')">📝 Отправить код</button>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

async function createMatch() {
    await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: currentUser.telegramId })
    });
    tg.showAlert('✅ Матч создан');
    loadMatches();
}

async function joinMatch(matchId) {
    await fetch(`/api/matches/${matchId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegramId })
    });
    tg.showAlert('✅ Вы присоединились к матчу');
    loadMatches();
}

async function setGameCode(matchId) {
    const code = prompt('Введите код из Brawl Stars:');
    if (!code) return;
    
    await fetch(`/api/matches/${matchId}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegramId, gameCode: code })
    });
    tg.showAlert('✅ Код отправлен');
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
                    <h3>🏆 ${t.title}</h3>
                    <p>${t.description || 'Нет описания'}</p>
                    <div class="tournament-stats">
                        <span>👥 Команд: ${t.teams.length}</span>
                        <span class="tournament-status ${t.status}">${t.status === 'registration' ? '📝 Регистрация' : t.status === 'ongoing' ? '⚔️ Идет' : '🏆 Завершен'}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

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
            document.getElementById('content').innerHTML = '';
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
    btn.onclick = () => tg.showAlert('Админ-панель в разработке');
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

// Глобальные функции
window.selectImage = selectImage;
window.editProfile = editProfile;
window.saveProfile = saveProfile;
window.closeModal = closeModal;
window.editAvatar = editAvatar;
window.loadTeams = loadTeams;
window.showTeamDetail = showTeamDetail;
window.joinTeam = joinTeam;
window.showCreateTeamModal = showCreateTeamModal;
window.createTeam = createTeam;
window.createMatch = createMatch;
window.joinMatch = joinMatch;
window.setGameCode = setGameCode;
window.showPage = showPage;

initAuth();
