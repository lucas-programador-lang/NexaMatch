/**
 * auth.js - Autenticação do NexaMatch
 *
 * Esta versão usa localStorage (sem backend). Para usar uma API real,
 * troque o conteúdo de register/login por chamadas fetch().
 */
(function () {
  "use strict";

  const USERS_KEY = "nexamatch_users";
  const SESSION_KEY = "nexamatch_session";
  const MIN_AGE = 18;
  const GENDERS = ["mulher", "homem", "outro"];

  // ---------- utilidades ----------
  function readUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + password);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function randomSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "message " + (type || "error");
    el.hidden = !text;
  }

  // ---------- data de nascimento ----------
  // Retorna "YYYY-MM-DD" se a data existir de verdade; senão, null.
  function buildBirthDate(day, month, year) {
    const d = Number(day), m = Number(month), y = Number(year);
    if (!d || !m || !y) return null;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    if (date > new Date()) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return y + "-" + pad(m) + "-" + pad(d);
  }

  function ageFromBirthDate(iso) {
    const p = String(iso || "").split("-").map(Number);
    if (p.length !== 3 || !p[0]) return 0;
    const today = new Date();
    let age = today.getFullYear() - p[0];
    const hadBirthday =
      today.getMonth() + 1 > p[1] || (today.getMonth() + 1 === p[1] && today.getDate() >= p[2]);
    if (!hadBirthday) age--;
    return age;
  }

  // ---------- API pública ----------
  async function register({ name, email, password, confirmPassword, gender, birthDay, birthMonth, birthYear }) {
    name = String(name || "").trim();
    email = normalizeEmail(email);

    if (name.length < 2) throw new Error("Informe seu nome.");
    if (!isValidEmail(email)) throw new Error("E-mail inválido.");

    const birthDate = buildBirthDate(birthDay, birthMonth, birthYear);
    if (!birthDate) throw new Error("Informe uma data de nascimento válida.");
    if (ageFromBirthDate(birthDate) < MIN_AGE)
      throw new Error("O NexaMatch é só para maiores de " + MIN_AGE + " anos.");
    if (!GENDERS.includes(gender)) throw new Error("Escolha seu gênero.");

    if (!password || password.length < 6)
      throw new Error("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirmPassword)
      throw new Error("As senhas não coincidem.");

    const users = readUsers();
    if (users.some((u) => u.email === email))
      throw new Error("Este e-mail já está cadastrado.");

    const salt = randomSalt();
    const passwordHash = await hashPassword(password, salt);
    users.push({
      id: Date.now().toString(36),
      name,
      email,
      gender,
      birthDate,
      salt,
      passwordHash,
      createdAt: new Date().toISOString(),
    });
    writeUsers(users);
    return true;
  }

  async function login({ email, password, remember }) {
    email = normalizeEmail(email);
    if (!isValidEmail(email)) throw new Error("E-mail inválido.");
    if (!password) throw new Error("Informe a senha.");

    const user = readUsers().find((u) => u.email === email);
    if (!user) throw new Error("E-mail ou senha incorretos.");

    const hash = await hashPassword(password, user.salt);
    if (hash !== user.passwordHash)
      throw new Error("E-mail ou senha incorretos.");

    const session = {
      id: user.id,
      name: user.name,
      email: user.email,
      gender: user.gender || "",
      birthDate: user.birthDate || "",
    };
    const storage = remember ? localStorage : sessionStorage;
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getCurrentUser() {
    try {
      return (
        JSON.parse(sessionStorage.getItem(SESSION_KEY)) ||
        JSON.parse(localStorage.getItem(SESSION_KEY))
      );
    } catch (e) {
      return null;
    }
  }

  function logout(redirectTo) {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    if (redirectTo) window.location.href = redirectTo;
  }

  // Use em páginas protegidas: Auth.requireAuth("login.html")
  function requireAuth(loginPage) {
    const user = getCurrentUser();
    if (!user) window.location.href = loginPage || "login.html";
    return user;
  }

  window.Auth = { register, login, logout, getCurrentUser, requireAuth, ageFromBirthDate };

  // ---------- validação dos campos ----------
  // Qual elemento recebe foco/aria para cada campo lógico
  function controlOf(form, name) {
    if (name === "birth") return form.birthDay;
    if (name === "gender") return form.querySelector("input[name=gender]");
    return form[name];
  }

  function fieldMessage(form, name) {
    switch (name) {
      case "name":
        return form.name.value.trim().length < 2 ? "Informe seu nome." : "";
      case "email": {
        const v = form.email.value;
        if (!v.trim()) return "Informe seu e-mail.";
        return isValidEmail(normalizeEmail(v)) ? "" : "Digite um e-mail válido, como voce@email.com.";
      }
      case "birth": {
        const { birthDay, birthMonth, birthYear } = form;
        if (!birthDay.value || !birthMonth.value || !birthYear.value)
          return "Informe dia, mês e ano de nascimento.";
        const iso = buildBirthDate(birthDay.value, birthMonth.value, birthYear.value);
        if (!iso) return "Essa data não existe. Confira o dia, o mês e o ano.";
        if (ageFromBirthDate(iso) < MIN_AGE)
          return "O NexaMatch é só para maiores de " + MIN_AGE + " anos.";
        return "";
      }
      case "gender":
        return form.gender.value ? "" : "Escolha uma opção.";
      case "password": {
        const v = form.password.value;
        if (!v) return "Informe a senha.";
        if (form.id === "register-form" && v.length < 6) return "Use pelo menos 6 caracteres.";
        return "";
      }
      case "confirmPassword":
        return form.confirmPassword.value !== form.password.value ? "As senhas não coincidem." : "";
      default:
        return "";
    }
  }

  function setFieldError(form, name, message) {
    const control = controlOf(form, name);
    const box = control.closest(".af-field");
    const err = document.getElementById(name + "-error");
    if (box) box.classList.toggle("is-invalid", !!message);
    control.setAttribute("aria-invalid", message ? "true" : "false");
    if (err) {
      err.textContent = message;
      err.hidden = !message;
      control.setAttribute("aria-describedby", err.id);
    }
  }

  function validateForm(form, names) {
    let first = null;
    names.forEach(function (name) {
      const msg = fieldMessage(form, name);
      setFieldError(form, name, msg);
      if (msg && !first) first = controlOf(form, name);
    });
    if (first) first.focus();
    return !first;
  }

  // Elementos que disparam a validação de cada campo lógico
  function watchedElements(form, name) {
    if (name === "birth") return [form.birthDay, form.birthMonth, form.birthYear];
    if (name === "gender") return Array.from(form.querySelectorAll("input[name=gender]"));
    return [form[name]];
  }

  // Valida ao sair do campo e acompanha a digitação depois do primeiro erro
  function liveValidate(form, names) {
    names.forEach(function (name) {
      const box = controlOf(form, name).closest(".af-field");
      watchedElements(form, name).forEach(function (el) {
        const isChoice = el.tagName === "SELECT" || el.type === "radio";
        el.addEventListener("blur", function () {
          if (!isChoice && !el.value) return;
          if (isChoice) return;
          setFieldError(form, name, fieldMessage(form, name));
        });
        el.addEventListener(isChoice ? "change" : "input", function () {
          if (name === "birth") {
            // só valida quando os três campos estiverem preenchidos
            const all = form.birthDay.value && form.birthMonth.value && form.birthYear.value;
            if (!all && !box.classList.contains("is-invalid")) return;
          }
          if (isChoice || box.classList.contains("is-invalid")) {
            setFieldError(form, name, fieldMessage(form, name));
          }
          if (name === "password" && form.confirmPassword && form.confirmPassword.value) {
            setFieldError(form, "confirmPassword", fieldMessage(form, "confirmPassword"));
          }
        });
      });
    });
  }

  // Preenche dia / mês / ano
  function fillBirthSelects(form) {
    const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    function fill(select, placeholder, items) {
      select.innerHTML = "";
      select.add(new Option(placeholder, ""));
      items.forEach((it) => select.add(new Option(it[1], it[0])));
    }
    const days = [];
    for (let d = 1; d <= 31; d++) days.push([d, d]);
    fill(form.birthDay, "Dia", days);
    fill(form.birthMonth, "Mês", months.map((m, i) => [i + 1, m]));
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear; y >= thisYear - 100; y--) years.push([y, y]);
    fill(form.birthYear, "Ano", years);
  }

  // ---------- ligação com os formulários ----------
  document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    // Já logado? Vai direto para o app.
    if ((loginForm || registerForm) && getCurrentUser()) {
      window.location.replace("index.html");
      return;
    }

    // Mostrar/ocultar senha
    document.querySelectorAll("[data-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const input = document.getElementById(btn.dataset.toggle);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.classList.toggle("is-visible", show);
        btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      });
    });

    // Força da senha (cadastro)
    const strength = document.getElementById("strength");
    if (strength && registerForm) {
      const label = strength.querySelector("span");
      const names = ["Mín. 6 caracteres", "Fraca", "Média", "Forte"];
      registerForm.password.addEventListener("input", function () {
        const v = this.value;
        let level = 0;
        if (v.length >= 6) level = 1;
        if (v.length >= 8 && /[a-z]/i.test(v) && /\d/.test(v)) level = 2;
        if (v.length >= 10 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v)) level = 3;
        strength.dataset.level = level;
        label.textContent = names[level];
      });
    }

    if (loginForm) {
      const msg = document.getElementById("form-message");
      const names = ["email", "password"];
      liveValidate(loginForm, names);
      loginForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        showMessage(msg, "");
        if (!validateForm(loginForm, names)) return;
        const btn = loginForm.querySelector("button[type=submit]");
        btn.disabled = true;
        try {
          await login({
            email: loginForm.email.value,
            password: loginForm.password.value,
            remember: loginForm.remember.checked,
          });
          showMessage(msg, "Tudo certo! Abrindo o NexaMatch...", "success");
          setTimeout(() => (window.location.href = "index.html"), 600);
        } catch (err) {
          showMessage(msg, err.message, "error");
          btn.disabled = false;
        }
      });
    }

    if (registerForm) {
      const msg = document.getElementById("form-message");
      const names = ["name", "email", "birth", "gender", "password", "confirmPassword"];
      fillBirthSelects(registerForm);
      liveValidate(registerForm, names);
      registerForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        showMessage(msg, "");
        if (!validateForm(registerForm, names)) return;
        const btn = registerForm.querySelector("button[type=submit]");
        btn.disabled = true;
        try {
          await register({
            name: registerForm.name.value,
            email: registerForm.email.value,
            password: registerForm.password.value,
            confirmPassword: registerForm.confirmPassword.value,
            gender: registerForm.gender.value,
            birthDay: registerForm.birthDay.value,
            birthMonth: registerForm.birthMonth.value,
            birthYear: registerForm.birthYear.value,
          });
          showMessage(msg, "Conta criada! Levando você para o login...", "success");
          setTimeout(() => (window.location.href = "login.html"), 900);
        } catch (err) {
          showMessage(msg, err.message, "error");
          btn.disabled = false;
        }
      });
    }
  });
})();
