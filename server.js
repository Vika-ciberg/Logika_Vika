const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'logika_db',
    port: process.env.MYSQLPORT || 3306
});

app.use(express.static(__dirname));

db.connect((err) => {
    if (err) return console.error('Помилка підключення до бази:', err);
    console.log('Успішно підключено до бази даних logika_db!');
});

app.get('/api/students', (req, res) => {
    const sql = `
        SELECT s.*, g.group_name,
               (COALESCE(s.total_logikas, 0) + COALESCE((SELECT SUM(earned_logikas) FROM journal WHERE student_id = s.id), 0)) AS calculated_logikas
        FROM students s
        LEFT JOIN st_groups g ON s.group_id = g.id
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Помилка сервера при отриманні студентів" });
        res.json(results);
    });
});

app.get('/api/schedule', (req, res) => {
    const { startDate, endDate } = req.query; 
    const autoUpdateSql = "UPDATE schedule SET status = 'Завершено' WHERE lesson_date < NOW() AND status = 'Заплановано'";
    
    db.query(autoUpdateSql, (err) => {
        let sql = `
            SELECT schedule.*, st_groups.group_name 
            FROM schedule 
            LEFT JOIN st_groups ON schedule.group_id = st_groups.id
        `;
        let queryParams = [];

        if (startDate && endDate) {
            sql += " WHERE schedule.lesson_date BETWEEN ? AND ?";
            queryParams = [startDate, endDate];
        }
        sql += " ORDER BY schedule.lesson_date ASC"; 

        db.query(sql, queryParams, (err, results) => {
            if (err) return res.status(500).json({ error: "Помилка сервера" });
            res.json(results);
        });
    });
});

app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: "Введіть логін та пароль" });

    db.query("SELECT * FROM users WHERE login = ?", [login], (err, users) => {
        if (err) return res.status(500).json({ error: "Помилка сервера" });

        if (users.length > 0) {
            if (password === users[0].password_hash) {
                return res.json({
                    success: true,
                    redirect: 'dashboard.html',
                    user: { id: users[0].id, full_name: users[0].full_name, role: users[0].role }
                });
            }
            return res.status(401).json({ error: "Невірний пароль" });
        }

        db.query("SELECT * FROM students WHERE login = ?", [login], (err, students) => {
            if (err) return res.status(500).json({ error: "Помилка сервера" });

            if (students.length > 0) {
                if (password === students[0].password) {
                    return res.json({
                        success: true,
                        redirect: 'student-dashboard.html',
                        user: { id: students[0].id, full_name: students[0].full_name, role: 'student', group_id: students[0].group_id }
                    });
                }
                return res.status(401).json({ error: "Невірний пароль" });
            }
            res.status(401).json({ error: "Користувача не знайдено" });
        });
    });
});

app.post('/api/groups', (req, res) => {
    const { group_name, course_id, teacher_id } = req.body;
    if (!group_name) return res.status(400).json({ error: "Вкажіть назву групи" });

    const sql = "INSERT INTO st_groups (group_name, course_id, teacher_id) VALUES (?, ?, ?)";
    db.query(sql, [group_name, course_id || null, teacher_id || null], (err) => {
        if (err) return res.status(500).json({ error: "Помилка сервера" });
        res.json({ success: true, message: "Групу створено!" });
    });
});

app.get('/api/groups', (req, res) => {
    const sql = `
        SELECT st_groups.*, users.full_name AS teacher_name 
        FROM st_groups 
        LEFT JOIN users ON st_groups.teacher_id = users.id
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Помилка сервера" });
        res.json(results);
    });
});

app.get('/api/journal/:lesson_id', (req, res) => {
    const sql = `
        SELECT s.id AS student_id, s.full_name, j.is_present, j.earned_logikas
        FROM schedule sch
        JOIN students s ON sch.group_id = s.group_id
        LEFT JOIN journal j ON s.id = j.student_id AND j.lesson_id = sch.id
        WHERE sch.id = ?
    `;
    db.query(sql, [req.params.lesson_id], (err, results) => {
        if (err) return res.status(500).json({ error: "Помилка сервера" });
        res.json(results);
    });
});

app.post('/api/journal', (req, res) => {
    const { lesson_id, student_id, is_present, earned_logikas } = req.body;
    db.query("SELECT id FROM journal WHERE lesson_id = ? AND student_id = ?", [lesson_id, student_id], (err, results) => {
        if (err) return res.status(500).json({ error: "Помилка БД" });

        if (results.length > 0) {
            db.query("UPDATE journal SET is_present = ?, earned_logikas = ? WHERE lesson_id = ? AND student_id = ?", 
            [is_present, earned_logikas, lesson_id, student_id], (err) => {
                if (err) return res.status(500).json({ error: "Помилка оновлення" });
                res.json({ success: true, message: "Оновлено!" });
            });
        } else {
            db.query("INSERT INTO journal (lesson_id, student_id, is_present, earned_logikas) VALUES (?, ?, ?, ?)", 
            [lesson_id, student_id, is_present, earned_logikas], (err) => {
                if (err) return res.status(500).json({ error: "Помилка збереження" });
                res.json({ success: true, message: "Збережено!" });
            });
        }
    });
});

