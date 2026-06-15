const userJSON = localStorage.getItem('currentUser');
if (!userJSON) window.location.href = 'login.html';

const user = JSON.parse(userJSON);
document.getElementById('userName').innerText = user.full_name;

let allStudents = [];
let allGroups = [];
let allLessonsSchedule = [];

// КЕРУВАННЯ ВКЛАДКАМИ
function switchTab(tabName) {
    // Додали 'teachers' у загальний список, щоб активність кнопок скидалася правильно
    const tabs = ['students', 'groups', 'schedule', 'tasks', 'curriculum', 'teachers'];
    tabs.forEach(t => {
        const btn = document.getElementById(`btn-${t}`);
        if (btn) btn.classList.remove('active');
    });
    
    const activeBtn = document.getElementById(`btn-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabName === 'students') loadStudents();
    if (tabName === 'groups') loadGroups();
    if (tabName === 'schedule') loadSchedule();
    if (tabName === 'tasks') loadTasks();
    if (tabName === 'curriculum') loadCurriculum();
    if (tabName === 'teachers') loadTeachersTable(); // Пряме підключення викладачів
}

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

// ==========================================
// БЛОК: УЧНІ
// ==========================================
async function loadStudents() {
    document.getElementById('page-title').innerText = 'Контингент учнів';
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<p>Завантаження...</p>';

    try {
        const response = await fetch('/api/students');
        allStudents = await response.json();
        renderStudentTable(allStudents);
    } catch (error) {
        contentArea.innerHTML = '<p class="error-text">Помилка завантаження даних.</p>';
    }
}

function renderStudentTable(studentsList) {
    const contentArea = document.getElementById('content-area');
    let html = `
        <div class="action-bar">
            <div class="action-bar-left">
                ${user.role === 'manager' ? '<button class="btn-primary" onclick="openAddStudentModal()">+ Додати учня</button>' : ''}
                <button class="btn-secondary" onclick="exportToExcel('Учні.xlsx')">Експорт</button>
            </div>
            <div class="search-wrapper">
                <input type="text" id="studentSearchInput" class="search-input" placeholder="🔍 Швидкий пошук за ПІБ..." oninput="filterStudents(this.value)">
            </div>
        </div>
    `;

    if (studentsList.length === 0) {
        contentArea.innerHTML = html + '<p>Нічого не знайдено.</p>';
        return;
    }

    html += `
        <table class="data-table" id="exportData">
            <thead>
                <tr><th>ID</th><th>ПІБ учня</th><th>Вік</th><th>Телефон</th><th>Група</th><th>Дії</th></tr>
            </thead>
            <tbody>
    `;

    studentsList.forEach(student => {
        const groupDisplay = student.group_name ? `Група: ${student.group_name}` : '<span class="error-text">Без групи</span>';
        const actionBtn = user.role === 'manager' 
            ? `<button class="btn-secondary small-btn" onclick="assignGroupToStudent(${student.id})">Змінити групу</button>` 
            : `<span class="readonly-text">Тільки перегляд</span>`;

        html += `
            <tr>
                <td>${student.id}</td>
                <td><strong>${student.full_name}</strong></td>
                <td>${student.age}</td>
                <td>${student.parent_phone}</td>
                <td>${groupDisplay}</td>
                <td>${actionBtn}</td>
            </tr>
        `;
    });

    contentArea.innerHTML = html + `</tbody></table>`;
}

function filterStudents(query) {
    const cleanQuery = query.toLowerCase().trim();
    const filtered = allStudents.filter(s => s.full_name.toLowerCase().includes(cleanQuery));
    renderStudentTable(filtered);
    document.getElementById('studentSearchInput').value = query;
}

async function assignGroupToStudent(studentId) {
    const newGroupId = prompt("Введіть ID групи:");
    if (newGroupId === null) return;
    try {
        const response = await fetch(`/api/students/${studentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: newGroupId })
        });
        if (response.ok) loadStudents();
        else alert('Помилка: ' + (await response.json()).error);
    } catch (error) { alert('Помилка підключення'); }
}

