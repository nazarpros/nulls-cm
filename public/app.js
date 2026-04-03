// Простейший тест навигации
console.log('app.js loaded');

// Обработчик события загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    // Находим все кнопки навигации
    const navButtons = document.querySelectorAll('.nav-btn');
    const profileContainer = document.getElementById('profileContainer');
    const contentDiv = document.getElementById('content');
    
    // Функция показа страницы
    window.showPage = function(page) {
        console.log('showPage called with:', page);
        
        // Скрываем или показываем профиль
        if (page === 'profile') {
            profileContainer.style.display = 'block';
        } else {
            profileContainer.style.display = 'none';
        }
        
        // Очищаем контент
        contentDiv.innerHTML = '<div style="padding: 20px; text-align: center;">Загрузка...</div>';
        
        // Показываем нужную страницу
        switch(page) {
            case 'profile':
                contentDiv.innerHTML = '<div style="padding: 20px; text-align: center;">👤 Это страница профиля</div>';
                break;
            case 'teams':
                contentDiv.innerHTML = '<div style="padding: 20px; text-align: center;">👥 Это страница команд</div>';
                break;
            case 'matches':
                contentDiv.innerHTML = '<div style="padding: 20px; text-align: center;">⚔️ Это страница матчей</div>';
                break;
            case 'tournaments':
                contentDiv.innerHTML = '<div style="padding: 20px; text-align: center;">🏆 Это страница турниров</div>';
                break;
            default:
                contentDiv.innerHTML = '<div style="padding: 20px; text-align: center;">Неизвестная страница</div>';
        }
        
        // Обновляем активную кнопку
        navButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-page') === page) {
                btn.classList.add('active');
            }
        });
    };
    
    // Назначаем обработчики на кнопки
    navButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const page = this.getAttribute('data-page');
            if (page) {
                window.showPage(page);
            }
        });
    });
    
    // Показываем профиль по умолчанию
    window.showPage('profile');
});
