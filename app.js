(() => {
  "use strict";

  const SUBJECTS = {
    language: { title: "Грузинский язык", georgian: "ქართული ენა", letter: "ა", description: "Грамматика, лексика и понимание текста" },
    history: { title: "История Грузии", georgian: "საქართველოს ისტორია", letter: "ჰ", description: "От древнейшей истории до современности" },
    law: { title: "Основы права", georgian: "სამართლის საფუძვლები", letter: "§", description: "Конституция, государство и права человека" },
  };
  const LETTERS = ["ა", "ბ", "გ", "დ"];
  const SUBJECT_EXAM_DURATION = 1200;
  const MIXED_EXAM_DURATION = 3600;
  const STORE_KEY = "georgia-citizenship-simulator-v1";
  const defaultStore = { theme: "light", favorites: [], mistakes: [], attempts: [], currentSession: null };
  const app = document.querySelector("#app");
  const dialogRoot = document.querySelector("#dialog-root");
  const toastRegion = document.querySelector("#toast-region");
  const bank = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
  let store = loadStore();
  let deferredInstallPrompt = null;
  let timerId = null;
  let screen = { name: "home" };

  function loadStore() {
    try { return { ...defaultStore, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
    catch { return { ...defaultStore }; }
  }

  function saveStore() {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  function formatTime(seconds) {
    const safe = Math.max(0, seconds);
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function applyTheme() {
    document.documentElement.dataset.theme = store.theme;
    document.querySelector('meta[name="theme-color"]').content = store.theme === "dark" ? "#101318" : "#c8192f";
  }

  function toast(message) {
    const item = document.createElement("div");
    item.className = "modal";
    item.style.cssText = "width:auto;max-width:360px;padding:12px 16px;border-radius:13px;box-shadow:var(--shadow)";
    item.textContent = message;
    toastRegion.append(item);
    setTimeout(() => item.remove(), 3200);
  }

  function confirmDialog(title, text, confirmLabel, onConfirm, danger = false) {
    dialogRoot.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${escapeHtml(title)}</h2><p class="lead">${escapeHtml(text)}</p><div class="modal-actions"><button class="button secondary" data-dialog="cancel">Отмена</button><button class="button ${danger ? "danger" : ""}" data-dialog="confirm">${escapeHtml(confirmLabel)}</button></div></section></div>`;
    dialogRoot.querySelector('[data-dialog="cancel"]').focus();
    dialogRoot.addEventListener("click", function handler(event) {
      const action = event.target.closest("[data-dialog]")?.dataset.dialog;
      if (!action) return;
      dialogRoot.removeEventListener("click", handler);
      dialogRoot.innerHTML = "";
      if (action === "confirm") onConfirm();
    });
  }

  function overallStats() {
    const attempts = store.attempts;
    const totalAnswers = attempts.reduce((sum, item) => sum + item.total, 0);
    const correctAnswers = attempts.reduce((sum, item) => sum + item.correct, 0);
    return {
      attempts: attempts.length,
      accuracy: totalAnswers ? Math.round((correctAnswers / totalAnswers) * 100) : 0,
      mistakes: store.mistakes.length,
      favorites: store.favorites.length,
    };
  }

  function renderHome() {
    clearTimer();
    screen = { name: "home" };
    const stats = overallStats();
    app.innerHTML = `<section class="page"><div class="hero"><div><div class="hero-flag"><img src="georgia-flag.svg" alt="Флаг Грузии"><span>საქართველო</span></div><p class="eyebrow">600 официальных вопросов</p><h1>Подготовьтесь к экзамену спокойно</h1><p class="lead">Три отдельных тренажёра по материалам 2024 года. Экзаменационный режим повторяет формат: 10 вопросов, 20 минут, проходной балл 7 из 10.</p></div><div class="exam-note"><strong>7 / 10</strong><span>минимум по каждой дисциплине</span></div></div><div class="subject-grid">${Object.entries(SUBJECTS).map(([key, subject]) => `<article class="subject-card" data-letter="${subject.letter}"><div class="subject-top"><div><p class="eyebrow">${escapeHtml(subject.georgian)}</p><h2>${escapeHtml(subject.title)}</h2></div><span class="subject-count">200 вопросов</span></div><p class="subject-description">${escapeHtml(subject.description)}</p><div class="card-actions"><button class="button" data-action="setup" data-subject="${key}" data-mode="exam">Экзамен</button><button class="button secondary" data-action="setup" data-subject="${key}" data-mode="training">Тренировка</button></div></article>`).join("")}</div><article class="mixed-exam-card"><div><p class="eyebrow">საერთო გამოცდა</p><h2>Общий экзамен</h2><p>30 вопросов в случайном порядке: по 10 из грузинского языка, истории Грузии и основ права.</p></div><div class="mixed-exam-meta"><span><strong>30</strong> вопросов</span><span><strong>60</strong> минут</span><span><strong>7/10</strong> по каждой дисциплине</span></div><button class="button" data-action="setup-mixed">Начать общий экзамен</button></article><div class="stats-strip"><div class="stat"><strong>${stats.attempts}</strong><span>попыток</span></div><div class="stat"><strong>${stats.accuracy}%</strong><span>точность ответов</span></div><div class="stat"><strong>${stats.mistakes}</strong><span>вопросов с ошибками</span></div><div class="stat"><strong>${stats.favorites}</strong><span>в избранном</span></div></div><div class="home-tools"><div class="tool-links"><button class="button secondary small" data-action="library" data-kind="mistakes" ${stats.mistakes ? "" : "disabled"}>Работа над ошибками</button><button class="button secondary small" data-action="library" data-kind="favorites" ${stats.favorites ? "" : "disabled"}>Избранное</button>${store.currentSession ? '<button class="button secondary small" data-action="resume">Продолжить попытку</button>' : ""}</div><button class="text-button" data-action="reset">Сбросить статистику</button></div></section>`;
  }

  function renderMixedSetup() {
    clearTimer();
    screen = { name: "mixed-setup" };
    app.innerHTML = `<section class="page"><button class="back-button" data-action="home">← На главную</button><div class="setup-layout"><div class="panel"><p class="eyebrow">საერთო გამოცდა</p><h1 style="font-size:clamp(2rem,5vw,3.35rem)">Общий экзамен</h1><p class="lead">Полная проверка по трём дисциплинам. Вопросы выбираются заново и перемешиваются при каждом запуске.</p><div class="mixed-subject-list">${Object.values(SUBJECTS).map((subject) => `<div><strong>${escapeHtml(subject.title)}</strong><span>10 случайных вопросов</span></div>`).join("")}</div><button class="button setup-submit" data-action="start-mixed">Начать общий экзамен</button></div><aside class="panel"><h2>Правила попытки</h2><div class="rules-list">${rule("30", "Вопросов в случайном порядке без повторений")}${rule("60", "Минут на завершение общего экзамена")}${rule("7+", "Правильных ответов по каждой дисциплине")}${rule("3", "Каждая дисциплина оценивается отдельно")}</div></aside></div></section>`;
  }

  function renderSetup(subject, mode = "exam") {
    clearTimer();
    screen = { name: "setup", subject, mode };
    const meta = SUBJECTS[subject];
    const sections = [...new Set(bank.filter((item) => item.subject === subject).map((item) => item.section))];
    app.innerHTML = `<section class="page"><button class="back-button" data-action="home">← На главную</button><div class="setup-layout"><div class="panel"><p class="eyebrow">${escapeHtml(meta.georgian)}</p><h1 style="font-size:clamp(2rem,5vw,3.35rem)">${escapeHtml(meta.title)}</h1><p class="lead">${escapeHtml(meta.description)}</p><div class="mode-tabs" role="tablist"><button class="mode-tab ${mode === "exam" ? "active" : ""}" data-action="change-mode" data-mode="exam" role="tab">Экзамен</button><button class="mode-tab ${mode === "training" ? "active" : ""}" data-action="change-mode" data-mode="training" role="tab">Тренировка</button></div><form id="setup-form" class="form-grid">${mode === "training" ? `<div class="field"><span class="field-label">Количество вопросов</span><div class="choice-row">${[10,20,50,200].map((count) => `<label class="choice-chip"><input type="radio" name="count" value="${count}" ${count === 20 ? "checked" : ""}><span>${count === 200 ? "Все" : count}</span></label>`).join("")}</div></div><div class="field"><label for="section">Раздел</label><select id="section" name="section"><option value="all">Все разделы</option>${sections.map((section) => `<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`).join("")}</select></div><div><div class="switch-row"><div><strong>Случайный порядок</strong><div class="section-tag">Перемешать вопросы</div></div><label class="switch"><input type="checkbox" name="random" checked><span></span></label></div><div class="switch-row"><div><strong>Мгновенная проверка</strong><div class="section-tag">Показывать результат после ответа</div></div><label class="switch"><input type="checkbox" name="instant" checked><span></span></label></div></div>` : '<input type="hidden" name="count" value="10"><input type="hidden" name="random" value="on">'}<button class="button setup-submit" type="submit">${mode === "exam" ? "Начать экзамен" : "Начать тренировку"}</button></form></div><aside class="panel"><h2>${mode === "exam" ? "Правила попытки" : "Как проходит тренировка"}</h2><div class="rules-list">${mode === "exam" ? rule("10", "Случайных вопросов из банка дисциплины") + rule("20", "Минут на завершение теста") + rule("7+", "Правильных ответов для успешной сдачи") + rule("1", "Один вариант ответа на каждый вопрос") : rule("↻", "Выберите объём и порядок вопросов") + rule("✓", "Получайте мгновенную проверку по желанию") + rule("★", "Сохраняйте сложные вопросы в избранное") + rule("!", "Ошибки автоматически попадут на повторение")}</div></aside></div></section>`;
    document.querySelector("#setup-form").addEventListener("submit", startFromSetup);
  }

  function rule(icon, text) { return `<div class="rule"><span class="rule-icon">${icon}</span><p>${escapeHtml(text)}</p></div>`; }

  function startFromSetup(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const options = {
      subject: screen.subject,
      mode: screen.mode,
      count: Number(data.get("count") || 10),
      section: data.get("section") || "all",
      random: data.get("random") === "on",
      instant: data.get("instant") === "on",
      source: "subject",
    };
    startQuiz(options);
  }

  function prepareQuestions(options) {
    if (options.source === "mixed") {
      const selected = Object.keys(SUBJECTS).flatMap((subject) => shuffle(bank.filter((item) => item.subject === subject)).slice(0, 10));
      return shuffle(selected).map(prepareQuestion);
    }
    let pool = options.source === "ids"
      ? bank.filter((item) => options.ids.includes(item.id))
      : bank.filter((item) => item.subject === options.subject && (options.section === "all" || item.section === options.section));
    if (options.random || options.mode === "exam") pool = shuffle(pool);
    pool = pool.slice(0, Math.min(options.count, pool.length));
    return pool.map(prepareQuestion);
  }

  function prepareQuestion(item) {
    const optionOrder = shuffle([0, 1, 2, 3]);
    return { ...item, shownOptions: optionOrder.map((index) => item.options[index]), shownCorrectIndex: optionOrder.indexOf(item.correctIndex) };
  }

  function examDuration(options) {
    return options.source === "mixed" ? MIXED_EXAM_DURATION : SUBJECT_EXAM_DURATION;
  }

  function startQuiz(options, restored = null) {
    const questions = restored?.questions || prepareQuestions(options);
    if (!questions.length) { toast("В выбранной подборке пока нет вопросов"); return; }
    screen = {
      name: "quiz",
      options,
      questions,
      current: restored?.current || 0,
      answers: restored?.answers || {},
      startedAt: restored?.startedAt || Date.now(),
      remaining: restored?.remaining ?? (options.mode === "exam" ? examDuration(options) : null),
      elapsed: restored?.elapsed || 0,
      warnings: restored?.warnings || [],
    };
    persistSession();
    renderQuiz();
    startTimer();
  }

  function renderQuiz() {
    const question = screen.questions[screen.current];
    const selected = screen.answers[question.id];
    const locked = screen.options.mode === "training" && screen.options.instant && selected !== undefined;
    const answered = Object.keys(screen.answers).length;
    const timerValue = screen.options.mode === "exam" ? screen.remaining : screen.elapsed;
    const quizTitle = screen.options.source === "mixed" ? `Общий экзамен · ${SUBJECTS[question.subject].title}` : SUBJECTS[question.subject].title;
    app.innerHTML = `<section class="page quiz-page"><header class="quiz-header"><div class="left"><button class="icon-button" data-action="quit" aria-label="Выйти">×</button><div><div class="quiz-subject">${escapeHtml(quizTitle)}</div><div class="progress-label">Вопрос ${screen.current + 1} из ${screen.questions.length}</div></div></div><div class="timer ${screen.options.mode === "exam" && screen.remaining <= 60 ? "danger" : screen.options.mode === "exam" && screen.remaining <= 300 ? "warning" : ""}" id="timer">${formatTime(timerValue)}</div><div class="right"><button class="button small" data-action="finish">Завершить</button></div></header><div class="progress-track"><div class="progress-bar" style="width:${((screen.current + 1) / screen.questions.length) * 100}%"></div></div><div class="quiz-layout"><article class="question-card"><div class="question-meta"><span class="section-tag">${escapeHtml(SUBJECTS[question.subject].title)} · ${escapeHtml(question.section)} · № ${escapeHtml(question.sourceNumber)}</span><button class="favorite-button ${store.favorites.includes(question.id) ? "active" : ""}" data-action="favorite" data-id="${question.id}" aria-label="Добавить в избранное" title="Избранное">★</button></div><h2 class="question-text" lang="ka">${escapeHtml(question.question)}</h2><div class="answers">${question.shownOptions.map((option, index) => { let stateClass = selected === index ? "selected" : ""; if (locked && index === question.shownCorrectIndex) stateClass = "correct"; if (locked && selected === index && selected !== question.shownCorrectIndex) stateClass = "wrong"; return `<button class="answer ${stateClass}" data-action="answer" data-index="${index}" ${locked ? "disabled" : ""}><span class="answer-letter">${LETTERS[index]}</span><span lang="ka">${escapeHtml(option)}</span></button>`; }).join("")}</div>${locked ? `<div class="feedback ${selected === question.shownCorrectIndex ? "success" : "error"}">${selected === question.shownCorrectIndex ? "Верно" : `Неверно. Правильный ответ: ${LETTERS[question.shownCorrectIndex]}`}</div>` : ""}<footer class="question-footer"><button class="button secondary" data-action="prev" ${screen.current === 0 ? "disabled" : ""}>Назад</button><button class="button secondary" data-action="next" ${screen.current === screen.questions.length - 1 ? "disabled" : ""}>Далее</button>${screen.current === screen.questions.length - 1 ? '<button class="button" data-action="finish">Показать результат</button>' : ""}</footer></article><aside class="question-nav"><h3>Навигация</h3><div class="nav-grid">${screen.questions.map((item, index) => `<button class="nav-dot ${screen.answers[item.id] !== undefined ? "answered" : ""} ${index === screen.current ? "current" : ""}" data-action="goto" data-index="${index}">${index + 1}</button>`).join("")}</div><div class="nav-summary">Отвечено: ${answered} из ${screen.questions.length}</div></aside></div></section>`;
  }

  function startTimer() {
    clearTimer();
    timerId = window.setInterval(() => {
      if (screen.name !== "quiz") return clearTimer();
      if (screen.options.mode === "exam") {
        screen.remaining -= 1;
        if ([300, 60].includes(screen.remaining) && !screen.warnings.includes(screen.remaining)) {
          screen.warnings.push(screen.remaining);
          toast(screen.remaining === 300 ? "Осталось 5 минут" : "Осталась 1 минута");
        }
        if (screen.remaining <= 0) { clearTimer(); finishQuiz(true); return; }
      } else screen.elapsed += 1;
      const timer = document.querySelector("#timer");
      if (timer) {
        const value = screen.options.mode === "exam" ? screen.remaining : screen.elapsed;
        timer.textContent = formatTime(value);
        timer.className = `timer ${screen.options.mode === "exam" && screen.remaining <= 60 ? "danger" : screen.options.mode === "exam" && screen.remaining <= 300 ? "warning" : ""}`;
      }
      if ((screen.options.mode === "exam" ? screen.remaining : screen.elapsed) % 5 === 0) persistSession();
    }, 1000);
  }

  function clearTimer() { if (timerId) window.clearInterval(timerId); timerId = null; }

  function persistSession() {
    if (screen.name !== "quiz") return;
    store.currentSession = { options: screen.options, questions: screen.questions, current: screen.current, answers: screen.answers, startedAt: screen.startedAt, remaining: screen.remaining, elapsed: screen.elapsed, warnings: screen.warnings };
    saveStore();
  }

  function answerQuestion(index) {
    const question = screen.questions[screen.current];
    screen.answers[question.id] = index;
    persistSession();
    renderQuiz();
  }

  function finishQuiz(timeExpired = false) {
    const unanswered = screen.questions.length - Object.keys(screen.answers).length;
    if (!timeExpired && unanswered > 0) {
      confirmDialog("Есть вопросы без ответа", `Не отвечено: ${unanswered}. Всё равно завершить попытку?`, "Завершить", () => completeQuiz(false));
      return;
    }
    completeQuiz(timeExpired);
  }

  function completeQuiz(timeExpired) {
    clearTimer();
    const resultItems = screen.questions.map((question) => ({ question, selected: screen.answers[question.id], correct: screen.answers[question.id] === question.shownCorrectIndex }));
    const correct = resultItems.filter((item) => item.correct).length;
    const wrongIds = resultItems.filter((item) => !item.correct).map((item) => item.question.id);
    const correctIds = resultItems.filter((item) => item.correct).map((item) => item.question.id);
    store.mistakes = [...new Set([...store.mistakes.filter((id) => !correctIds.includes(id)), ...wrongIds])];
    const duration = screen.options.mode === "exam" ? examDuration(screen.options) - screen.remaining : screen.elapsed;
    const subjectResults = Object.fromEntries(Object.keys(SUBJECTS).map((subject) => {
      const subjectItems = resultItems.filter((item) => item.question.subject === subject);
      return [subject, { correct: subjectItems.filter((item) => item.correct).length, total: subjectItems.length }];
    }));
    const attempt = { id: Date.now(), subject: screen.options.subject || "mixed", mode: screen.options.mode, correct, total: screen.questions.length, duration, date: new Date().toISOString(), subjectResults };
    store.attempts.unshift(attempt);
    store.attempts = store.attempts.slice(0, 100);
    store.currentSession = null;
    saveStore();
    screen = { name: "results", attempt, items: resultItems, options: screen.options, timeExpired };
    renderResults();
  }

  function renderResults() {
    const { attempt, items, options, timeExpired } = screen;
    const percent = Math.round((attempt.correct / attempt.total) * 100);
    const isMixedExam = options.mode === "exam" && options.source === "mixed";
    const passed = isMixedExam
      ? Object.values(attempt.subjectResults).every((result) => result.total === 10 && result.correct >= 7)
      : options.mode === "exam" ? attempt.correct >= 7 : percent >= 70;
    const statusText = options.mode === "exam" ? (passed ? "Экзамен сдан" : "Экзамен не сдан") : (passed ? "Тренировка завершена" : "Нужно повторить");
    const breakdown = isMixedExam ? `<div class="subject-results">${Object.entries(SUBJECTS).map(([key, subject]) => { const result = attempt.subjectResults[key]; const subjectPassed = result.correct >= 7; return `<div class="subject-result ${subjectPassed ? "pass" : "fail"}"><span>${escapeHtml(subject.title)}</span><strong>${result.correct}/${result.total}</strong><small>${subjectPassed ? "Сдано" : "Не сдано"}</small></div>`; }).join("")}</div>` : "";
    app.innerHTML = `<section class="page"><button class="back-button" data-action="home">← На главную</button><div class="result-hero"><div class="score-ring" style="--score:${percent * 3.6}deg"><div class="score-ring-inner"><div><strong>${attempt.correct}/${attempt.total}</strong><small>${percent}%</small></div></div></div><div><span class="result-status ${passed ? "pass" : "fail"}">${statusText}</span><h1 style="font-size:clamp(2rem,5vw,3.5rem)">${timeExpired ? "Время завершилось" : passed ? "Отличная работа" : "Стоит повторить ошибки"}</h1><p class="lead">Время: ${formatTime(attempt.duration)} · Ошибок: ${attempt.total - attempt.correct}</p><div class="result-actions"><button class="button" data-action="retry">Пройти ещё раз</button>${attempt.total - attempt.correct ? '<button class="button secondary" data-action="retry-wrong">Повторить ошибки</button>' : ""}<button class="button secondary" data-action="home">На главную</button></div></div></div>${breakdown}<h2>Разбор ответов</h2><div class="review-list">${items.map((item, index) => `<article class="review-item ${item.correct ? "" : "wrong"}"><p class="eyebrow">Вопрос ${index + 1} · ${escapeHtml(SUBJECTS[item.question.subject].title)} · ${item.correct ? "Верно" : "Ошибка"}</p><h3 lang="ka">${escapeHtml(item.question.question)}</h3><p class="review-answer">Ваш ответ: <strong lang="ka">${item.selected === undefined ? "Нет ответа" : escapeHtml(item.question.shownOptions[item.selected])}</strong></p>${item.correct ? "" : `<p class="review-answer">Правильный ответ: <strong lang="ka">${escapeHtml(item.question.shownOptions[item.question.shownCorrectIndex])}</strong></p>`}</article>`).join("")}</div></section>`;
  }

  function renderLibrary(kind) {
    clearTimer();
    const ids = kind === "favorites" ? store.favorites : store.mistakes;
    const items = ids.map((id) => bank.find((question) => question.id === id)).filter(Boolean);
    screen = { name: "library", kind, items };
    const title = kind === "favorites" ? "Избранные вопросы" : "Работа над ошибками";
    app.innerHTML = `<section class="page"><button class="back-button" data-action="home">← На главную</button><div class="library-header"><div><p class="eyebrow">Персональная подборка</p><h1 style="font-size:clamp(2rem,5vw,3.5rem)">${title}</h1><p class="lead">${items.length} ${items.length === 1 ? "вопрос" : "вопросов"}</p></div>${items.length ? `<button class="button" data-action="start-library" data-kind="${kind}">Начать тренировку</button>` : ""}</div>${items.length ? `<div class="library-grid">${items.map((item) => `<article class="review-item"><p class="eyebrow">${escapeHtml(SUBJECTS[item.subject].title)} · № ${escapeHtml(item.sourceNumber)}</p><h3 lang="ka">${escapeHtml(item.question)}</h3></article>`).join("")}</div>` : '<div class="empty-state"><h2>Здесь пока пусто</h2><p>Отмечайте вопросы звёздочкой или завершите тренировку, чтобы собрать ошибки.</p></div>'}</section>`;
  }

  function quitQuiz() {
    confirmDialog("Выйти из попытки?", "Прогресс сохранится, и вы сможете продолжить с главной страницы.", "Выйти", renderHome);
  }

  function resetData() {
    confirmDialog("Сбросить статистику?", "Будут удалены попытки, ошибки, избранное и незавершённый тест.", "Сбросить", () => { const theme = store.theme; store = { ...defaultStore, theme }; saveStore(); renderHome(); toast("Статистика сброшена"); }, true);
  }

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "home") renderHome();
    if (action === "setup") renderSetup(target.dataset.subject, target.dataset.mode);
    if (action === "setup-mixed") renderMixedSetup();
    if (action === "start-mixed") startQuiz({ subject: "mixed", mode: "exam", count: 30, section: "all", random: true, instant: false, source: "mixed" });
    if (action === "change-mode") renderSetup(screen.subject, target.dataset.mode);
    if (action === "answer") answerQuestion(Number(target.dataset.index));
    if (action === "prev" && screen.current > 0) { screen.current -= 1; persistSession(); renderQuiz(); }
    if (action === "next" && screen.current < screen.questions.length - 1) { screen.current += 1; persistSession(); renderQuiz(); }
    if (action === "goto") { screen.current = Number(target.dataset.index); persistSession(); renderQuiz(); }
    if (action === "favorite") { const id = target.dataset.id; store.favorites = store.favorites.includes(id) ? store.favorites.filter((item) => item !== id) : [...store.favorites, id]; saveStore(); renderQuiz(); }
    if (action === "quit") quitQuiz();
    if (action === "finish") finishQuiz(false);
    if (action === "retry") startQuiz(screen.options);
    if (action === "retry-wrong") { const ids = screen.items.filter((item) => !item.correct).map((item) => item.question.id); startQuiz({ subject: "mixed", mode: "training", count: ids.length, section: "all", random: true, instant: true, source: "ids", ids }); }
    if (action === "library") renderLibrary(target.dataset.kind);
    if (action === "start-library") { const ids = screen.items.map((item) => item.id); startQuiz({ subject: "mixed", mode: "training", count: ids.length, section: "all", random: true, instant: true, source: "ids", ids }); }
    if (action === "resume" && store.currentSession) startQuiz(store.currentSession.options, store.currentSession);
    if (action === "reset") resetData();
  });

  document.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "theme") { store.theme = store.theme === "dark" ? "light" : "dark"; saveStore(); applyTheme(); }
    if (action === "install" && deferredInstallPrompt) { deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; document.querySelector('[data-action="install"]').hidden = true; }
  });

  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; document.querySelector('[data-action="install"]').hidden = false; });
  window.addEventListener("beforeunload", persistSession);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("service-worker.js");
  applyTheme();
  renderHome();
})();