const modalStudent = document.getElementById('addStudentModal');
function openAddStudentModal() { modalStudent.style.display = 'flex'; }
function closeAddStudentModal() { modalStudent.style.display = 'none'; document.getElementById('addStudentForm').reset(); }

document.getElementById('addStudentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullNameInput = document.getElementById('studentName').value.trim();
    const nameRegex = /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ' ]{4,25}$/;
    
    if (!nameRegex.test(fullNameInput)) {
        alert("Помилка: ПІБ має містити від 4 до 25 symbols і складатися лише з літер.");
        return;
    }

    const newStudent = {
        full_name: fullNameInput,
        age: document.getElementById('studentAge').value,
        parent_phone: document.getElementById('studentPhone').value,
        group_id: document.getElementById('studentGroupId').value || null
    };
    
    try {
        const response = await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newStudent)
        });
        const result = await response.json(); 
        if (response.ok) {
            closeAddStudentModal();
            loadStudents();
            alert(result.message); 
        } else {
            alert('Помилка: ' + result.error);
        }
    } catch (error) { alert('Помилка підключення'); }
});

// ==========================================
// БЛОК: ГРУПИ ТА ЖУРНАЛ
// ==========================================
async function loadGroups() {
    document.getElementById('page-title').innerText = 'Навчальні групи';
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<p>Завантаження...</p>';
    try {
        const response = await fetch('/api/groups');
        allGroups = await response.json();
        renderGroupTable(allGroups);
    } catch (error) { contentArea.innerHTML = '<p class="error-text">Помилка завантаження даних.</p>'; }
}

function renderGroupTable(groupsList) {
    const contentArea = document.getElementById('content-area');
    let html = `
        <div class="action-bar">
            <div class="action-bar-left">
                ${user.role === 'manager' ? '<button class="btn-primary" onclick="openAddGroupModal()">+ Створити групу</button>' : ''}
                <button class="btn-secondary" onclick="exportToExcel('Групи.xlsx')">Експорт</button>
            </div>
            <div class="search-wrapper">
                <input type="text" id="groupSearchInput" class="search-input" placeholder="Швидкий пошук..." oninput="filterGroups(this.value)">
            </div>
        </div>
    `;

    if (groupsList.length === 0) {
        contentArea.innerHTML = html + '<p>Груп не знайдено.</p>';
        return;
    }

    html += `
        <table class="data-table" id="exportData">
            <thead><tr><th>ID</th><th>Назва групи</th><th>ID Курсу</th><th>Викладач</th><th>Дії</th></tr></thead>
            <tbody>
    `;

    groupsList.forEach(group => {
        const teacher = group.teacher_name ? group.teacher_name : '<span class="error-text">Не призначено</span>';
        const actionBtn = user.role === 'manager' 
            ? `<button class="btn-secondary small-btn" onclick="assignTeacherToGroup(${group.id})">Змінити викладача</button>` 
            : `<span class="readonly-text">Тільки перегляд</span>`;

        html += `
            <tr>
                <td>${group.id}</td>
                <td><a href="#" class="group-link" onclick="openGroupStudents(${group.id}, '${group.group_name}')">${group.group_name}</a></td>
                <td>${group.course_id || '—'}</td>
                <td>${teacher}</td>
                <td>${actionBtn}</td>
            </tr>
        `;
    });

    contentArea.innerHTML = html + `</tbody></table>`;
}

function filterGroups(query) {
    const cleanQuery = query.toLowerCase().trim();
    const filtered = allGroups.filter(g => g.group_name.toLowerCase().includes(cleanQuery));
    renderGroupTable(filtered);
    document.getElementById('groupSearchInput').value = query;
}

