/**
 * auth.js - Autenticação do NexaMatch
 *
 * Usa o Firebase Authentication (e-mail e senha) e guarda o perfil no Firestore.
 * É um módulo ES: carregue com <script type="module" src="auth.js">.
 */
import {
  auth,
  db,
  isConfigured,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendEmailVerification,
  deleteUser,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  doc,
  setDoc,
  serverTimestamp,
} from "./firebase.js";

const MIN_AGE = 18;
const GENDERS = ["mulher", "homem", "outro"];
const NOT_CONFIGURED =
  "O Firebase ainda não foi configurado. Preencha o arquivo firebase-config.js (veja o README).";

// ---------- utilidades ----------
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showMessage(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = "message " + (type || "error");
  el.hidden = !text;
}

// Traduz os erros do Firebase para mensagens que a pessoa entende
function friendlyError(err) {
  const code = err && err.code ? String(err.code) : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "E-mail ou senha incorretos.";
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/email-already-in-use":
      return "Este e-mail já está cadastrado.";
    case "auth/weak-password":
      return "A senha deve ter pelo menos 6 caracteres.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde um pouco e tente de novo.";
    case "auth/network-request-failed":
      return "Sem conexão com a internet. Tente de novo.";
    case "nexa/email-not-verified":
      return "Confirme seu e-mail para entrar. Enviamos um link quando você se cadastrou (veja também o spam).";
    case "auth/user-disabled":
      return "Esta conta foi desativada.";
    case "auth/operation-not-allowed":
      return "O login por e-mail e senha está desligado no Firebase. Ative em Authentication > Método de login.";
    case "auth/unauthorized-domain":
      return "Este endereço não está autorizado no Firebase. Adicione em Authentication > Configurações > Domínios autorizados.";
    case "permission-denied":
      return "O Firebase recusou a gravação. Publique as regras do arquivo firestore.rules.";
    default:
      break;
  }
  if (code) return "Não foi possível concluir agora. Tente de novo. (" + code + ")";
  return err && err.message ? err.message : "Algo deu errado. Tente de novo.";
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
function toSessionUser(user) {
  if (!user) return null;
  return {
    id: user.uid,
    uid: user.uid,
    name: user.displayName || "",
    email: user.email || "",
    emailVerified: !!user.emailVerified,
  };
}