app.post('/api/schedule/generate', (req, res) => {
    const { group_id, start_date } = req.body;
    if (!group_id || !start_date) return res.status(400).json({ error: "Оберіть групу та дату" });

    db.query("SELECT course_id FROM st_groups WHERE id = ?", [group_id], (err, groupResults) => {
        if (err || groupResults.length === 0) return res.status(500).json({ error: "Помилка групи" });
        const courseId = groupResults[0].course_id;
        if (!courseId) return res.status(400).json({ error: "Курс не вказано!" });

        db.query("SELECT * FROM course_lessons WHERE course_id = ? ORDER BY lesson_number ASC", [courseId], (err, lessons) => {
            if (err) return res.status(500).json({ error: "Помилка бази" });
            if (lessons.length === 0) return res.status(400).json({ error: "Уроки відсутні!" });

            let insertValues = [];
            let currentDate = new Date(start_date);

            lessons.forEach((lesson) => {
                const localDate = new Date(currentDate.getTime() + (3 * 60 * 60 * 1000));
                const formattedDate = localDate.toISOString().slice(0, 19).replace('T', ' '); 
                insertValues.push([group_id, formattedDate, lesson.topic, 'Заплановано', lesson.presentation_url, lesson.homework_task]);
                currentDate.setDate(currentDate.getDate() + 7);
            });

            db.query("INSERT INTO schedule (group_id, lesson_date, topic, status, presentation_url, homework_task) VALUES ?", [insertValues], (err) => {
                if (err) return res.status(500).json({ error: "Помилка генерації" });
                res.json({ success: true, message: `Згенеровано ${lessons.length} уроків!` });
            });
        });
    });
});

app.get('/api/students/:id', (req, res) => {
    const sql = `
        SELECT s.*, COALESCE((SELECT SUM(earned_logikas) FROM journal WHERE student_id = s.id), 0) AS total_logikas
        FROM students s WHERE s.id = ?
    `;
    db.query(sql, [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: "Помилка профілю" });
        res.json(results[0]);
    });
});

app.get('/api/schedule/group/:group_id', (req, res) => {
    db.query("SELECT * FROM schedule WHERE group_id = ? ORDER BY lesson_date ASC", [req.params.group_id], (err, results) => {
        if (err) return res.status(500).json({ error: "Помилка розкладу" });
        res.json(results);
    });
});

app.put('/api/groups/:id', (req, res) => {
    db.query("UPDATE st_groups SET teacher_id = ? WHERE id = ?", [req.body.teacher_id || null, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: "Помилка оновлення групи" });
        res.json({ success: true, message: "Викладача закріплено!" });
    });
});

app.put('/api/schedule/:id/status', (req, res) => {
    db.query("UPDATE schedule SET status = ? WHERE id = ?", [req.body.status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: "Помилка сервера" });
        res.json({ success: true, message: "Статус оновлено!" });
    });
});

app.get('/api/journal/group/:group_id', (req, res) => {
    const sql = `
        SELECT j.lesson_id, j.student_id, j.is_present
        FROM journal j
        JOIN schedule sch ON j.lesson_id = sch.id
        WHERE sch.group_id = ?
    `;
    db.query(sql, [req.params.group_id], (err, results) => {
        if (err) return res.status(500).json({ error: "Помилка сервера" });
        res.json(results);
    });
});

app.put('/api/students/:id/logikas', (req, res) => {
    db.query("UPDATE students SET total_logikas = total_logikas + ? WHERE id = ?", [parseInt(req.body.amount) || 0, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: "Помилка бази" });
        res.json({ success: true, message: "Баланс оновлено!" });
    });
});

app.get('/api/curriculum', (req, res) => {
    if (req.query.group_id) {
        const sql = `
            SELECT cl.id, cl.course_id, cl.lesson_number, cl.topic, cl.presentation_url, cl.homework_task 
            FROM course_lessons cl 
            JOIN st_groups g ON g.course_id = cl.course_id 
            WHERE g.id = ? 
            ORDER BY cl.lesson_number ASC
        `;
        db.query(sql, [req.query.group_id], (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        });
    } else {
        db.query("SELECT * FROM course_lessons ORDER BY course_id, lesson_number", (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        });
    }
});

const cyrillicToLatinMap = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh',
    'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'yu', 'я': 'ya', '\'': ''
};

function transliterate(text) {
    if (!text) return '';
    return text.toLowerCase().split('').map(char => cyrillicToLatinMap[char] || char).join('');
}

app.post('/api/students', (req, res) => {
    const { full_name, age, parent_phone, group_id } = req.body;

    if (!full_name) {
        return res.status(400).json({ error: "Вкажіть ПІБ учня" });
    }

    const nameParts = full_name.trim().split(' ');
    const lastNameUa = nameParts[0] || 'student';
    const firstNameUa = nameParts[1] || 's';

    const lastNameEn = transliterate(lastNameUa);
    const firstNameEn = transliterate(firstNameUa);

    // Логін: перша літера імені + прізвище 
    const generatedLogin = firstNameEn.charAt(0) + lastNameEn;

    // Пароль: 4 рандомні цифри + 2 перші літери прізвища 
    const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
    const generatedPassword = randomDigits + lastNameEn.substring(0, 2);

    const sql = `
        INSERT INTO students (full_name, age, parent_phone, group_id, login, password, total_logikas) 
        VALUES (?, ?, ?, ?, ?, ?, 0)
    `;

    db.query(sql, [full_name, age, parent_phone, group_id || null, generatedLogin, generatedPassword], (err, result) => {
        if (err) return res.status(500).json({ error: "Помилка бази даних при створенні учня" });
        
        // Повертаємо повідомлення з новими даними
        res.json({ 
            success: true, 
            message: `✅ Учня успішно створено!\n\nДані для входу:\nЛогін: ${generatedLogin}\nПароль: ${generatedPassword}` 
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});