async function assignTeacherToGroup(groupId) {
    const newTeacherId = prompt("Введіть ID викладача:");
    if (newTeacherId === null) return;
    try {
        const response = await fetch(`/api/groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teacher_id: newTeacherId })
        });
        if (response.ok) loadGroups();
        else alert('Помилка: ' + (await response.json()).error);
    } catch (error) { alert('Помилка підключення'); }
}

async function openGroupStudents(groupId, groupName) {
    document.getElementById('page-title').innerText = `Журнал групи: ${groupName}`;
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<p>Завантаження журналу...</p>';

    try {
        const [resStudents, resSchedule, resJournal] = await Promise.all([
            fetch('/api/students'),
            fetch(`/api/schedule/group/${groupId}`),
            fetch(`/api/journal/group/${groupId}`)
        ]);

        const groupStudents = (await resStudents.json()).filter(s => s.group_id == groupId);
        const schedule = await resSchedule.json();
        const journal = await resJournal.json();

        let html = `<button class="btn-secondary mb-20" onclick="loadGroups()">⬅ Назад</button>`;

        if (groupStudents.length === 0) {
            contentArea.innerHTML = html + '<p>У групі немає учнів.</p>';
            return;
        }

        html += `
            <table class="data-table">
                <thead><tr><th>ID</th><th>Учень</th><th>Відвідування</th><th>Баланс</th></tr></thead>
                <tbody>
        `;

        const now = new Date();
        groupStudents.forEach(student => {
            let gridHtml = '<div class="attendance-grid">';
            schedule.forEach((lesson, i) => {
                const lessonDate = new Date(lesson.lesson_date);
                const isLocked = lessonDate > now;
                const entry = journal.find(j => j.lesson_id === lesson.id && j.student_id === student.id);
                
                let boxClass = 'att-box' + (isLocked ? ' locked' : '');
                let boxStatus = 'null';
                if (!isLocked && entry) {
                    boxClass += entry.is_present === 1 ? ' present' : ' absent';
                    boxStatus = entry.is_present;
                }
                const onClickAttr = isLocked ? '' : `onclick="toggleAttendanceSquare(this, ${lesson.id}, ${student.id}, ${boxStatus})"`;
                gridHtml += `<div class="${boxClass}" title="Урок ${i + 1}" ${onClickAttr}></div>`;
            });
            gridHtml += '</div>';

            const finalLogikas = student.calculated_logikas || student.total_logikas || 0;
            html += `
                <tr>
                    <td>${student.id}</td>
                    <td><strong>${student.full_name}</strong></td>
                    <td>${gridHtml}</td>
                    <td>
                        <span class="logika-badge">${finalLogikas}</span>
                        <button class="btn-secondary small-btn" onclick="addLogikas(${student.id}, '${student.full_name}', ${groupId}, '${groupName}')">±</button>
                    </td>
                </tr>
            `;
        });
        contentArea.innerHTML = html + `</tbody></table>`;
    } catch (error) { contentArea.innerHTML = `<button class="btn-secondary mb-20" onclick="loadGroups()">⬅ Назад</button><p class="error-text">Помилка завантаження журналу.</p>`; }
}

async function toggleAttendanceSquare(element, lessonId, studentId, currentStatus) {
    let newStatus = currentStatus === null ? 1 : currentStatus === 1 ? 0 : null;
    element.className = 'att-box' + (newStatus === 1 ? ' present' : newStatus === 0 ? ' absent' : '');
    element.setAttribute('onclick', `toggleAttendanceSquare(this, ${lessonId}, ${studentId}, ${newStatus})`);

    try {
        await fetch('/api/journal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lesson_id: lessonId, student_id: studentId, is_present: newStatus, earned_logikas: 0 })
        });
    } catch (error) { alert("Помилка збереження"); }
}

// ==========================================
// БЛОК: РОЗКЛАД ТА ЗАВДАННЯ
// ==========================================
function applyScheduleFilter() {
    const dates = document.getElementById('dateRangePicker')._flatpickr.selectedDates;
    if (dates.length < 2) return alert("Оберіть період!");
    const format = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    loadSchedule(format(dates[0]), format(dates[1]));
}

async function loadSchedule(startDate = '', endDate = '') {
    document.getElementById('page-title').innerText = 'Розклад занять';
    const contentArea = document.getElementById('content-area');
    let url = '/api/schedule' + (startDate ? `?startDate=${startDate} 00:00:00&endDate=${endDate} 23:59:59` : '');

    try {
        const response = await fetch(url);
        const lessons = await response.json();
        allLessonsSchedule = lessons;

        let html = `
            <div class="filter-panel">
                <div class="input-group mb-0 flex-grow">
                    <input type="text" id="dateRangePicker" class="search-input" placeholder="Оберіть дати...">
                </div>
                <button class="btn-primary" onclick="applyScheduleFilter()">Застосувати</button>
                <button class="btn-secondary" onclick="loadSchedule()">Скинути</button>
            </div>
            <div class="action-bar-left mb-20">
                ${user.role === 'manager' ? `<button class="btn-primary" onclick="openGenerateModal()">+ Авто-генерація</button>` : ''}
                <button class="btn-secondary" onclick="exportToExcel('Розклад.xlsx')">Експорт</button>
            </div>
        `;

        if (lessons.length === 0) {
            contentArea.innerHTML = html + '<p>Немає занять.</p>';
        } else {
            html += `<table class="data-table" id="exportData">
                <thead><tr><th>ID</th><th>Дата</th><th>Група</th><th>Тема</th><th>Статус</th></tr></thead>
                <tbody>`;
            lessons.forEach(l => {
                const date = new Date(l.lesson_date).toLocaleString('uk-UA');
                const statusColor = l.status === 'Завершено' ? '#2ed573' : l.status === 'Скасовано' ? '#ff4757' : '#8c7ae6';
                const statusMarkup = user.role === 'manager' 
                    ? `<select class="status-select" style="color:${statusColor}" onchange="changeLessonStatus(${l.id}, this.value)">
                        <option value="Заплановано" ${l.status === 'Заплановано' ? 'selected' : ''}>Заплановано</option>
                        <option value="Проводиться" ${l.status === 'Проводиться' ? 'selected' : ''}>Проводиться</option>
                        <option value="Завершено" ${l.status === 'Завершено' ? 'selected' : ''}>Завершено</option>
                        <option value="Скасовано" ${l.status === 'Скасовано' ? 'selected' : ''}>Скасовано</option>
                       </select>`
                    : `<span style="color:${statusColor}; font-weight:bold;">${l.status}</span>`;

                html += `<tr>
                    <td>${l.id}</td><td>${date}</td>
                    <td><a href="#" class="group-link" onclick="openLessonDetails(${l.id}, '${l.group_name}')">${l.group_name}</a></td>
                    <td><a href="#" class="task-link" onclick="openLessonMaterials(${l.id})">${l.topic}</a></td>
                    <td>${statusMarkup}</td>
                </tr>`;
            });
            contentArea.innerHTML = html + `</tbody></table>`;
        }
        flatpickr("#dateRangePicker", { mode: "range", locale: "uk", defaultDate: [startDate, endDate].filter(Boolean) });
    } catch (error) { contentArea.innerHTML = '<p class="error-text">Помилка завантаження.</p>'; }
}

async function changeLessonStatus(lessonId, newStatus) {
    try {
        await fetch(`/api/schedule/${lessonId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        loadSchedule();
    } catch (error) { alert("Помилка з'єднання"); }
}

const genModal = document.getElementById('generateScheduleModal');
function openGenerateModal() { genModal.style.display = 'flex'; }
function closeGenerateModal() { genModal.style.display = 'none'; document.getElementById('generateScheduleForm').reset(); }

document.getElementById('generateScheduleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const response = await fetch('/api/schedule/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                group_id: document.getElementById('genGroupId').value, 
                start_date: document.getElementById('genStartDate').value 
            })
        });
        if (response.ok) {
            closeGenerateModal();
            loadSchedule();
        } else alert('Помилка: ' + (await response.json()).error);
    } catch (error) { alert('Помилка підключення'); }
});

