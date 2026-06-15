const userJSON = localStorage.getItem('currentUser');
if (!userJSON) window.location.href = 'login.html';

const user = JSON.parse(userJSON);
if (user.role !== 'student') window.location.href = 'dashboard.html';

document.getElementById('userName').innerText = user.full_name;

let allLessonsSchedule = [];

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

function switchTab(tabName) {
    document.getElementById('btn-dashboard').classList.toggle('active', tabName === 'dashboard');
    document.getElementById('btn-curriculum').classList.toggle('active', tabName === 'curriculum');

    if (tabName === 'dashboard') renderDashboard();
    else if (tabName === 'curriculum') loadStudentCurriculum();
}

function renderDashboard() {
    document.getElementById('page-title').innerText = 'Особистий кабінет';
    
    // Відновлюємо HTML-структуру для вкладки кабінету (зберігаючи класи)
    document.getElementById('content-area').innerHTML = `
        <div class="dashboard-stats">
            <div class="stat-card">
                <h3 class="stat-title">Мої Логіки </h3>
                <p id="studentLogikas" class="stat-value-green">0</p>
            </div>
            <div class="stat-card">
                <h3 class="stat-title">Залишок занять </h3>
                <p id="studentLessons" class="stat-value-purple">0</p>
            </div>
        </div>
        <div id="nearest-lesson-box" class="mb-25"></div>
        <div class="mt-20">
            <button id="toggleScheduleBtn" class="btn-secondary" onclick="toggleFullSchedule()">Розгорнути весь розклад</button>
        </div>
        <div id="full-schedule-container" class="hidden-container mt-20">
            <h3 class="schedule-title">Усі заняття курсу</h3>
            <div id="schedule-area"><p>Завантаження розкладу...</p></div>
        </div>
    `;
    loadStudentData();
}

let isScheduleExpanded = false;
window.toggleFullSchedule = function() {
    const container = document.getElementById('full-schedule-container');
    const btn = document.getElementById('toggleScheduleBtn');
    isScheduleExpanded = !isScheduleExpanded;
    container.style.display = isScheduleExpanded ? 'block' : 'none';
    btn.innerText = isScheduleExpanded ? ' Згорнути розклад' : ' Розгорнути весь розклад';
}

async function loadStudentData() {
    try {
        // Отримуємо баланс логіків
        const profileRes = await fetch(`/api/students/${user.id}`);
        const profileInfo = await profileRes.json();
        document.getElementById('studentLogikas').innerText = profileInfo.total_logikas || 0;
        document.getElementById('studentLessons').innerText = profileInfo.lessons_left || 0;

        if (!user.group_id) return;

        // Отримуємо розклад
        const res = await fetch(`/api/schedule/group/${user.group_id}`);
        const lessons = await res.json();
        
        const nearestBox = document.getElementById('nearest-lesson-box');
        const area = document.getElementById('schedule-area');
        
        const now = new Date();
        const next = lessons.find(l => new Date(l.lesson_date) >= now) || lessons[lessons.length - 1];

        if (next) {
            nearestBox.innerHTML = `
                <div class="nearest-lesson-card">
                    <h3>Найближче: ${next.topic}</h3>
                    <p>Час: ${new Date(next.lesson_date).toLocaleString('uk-UA')}</p>
                </div>
            `;
        }
        
        area.innerHTML = `<table class="data-table">
            <thead><tr><th>Дата</th><th>Тема</th><th>Статус</th></tr></thead>
            <tbody>${lessons.map(l => 
                `<tr>
                    <td>${new Date(l.lesson_date).toLocaleDateString('uk-UA')}</td>
                    <td>${l.topic}</td>
                    <td><span style="font-weight:bold; color: ${l.status === 'Завершено' ? '#2ed573' : '#8c7ae6'}">${l.status || 'Заплановано'}</span></td>
                </tr>`
            ).join('')}</tbody>
        </table>`;
    } catch (e) { console.error(e); }
}

