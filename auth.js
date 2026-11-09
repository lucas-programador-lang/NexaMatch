/**
 * auth.js - Autenticação do NexaMatch
 *
 * Esta versão usa localStorage (sem backend). Para usar uma API real,
 * troque o conteúdo de findUser/saveUser/login/register por chamadas fetch().
 */
(function () {
  "use strict";

  const USERS_KEY = "nexamatch_users";
  const SESSION_KEY = "nexamatch_session";

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

  // ---------- API pública ----------
  async function register({ name, email, password, confirmPassword }) {
    name = String(name || "").trim();
    email = normalizeEmail(email);

    if (name.length < 2) throw new Error("Informe seu nome.");
    if (!isValidEmail(email)) throw new Error("E-mail inválido.");
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

    const session = { id: user.id, name: user.name, email: user.email };
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

  window.Auth = { register, login, logout, getCurrentUser, requireAuth };

  // ---------- ligação com os formulários ----------
  document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    // Já logado? Vai direto para o app.
    if ((loginForm || registerForm) && getCurrentUser()) {
      window.location.replace("index.html");
      return;
    }

    // Botão de mostrar/ocultar senha
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
      loginForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const btn = loginForm.querySelector("button[type=submit]");
        btn.disabled = true;
        try {
          await login({
            email: loginForm.email.value,
            password: loginForm.password.value,
            remember: loginForm.remember.checked,
          });
          showMessage(msg, "Login realizado! Redirecionando...", "success");
          setTimeout(() => (window.location.href = "index.html"), 600);
        } catch (err) {
          showMessage(msg, err.message, "error");
          btn.disabled = false;
        }
      });
    }

    if (registerForm) {
      const msg = document.getElementById("form-message");
      registerForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const btn = registerForm.querySelector("button[type=submit]");
        btn.disabled = true;
        try {
          await register({
            name: registerForm.name.value,
            email: registerForm.email.value,
            password: registerForm.password.value,
            confirmPassword: registerForm.confirmPassword.value,
          });
          showMessage(msg, "Conta criada! Redirecionando para o login...", "success");
          setTimeout(() => (window.location.href = "login.html"), 900);
        } catch (err) {
          showMessage(msg, err.message, "error");
          btn.disabled = false;
        }
      });
    }
  });
})();