async function openLessonDetails(lessonId, groupName) {
    document.getElementById('page-title').innerText = `Журнал: ${groupName} (Урок №${lessonId})`;
    const contentArea = document.getElementById('content-area');
    try {
        const response = await fetch(`/api/journal/${lessonId}`);
        const students = await response.json();

        let html = `<button class="btn-secondary mb-20" onclick="loadSchedule()">⬅ Назад</button>`;
        if (students.length === 0) return contentArea.innerHTML = html + '<p>Немає учнів.</p>';

        html += `<table class="data-table"><thead><tr><th>ПІБ</th><th>Присутність</th><th>Логіки</th><th>Дія</th></tr></thead><tbody>`;
        students.forEach(s => {
            html += `<tr>
                <td><strong>${s.full_name}</strong></td>
                <td><label class="checkbox-label"><input type="checkbox" id="present_${s.student_id}" ${s.is_present ? 'checked' : ''}> Був(ла)</label></td>
                <td><input type="number" id="logikas_${s.student_id}" class="number-input" value="${s.earned_logikas || 0}"></td>
                <td><button class="btn-primary small-btn" onclick="saveJournalRecord(${lessonId}, ${s.student_id})">Зберегти</button></td>
            </tr>`;
        });
        contentArea.innerHTML = html + `</tbody></table>`;
    } catch (error) { contentArea.innerHTML = '<p class="error-text">Помилка завантаження.</p>'; }
}