async function loadStudentCurriculum() {
    document.getElementById('page-title').innerText = 'Програма курсу';
    const contentArea = document.getElementById('content-area');
    
    try {
        const res = await fetch(`/api/curriculum?group_id=${user.group_id}`);
        allLessonsSchedule = await res.json();

        const modules = {};
        allLessonsSchedule.forEach(l => {
            const mod = l.lesson_number <= 4 ? 1 : 2;
            if (!modules[mod]) modules[mod] = [];
            modules[mod].push(l);
        });

        let html = `<div class="curriculum-wrapper"><div class="main-panel" id="lessons-view"></div><div class="side-panel" id="module-nav"><h3>Модулі</h3></div></div>`;
        contentArea.innerHTML = html;

        const nav = document.getElementById('module-nav');
        for (const mod in modules) {
            const btn = document.createElement('button');
            btn.className = 'mod-btn';
            btn.innerText = mod;
            btn.onclick = () => showModule(mod, modules);
            nav.appendChild(btn);
        }
        showModule(Object.keys(modules)[0], modules);
    } catch (e) { contentArea.innerHTML = '<p class="error-text">Помилка завантаження</p>'; }
}

window.showModule = function(modNum, modules) {
    const view = document.getElementById('lessons-view');
    view.innerHTML = `<h3 class="mb-20">Модуль №${modNum}</h3>` + modules[modNum].map(l => {
        const tasks = (l.homework_task || '').split(',').filter(link => link.trim() !== '');
        
        return `
            <div class="module-lesson-card">
                <p class="lesson-topic">${l.topic}</p>
                <div class="task-circles-container">
                    ${tasks.length > 0 
                        ? tasks.map((link, i) => {
                            // Екрануємо лапки в темах, щоб JS не ругався
                            const safeTopic = l.topic.replace(/'/g, "\\'").replace(/"/g, '\\"');
                            // Тепер при кліку на кружечок відкривається наше модальне вікно
                            return `<div class="circle" onclick="openHomeworkModal(${l.id}, '${safeTopic}', '${link.trim()}')">${i + 1}</div>`;
                        }).join('')
                        : `<span class="readonly-text">Завдань немає</span>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

// ФУНКЦІЇ ДЛЯ МОДАЛЬНОГО ВІКНА ЗДАЧІ ДЗ
window.openHomeworkModal = function(lessonId, topic, taskLink) {
    const modal = document.getElementById('submitHomeworkModal');
    document.getElementById('modalLessonTopic').innerText = topic;
    document.getElementById('modalTaskLink').href = taskLink;
    
    // Скидаємо поля та статуси перед відкриттям
    document.getElementById('studentHomeworkUrl').value = '';
    document.getElementById('studentHomeworkUrl').style.borderColor = '#ced6e0';
    const statusText = document.getElementById('submissionStatus');
    statusText.style.display = 'none';

    // Налаштовуємо кнопку відправки на роботу з конкретним ID уроку
    const submitBtn = document.getElementById('submitHomeworkBtn');
    submitBtn.onclick = () => submitHomework(lessonId);

    modal.style.display = 'flex';
}

window.closeHomeworkModal = function() {
    document.getElementById('submitHomeworkModal').style.display = 'none';
}

async function submitHomework(lessonId) {
    const homeworkUrlInput = document.getElementById('studentHomeworkUrl');
    const statusText = document.getElementById('submissionStatus');
    const url = homeworkUrlInput.value.trim();

    if (!url || !url.startsWith('http')) {
        alert("Будь ласка, вкажіть правильне посилання (починаючи з http:// або https://)");
        return;
    }

    const data = {
        lesson_id: lessonId,
        student_id: user.id, // ID учня з localStorage
        homework_url: url,
        is_present: 1 // Автоматично ставимо, що учень працював
    };

    try {
        statusText.style.display = 'block';
        statusText.style.color = '#8c7ae6';
        statusText.innerText = 'Надсилання роботи викладачу...';

        const response = await fetch('/api/journal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            statusText.style.color = '#2ed573';
            statusText.innerText = 'Роботу успішно здано вчителю!';
            homeworkUrlInput.style.borderColor = '#2ed573';
        } else {
            statusText.style.color = '#ff4757';
            statusText.innerText = 'Помилка: ' + result.error;
        }
    } catch (error) {
        statusText.style.color = '#ff4757';
        statusText.innerText = 'Помилка з\'єднання з сервером';
    }
}

// Запуск при завантаженні
renderDashboard();