async function register({ name, email, password, confirmPassword, gender, birthDay, birthMonth, birthYear }) {
  name = String(name || "").trim();
  email = normalizeEmail(email);

  if (name.length < 2) throw new Error("Informe seu nome.");
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");

  const birthDate = buildBirthDate(birthDay, birthMonth, birthYear);
  if (!birthDate) throw new Error("Informe uma data de nascimento válida.");
  const age = ageFromBirthDate(birthDate);
  if (age < MIN_AGE) throw new Error("O NexaMatch é só para maiores de " + MIN_AGE + " anos.");
  if (!GENDERS.includes(gender)) throw new Error("Escolha seu gênero.");

  if (!password || password.length < 6)
    throw new Error("A senha deve ter pelo menos 6 caracteres.");
  if (password !== confirmPassword) throw new Error("As senhas não coincidem.");

  if (!isConfigured) throw new Error(NOT_CONFIGURED);

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  try {
    await updateProfile(user, { displayName: name });

    // perfil público: o que as outras pessoas veem
    await setDoc(doc(db, "users", user.uid), {
      name,
      age,
      gender,
      location: "",
      bio: "",
      interests: [],
      photo: "",
      createdAt: serverTimestamp(),
    });

    // dados privados: só você lê (nem e-mail nem data de nascimento ficam públicos)
    await setDoc(doc(db, "accounts", user.uid), {
      birthDate,
      interestedIn: [...GENDERS],
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // não deixa uma conta "pela metade" no Firebase
    try { await deleteUser(user); } catch (e) { /* segue com o erro original */ }
    throw err;
  }

  // confirmação de e-mail: manda o link e só libera o app depois que a pessoa clicar nele
  let verificationSent = true;
  try {
    auth.languageCode = "pt-BR";
    await sendEmailVerification(user);
  } catch (e) {
    verificationSent = false; // a conta existe; a pessoa pode pedir o reenvio na tela de login
  }
  await signOut(auth);

  return { email, verificationSent };
}

async function login({ email, password, remember }) {
  email = normalizeEmail(email);
  if (!isValidEmail(email)) throw new Error("E-mail inválido.");
  if (!password) throw new Error("Informe a senha.");
  if (!isConfigured) throw new Error(NOT_CONFIGURED);

  // "Manter conectado" marcado: continua logado depois de fechar o navegador
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (!credential.user.emailVerified) {
    await signOut(auth);
    const err = new Error("E-mail não confirmado.");
    err.code = "nexa/email-not-verified";
    throw err;
  }
  return toSessionUser(credential.user);
}

// Reenvia o link de confirmação (entra, envia e sai de novo)
async function resendVerification({ email, password }) {
  email = normalizeEmail(email);
  if (!isValidEmail(email)) throw new Error("Informe o e-mail para reenviar o link.");
  if (!password) throw new Error("Informe a senha para reenviar o link.");
  if (!isConfigured) throw new Error(NOT_CONFIGURED);

  const credential = await signInWithEmailAndPassword(auth, email, password);
  try {
    if (credential.user.emailVerified) return { alreadyVerified: true };
    auth.languageCode = "pt-BR";
    await sendEmailVerification(credential.user);
    return { alreadyVerified: false };
  } finally {
    await signOut(auth);
  }
}

// Depois que o Firebase terminou de verificar a sessão, devolve a pessoa logada (ou null)
async function getCurrentUser() {
  if (!auth) return null;
  await auth.authStateReady();
  const u = auth.currentUser;
  if (u && !u.emailVerified) return null; // sem e-mail confirmado = não está logado para o app
  return toSessionUser(u);
}

async function logout(redirectTo) {
  try {
    if (auth) await signOut(auth);
  } finally {
    if (redirectTo) window.location.href = redirectTo;
  }
}

// Use nas páginas protegidas: const user = await Auth.requireAuth("login.html")
// Sem login, manda para a tela de entrada e nunca resolve (o resto do código não roda).
async function requireAuth(loginPage) {
  const user = await getCurrentUser();
  if (!user) {
    if (auth && auth.currentUser && !auth.currentUser.emailVerified) {
      try { await signOut(auth); } catch (e) { /* segue para o login */ }
    }
    window.location.replace(loginPage || "login.html");
    return new Promise(() => {});
  }
  return user;
}

export const Auth = {
  register,
  login,
  resendVerification,
  logout,
  getCurrentUser,
  requireAuth,
  ageFromBirthDate,
  friendlyError,
  isConfigured,
};
window.Auth = Auth;

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
async function wirePage() {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  if (!loginForm && !registerForm) return; // página protegida (index.html): nada a ligar aqui

  const msg = document.getElementById("form-message");

  if (registerForm) fillBirthSelects(registerForm);

  // Aviso vindo do cadastro
  if (loginForm && new URLSearchParams(window.location.search).get("verificar") === "1") {
    showMessage(msg, "Conta criada! Enviamos um link de confirmação para o seu e-mail. Clique nele e depois entre aqui.", "success");
  }

  // Sem configuração do Firebase: avisa logo, em vez de falhar só no envio
  if (!isConfigured) showMessage(msg, NOT_CONFIGURED, "error");

  // Já logado? Vai direto para o app.
  if (await getCurrentUser()) {
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
    const names = ["email", "password"];
    const resendBtn = document.getElementById("resend-btn");
    liveValidate(loginForm, names);
    if (resendBtn) {
      resendBtn.addEventListener("click", async function () {
        resendBtn.disabled = true;
        try {
          const r = await resendVerification({ email: loginForm.email.value, password: loginForm.password.value });
          showMessage(msg, r.alreadyVerified ? "Seu e-mail já está confirmado. Pode entrar." : "Link reenviado! Confira sua caixa de entrada e o spam.", "success");
          resendBtn.hidden = true;
        } catch (err) {
          showMessage(msg, friendlyError(err), "error");
        }
        resendBtn.disabled = false;
      });
    }
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      showMessage(msg, "");
      if (resendBtn) resendBtn.hidden = true;
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
        showMessage(msg, friendlyError(err), "error");
        if (resendBtn && err && err.code === "nexa/email-not-verified") resendBtn.hidden = false;
        btn.disabled = false;
      }
    });
  }

  if (registerForm) {
    const names = ["name", "email", "birth", "gender", "password", "confirmPassword"];
    liveValidate(registerForm, names);
    registerForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      showMessage(msg, "");
      if (!validateForm(registerForm, names)) return;
      const btn = registerForm.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const result = await register({
          name: registerForm.name.value,
          email: registerForm.email.value,
          password: registerForm.password.value,
          confirmPassword: registerForm.confirmPassword.value,
          gender: registerForm.gender.value,
          birthDay: registerForm.birthDay.value,
          birthMonth: registerForm.birthMonth.value,
          birthYear: registerForm.birthYear.value,
        });
        if (result.verificationSent) {
          showMessage(msg, "Conta criada! Enviamos um link de confirmação para " + result.email + ". Abra o e-mail (veja também o spam) e clique no link para entrar.", "success");
        } else {
          showMessage(msg, "Conta criada, mas não conseguimos enviar o e-mail agora. Na tela de login você pode pedir o reenvio.", "error");
        }
        setTimeout(() => (window.location.href = "login.html" + (result.verificationSent ? "?verificar=1" : "")), 4000);
      } catch (err) {
        showMessage(msg, friendlyError(err), "error");
        btn.disabled = false;
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wirePage);
} else {
  wirePage();
}