async function saveJournalRecord(lessonId, studentId) {
    try {
        const response = await fetch('/api/journal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lesson_id: lessonId,
                student_id: studentId,
                is_present: document.getElementById(`present_${studentId}`).checked ? 1 : 0,
                earned_logikas: parseInt(document.getElementById(`logikas_${studentId}`).value) || 0
            })
        });
        if (response.ok) alert('Збережено!');
        else alert('Помилка: ' + (await response.json()).error);
    } catch (error) { alert('Помилка підключення'); }
}

function exportToExcel(fileName) {
    const table = document.getElementById('exportData');
    if (!table) return alert("Немає даних!");
    XLSX.writeFile(XLSX.utils.table_to_book(table, { sheet: "Дані" }), fileName);
}

async function addLogikas(studentId, studentName, groupId, groupName) {
    const amountStr = prompt(`Логіки для ${studentName}:`);
    if (!amountStr || isNaN(parseInt(amountStr))) return;
    try {
        const response = await fetch(`/api/students/${studentId}/logikas`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: parseInt(amountStr) })
        });
        if (response.ok) openGroupStudents(groupId, groupName);
    } catch (error) { alert("Помилка з'єднання"); }
}

function openLessonMaterials(lessonId) {
    const lesson = allLessonsSchedule.find(l => l.id === lessonId);
    if (!lesson) return;
    document.getElementById('page-title').innerText = `Матеріали уроку: ${lesson.topic || 'Без теми'}`;
    
    let taskHtml = lesson.homework_task 
        ? (lesson.homework_task.includes('<iframe') ? `<div class="iframe-wrapper">${lesson.homework_task}</div>` : 
           lesson.homework_task.startsWith('http') ? `<a href="${lesson.homework_task}" target="_blank" class="external-task-link">Відкрити завдання</a>` : 
           `<div class="text-task">${lesson.homework_task}</div>`)
        : '<p class="empty-task">Не прикріплено</p>';

    document.getElementById('content-area').innerHTML = `
        <button class="btn-secondary mb-20" onclick="loadSchedule()">⬅ Назад</button>
        <div class="materials-card">
            <p><strong>Презентація:</strong> ${lesson.presentation_url ? `<a href="${lesson.presentation_url}" target="_blank" class="presentation-link">Відкрити</a>` : '<span>Немає</span>'}</p>
            <hr class="materials-divider">
            <p><strong>Завдання:</strong></p>
            ${taskHtml}
        </div>
    `;
}

async function loadTasks() {
    document.getElementById('page-title').innerText = 'Мої завдання';
    const contentArea = document.getElementById('content-area');
    try {
        const response = await fetch('/api/schedule');
        allLessonsSchedule = await response.json();
        const tasks = allLessonsSchedule.filter(l => l.homework_task);

        if (tasks.length === 0) return contentArea.innerHTML = '<div class="empty-state"><h3>Немає завдань</h3></div>';

        contentArea.innerHTML = `<div class="tasks-grid">${tasks.map(t => `
            <div class="task-card">
                <div>
                    <div class="task-date">${new Date(t.lesson_date).toLocaleDateString('uk-UA')}</div>
                    <h3>${t.topic}</h3>
                    <p class="task-group">${t.group_name}</p>
                </div>
                <button class="btn-primary w-100" onclick="openLessonMaterials(${t.id})">Почати</button>
            </div>`).join('')}</div>`;
    } catch (error) { contentArea.innerHTML = '<p class="error-text">Помилка завантаження</p>'; }
}

