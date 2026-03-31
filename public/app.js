let currentUser = null;
let currentToken = null;
let isAdmin = false;
let isTournamentAdmin = false;

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ==================== ЗАГРУЗКА ФОТО ИЗ ГАЛЕРЕИ ====================
async function uploadImageToCloudinary(file, type) {
    // Сначала показываем, что загрузка идет
    tg.showPopup({
        title: 'Загрузка',
        message: 'Загружаем изображение...',
        buttons: [{ type: 'ok' }]
    });
    
    // Используем бесплатный upload сервис (imgbb)
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        // Загружаем на imgbb (бесплатно, без регистрации)
        const response = await fetch('https://api.imgbb.com/1/upload?key=YOUR_IMGBB_API_KEY', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (data.success) {
            const imageUrl = data.data.url;
            
            // Сохраняем URL в профиль
            const updates = {};
            updates[type === 'avatar' ? 'avatarUrl' : 'bannerUrl'] = imageUrl;
            
            await fetch(`/api/profile/${currentUser.telegramId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            
            await loadProfile();
            tg.showAlert('✅ Изображение загружено!');
        } else {
            tg.showAlert('❌ Ошибка загрузки, попробуйте другое фото');
        }
    } catch (error) {
        console.error('Upload error:', error);
        tg.showAlert('❌ Ошибка загрузки');
    }
}

// Выбор фото из галереи
function selectImage(type) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadImageToCloudinary(file, type);
        }
    };
    input.click();
}

// ==================== АВТОРИЗАЦИЯ ====================
async function initAuth() {
    const user = tg.initDataUnsafe.user;
    if (!user) {
        console.log('No Telegram user data');
        return;
    }
    
    // Отображаем данные из Telegram сразу
    document.getElementById('username').textContent = user.username || user.first_name;
    if (user.photo_url) {
        document.getElementById('avatar').src = user.photo_url;
    } else {
        const initials = (user.first_name?.charAt(0) || '') + (user.last_name?.charAt(0) || '');
        document.getElementById('avatar').src = `https://ui-avatars.com/api/?name=${initials}&background=667eea&color=fff&size=100`;
    }
    
    // Отправляем на бекенд
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
    
    showPage('profile');
}

// ==================== ПРОФИЛЬ ====================
async function loadProfile() {
    if (!currentUser) return;
    
    const response = await fetch(`/api/profile/${currentUser.telegramId}`);
    const profile = await response.json();
    currentUser = profile;
    
    document.getElementById('username').textContent = profile.username;
    document.getElementById('description').textContent = profile.description || '🎮 Игрок в Brawl Stars';
    
    if (profile.avatarUrl) {
        document.getElementById('avatar').src = profile.avatarUrl;
    }
    
    if (profile.bannerUrl) {
        document.getElementById('banner').style.backgroundImage = `url(${profile.bannerUrl})`;
        document.getElementById('banner').style.backgroundSize = 'cover';
        document.getElementById('banner').style.backgroundPosition = 'center';
    }
    
    const linksHtml = (profile.links || []).map(link => 
        `<a href="${link.url}" target="_blank">${link.name}</a>`
    ).join('');
    document.getElementById('links').innerHTML = linksHtml;
}

function editProfile() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>✏️ Редактировать профиль</h3>
            <input type="text" id="editUsername" placeholder="Имя" value="${currentUser.username || ''}">
            <textarea id="editDescription" placeholder="О себе" rows="3">${currentUser.description || ''}</textarea>
            <button onclick="selectImage('avatar')" class="upload-btn">📸 Загрузить аватарку</button>
            <button onclick="selectImage('banner')" class="upload-btn">🖼️ Загрузить баннер</button>
            <div class="modal-buttons">
                <button onclick="saveProfile()">💾 Сохранить</button>
                <button onclick="closeModal()">❌ Отмена</button>
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
    tg.showAlert('✅ Профиль обновлен!');
}

function closeModal() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
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
                <div class="card team-card">
                    <div class="team-avatar">👥</div>
                    <h3>${team.name}</h3>
                    <p>${team.description || 'Нет описания'}</p>
                    <div class="team-stats">👥 ${team.members.length}/6 участников</div>
                    <button onclick="joinTeam('${team.id}')">🚀 Вступить</button>
                </div>
            `).join('')}
        </div>
    `;
}

function showCreateTeamModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>➕ Создать команду</h3>
            <input type="text" id="teamName" placeholder="Название команды">
            <textarea id="teamDesc" placeholder="Описание команды" rows="3"></textarea>
            <div class="modal-buttons">
                <button onclick="createTeam()">✅ Создать</button>
                <button onclick="closeModal()">❌ Отмена</button>
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
    tg.showAlert('✅ Команда создана!');
    loadTeams();
}

async function joinTeam(teamId) {
    await fetch(`/api/teams/${teamId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegramId })
    });
    tg.showAlert('✅ Вы вступили в команду!');
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
                        `<button class="code-btn" onclick="setGameCode('${match.id}')">📝 Кинуть код</button>` : ''}
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
    tg.showAlert('✅ Матч создан! Ожидайте игроков');
    loadMatches();
}

async function joinMatch(matchId) {
    await fetch(`/api/matches/${matchId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.telegramId })
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
        body: JSON.stringify({ userId: currentUser.telegramId, gameCode: code })
    });
    tg.showAlert('✅ Код отправлен участникам!');
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
    const content = document.getElementById('content');
    
    switch(page) {
        case 'profile':
            await loadProfile();
            content.innerHTML = '';
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
        if (btn.textContent.includes(page === 'profile' ? 'Профиль' : 
            page === 'teams' ? 'Команды' : 
            page === 'matches' ? 'Матчи' : 'Турниры')) {
            btn.classList.add('active');
        }
    });
}

function showAdminButton() {
    const nav = document.querySelector('.nav');
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.innerHTML = '👑 Админ';
    btn.onclick = () => tg.showAlert('Админ-панель в разработке');
    nav.appendChild(btn);
}

function showTournamentAdminButton() {
    const nav = document.querySelector('.nav');
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.innerHTML = '🎮 Турниры';
    btn.onclick = () => tg.showAlert('Турнирная админка в разработке');
    nav.appendChild(btn);
}

initAuth();