async function loadCurriculum() {
    document.getElementById('page-title').innerText = 'Навчальна програма';
    const contentArea = document.getElementById('content-area');
    try {
        const response = await fetch('/api/curriculum');
        const lessons = await response.json();
        if (lessons.length === 0) return contentArea.innerHTML = '<p>Немає уроків.</p>';

        const courses = {};
        lessons.forEach(l => { (courses[l.course_id] = courses[l.course_id] || []).push(l); });

        let html = '';
        for (const cId in courses) {
            html += `<div class="curriculum-course-block">
                <h2>Курс ID: ${cId}</h2>
                <table class="data-table"><thead><tr><th>№</th><th>Тема</th><th>Матеріали</th></tr></thead><tbody>
                ${courses[cId].map(l => `
                    <tr>
                        <td><strong>${l.lesson_number}</strong></td>
                        <td><div class="module-label">Модуль ${Math.ceil(l.lesson_number/4)}</div><strong>${l.topic}</strong></td>
                        <td class="materials-cell">
                            ${l.presentation_url ? `<a href="${l.presentation_url}" target="_blank" class="presentation-link">Презентація</a>` : '<span class="empty-task">Немає</span>'}
                            ${l.homework_task ? `<span class="task-badge">Завдання</span>` : '<span class="empty-task">Немає</span>'}
                        </td>
                    </tr>
                `).join('')}</tbody></table></div>`;
        }
        contentArea.innerHTML = html;
    } catch (error) { contentArea.innerHTML = '<p class="error-text">Помилка завантаження</p>'; }
}

// ==========================================
// БЛОК: ФОРМА СТВОРЕННЯ НОВОЇ ГРУПИ
// ==========================================
const modalGroup = document.getElementById('addGroupModal');
window.openAddGroupModal = function() { modalGroup.style.display = 'flex'; };
window.closeAddGroupModal = function() { modalGroup.style.display = 'none'; document.getElementById('addGroupForm').reset(); };

document.getElementById('addGroupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newGroup = {
        group_name: document.getElementById('groupName').value,
        course_id: document.getElementById('groupCourseId').value || null,
        teacher_id: document.getElementById('groupTeacherId').value || null
    };
    try {
        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newGroup)
        });
        if (response.ok) {
            closeAddGroupModal();
            loadGroups();
        } else {
            alert('Помилка: ' + (await response.json()).error);
        }
    } catch (error) { alert('Помилка підключення до сервера'); }
});

// ==========================================
// БЛОК: ВИКЛАДАЧІ (НОВИЙ ФУНКЦІОНАЛ)
// ==========================================
const modalTeacher = document.getElementById('addTeacherModal');
window.openAddTeacherModal = function() { modalTeacher.style.display = 'flex'; };
window.closeAddTeacherModal = function() { modalTeacher.style.display = 'none'; document.getElementById('addTeacherForm').reset(); };

document.getElementById('addTeacherForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTeacher = {
        full_name: document.getElementById('teacherName').value.trim(),
        login: document.getElementById('teacherLogin').value.trim(),
        password: document.getElementById('teacherPassword').value
    };
    try {
        const response = await fetch('/api/teachers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTeacher)
        });
        const result = await response.json();
        if (response.ok) {
            closeAddTeacherModal();
            alert(result.message);
            loadTeachersTable(); // Оновлюємо таблицю викладачів відразу на екрані
        } else {
            alert('Помилка: ' + result.error);
        }
    } catch (error) { alert('Помилка підключення до сервера'); }
});

// Динамічне завантаження штату викладачів у "content-area"
async function loadTeachersTable() {
    document.getElementById('page-title').innerText = 'Штат викладачів';
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<p>Завантаження...</p>';

    try {
        const response = await fetch('/api/teachers');
        if (!response.ok) throw new Error('Помилка завантаження');
        const teachers = await response.json();

        let html = `
            <div class="action-bar">
                <div class="action-bar-left">
                    ${user.role === 'manager' ? '<button class="btn-primary" onclick="openAddTeacherModal()">+ Додати викладача</button>' : ''}
                </div>
            </div>
        `;

        if (teachers.length === 0) {
            contentArea.innerHTML = html + '<p>Жодного викладача ще не додано.</p>';
            return;
        }

        html += `
            <table class="data-table">
                <thead>
                    <tr><th>ID</th><th>ПІБ викладача</th><th>Логін в системі</th></tr>
                </thead>
                <tbody>
        `;

        teachers.forEach(teacher => {
            html += `
                <tr>
                    <td>${teacher.id}</td>
                    <td><strong>${teacher.full_name}</strong></td>
                    <td>${teacher.login}</td>
                </tr>
            `;
        });

        contentArea.innerHTML = html + `</tbody></table>`;
    } catch (error) {
        contentArea.innerHTML = '<p class="error-text">Помилка завантаження даних викладачів.</p>';
    }
}

function renderStudentTable(studentsList) {
    const contentArea = document.getElementById('content-area');
    let html = `
        <div class="action-bar">
            <div class="action-bar-left">
                ${user.role === 'manager' ? '<button class="btn-primary" onclick="openAddStudentModal()">+ Додати учня</button>' : ''}
                <button class="btn-secondary" onclick="exportToExcel('Учні.xlsx')">Експорт</button>
            </div>
            <div class="search-wrapper">
                <input type="text" id="studentSearchInput" class="search-input" placeholder="Швидкий пошук за ПІБ..." oninput="filterStudents(this.value)">
            </div>
        </div>
    `;

    if (studentsList.length === 0) {
        contentArea.innerHTML = html + '<p>Нічого не знайдено.</p>';
        return;
    }

    // Додали нову колонку "Доступ (Логін / Пароль)" в заголовок таблиці
    html += `
        <table class="data-table" id="exportData">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>ПІБ учня</th>
                    <th>Вік</th>
                    <th>Телефон</th>
                    <th>Група</th>
                    <th>Доступ (Логін / Пароль)</th>
                    <th>Дії</th>
                </tr>
            </thead>
            <tbody>
    `;

    studentsList.forEach(student => {
        const groupDisplay = student.group_name ? `Група: ${student.group_name}` : '<span class="error-text">Без групи</span>';
        const actionBtn = user.role === 'manager' 
            ? `<button class="btn-secondary small-btn" onclick="assignGroupToStudent(${student.id})">Змінити групу</button>` 
            : `<span class="readonly-text">Тільки перегляд</span>`;

        // Безпечний вивід, якщо раптом у когось немає логіна або пароля в базі
        const login = student.login || '—';
        const password = student.password || '—';

        // Формуємо інтерактивний блок для пароля за допомогою CSS-стилів прямо в коді
        html += `
            <tr>
                <td>${student.id}</td>
                <td><strong>${student.full_name}</strong></td>
                <td>${student.age}</td>
                <td>${student.parent_phone}</td>
                <td>${groupDisplay}</td>
                <td>
                    <div style="font-size: 0.9em; line-height: 1.4;">
                        <div><span style="color: gray;">Логін:</span> <code>${login}</code></div>
                        <div class="password-hover-zone" style="cursor: pointer;">
                            <span style="color: gray;">Пароль:</span> 
                            <span class="stars" style="font-family: monospace; font-weight: bold; letter-spacing: 2px;">••••••</span>
                            <span class="real-password" style="display: none; font-family: monospace; font-weight: bold; color: #2e7d32;">${password}</span>
                        </div>
                    </div>
                </td>
                <td>${actionBtn}</td>
            </tr>
        `;
    });

    contentArea.innerHTML = html + `</tbody></table>`;
}

loadStudents();
