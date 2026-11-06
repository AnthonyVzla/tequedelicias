import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://dvkusfutsnygppvtbxmg.supabase.co";
const SUPABASE_KEY = "sb_publishable_TJDfKd2G-C0bFCB_3hnKGg_U68DBDNz";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = document.querySelector("#app");
const toastNode = document.querySelector("#toast");
const state = { session: null, profile: null, screen: "inicio", authMode: "login", prizes: [], ranking: [], recent: [] };

const esc = (value = "") => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const money = value => `${Number(value || 0).toLocaleString("es-VE")} pts`;
function toast(message, error = false) {
  toastNode.textContent = message;
  toastNode.className = `toast${error ? " error" : ""}`;
  clearTimeout(toastNode.timer);
  toastNode.timer = setTimeout(() => toastNode.classList.add("hidden"), 3500);
}
function report(error) { toast(error?.message || "Ocurrió un error", true); }

async function boot() {
  renderAuth();
  const { data, error } = await supabase.auth.getSession();
  if (error) return report(error);
  if (data.session) await setSession(data.session);
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) await setSession(session);
    else { state.session = null; state.profile = null; renderAuth(); }
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
}

async function setSession(session) {
  state.session = session;
  await loadProfile();
  if (state.profile?.suspended) {
    await supabase.auth.signOut();
    return toast("Tu perfil está suspendido. Contacta a Tequeñería Delicias.", true);
  }
  await supabase.rpc("record_login");
  render();
}

async function loadProfile() {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", state.session.user.id).single();
  if (error) throw error;
  state.profile = data;
}

function authMarkup() {
  const register = state.authMode === "register";
  return `<section class="auth-page"><div class="auth-card">
    <img class="auth-logo" src="./brand-logo.jpg" alt="Tequeñería Delicias">
    <h1>${register ? "Crear cuenta" : "Bienvenido"}</h1>
    <p class="subtitle">Juega, acumula puntos y canjea premios.</p>
    <form id="auth-form" class="stack">
      ${register ? `
        <div class="grid two">
          <label>Nombre<input name="firstName" autocomplete="given-name" required maxlength="40"></label>
          <label>Apellido<input name="lastName" autocomplete="family-name" required maxlength="40"></label>
        </div>
        <label>Número de cédula<input name="idNumber" required inputmode="numeric" maxlength="20"></label>
        <label>Teléfono<input name="phone" type="tel" autocomplete="tel" required maxlength="20"></label>` : ""}
      <label>${register ? "Correo" : "Correo electrónico"}<input name="email" type="email" autocomplete="email" required></label>
      <label>Contraseña<input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" required minlength="6"></label>
      ${register ? `<label>Código de referido (opcional)<input name="referralCode" maxlength="12" placeholder="Ej: DELI8A1B"></label>
        <p class="notice">Para verificar tu cuenta y poder redimir premios debes subir una foto de perfil después del registro.</p>` : ""}
      <p id="auth-error" class="error hidden"></p>
      <button class="button yellow full" type="submit">${register ? "Registrarme" : "Ingresar"}</button>
    </form>
    <button class="text-button" id="auth-toggle">${register ? "Ya tengo cuenta" : "¿No tienes cuenta? Regístrate"}</button>
  </div></section>`;
}
function renderAuth() {
  app.innerHTML = authMarkup();
  document.querySelector("#auth-toggle").onclick = () => { state.authMode = state.authMode === "login" ? "register" : "login"; renderAuth(); };
  document.querySelector("#auth-form").onsubmit = handleAuth;
}
async function handleAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const email = data.get("email").trim();
  const password = data.get("password");
  const errorNode = document.querySelector("#auth-error");
  errorNode.classList.add("hidden");
  try {
    if (state.authMode === "register") {
      const referralCode = String(data.get("referralCode") || "").trim().toUpperCase();
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: {
          first_name: data.get("firstName").trim(),
          last_name: data.get("lastName").trim(),
          id_number: data.get("idNumber").trim(),
          phone: data.get("phone").trim(),
          referral_code: referralCode || null
        } }
      });
      if (error) throw error;
      toast("Cuenta creada. Revisa tu correo si la confirmación está activa.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) { errorNode.textContent = error.message; errorNode.classList.remove("hidden"); }
}

async function render() {
  const admin = state.profile.role === "administracion";
  app.innerHTML = `<div class="layout"><header class="topbar">
    <div class="topbar-brand"><img src="./brand-logo.jpg" alt=""><div><h1>Tequeñería Delicias</h1><span class="muted">Hola, ${esc(state.profile.first_name)}</span></div></div>
    <div style="display:flex;gap:9px;align-items:center"><span class="points-pill">${money(state.profile.points_balance)}</span><button class="button" id="logout">Salir</button></div>
  </header>${admin ? adminLayout() : userLayout()}</div>`;
  document.querySelector("#logout").onclick = () => supabase.auth.signOut();
  bindNavigation();
  if (admin) renderAdmin(state.screen.startsWith("admin") ? state.screen : "adminInicio");
  else await renderUser(state.screen);
}

function userLayout() {
  return `<nav class="menu">
    <button class="menu-card" data-screen="inicio"><span class="menu-icon">👤</span><strong>Mi perfil</strong><span>Foto y código referido</span></button>
    <button class="menu-card primary" data-screen="jugar"><span class="menu-icon">🛷</span><strong>Jugar</strong><span>Corre y gana puntos</span></button>
    <button class="menu-card" data-screen="ranking"><span class="menu-icon">🏆</span><strong>Ranking</strong><span>Los 10 mejores de 10 días</span></button>
    <button class="menu-card" data-screen="premios"><span class="menu-icon">🎁</span><strong>Canjear puntos</strong><span>Mínimo 2.000 puntos</span></button>
  </nav><section id="content"></section>`;
}
function bindNavigation() {
  document.querySelectorAll("[data-screen]").forEach(button => button.onclick = async () => {
    state.screen = button.dataset.screen;
    await render();
  });
}
async function renderUser(screen) {
  state.screen = screen;
  if (screen === "jugar") renderGame();
  else if (screen === "ranking") await renderRanking();
  else if (screen === "premios") await renderPrizes();
  else app.querySelector("#content").innerHTML = `<section class="panel"><h2>Mi cuenta</h2>
    <div class="avatar-upload"><img src="${esc(state.profile.avatar_url || "./brand-logo.jpg")}"><div><strong>Código de referido</strong><br><b>${esc(state.profile.referral_code)}</b><br><small>Comparte este código: ambos reciben 100 puntos.</small></div></div>
    <div style="margin-top:14px"><label>Foto de perfil<input id="avatarInput" type="file" accept="image/*"></label><button class="button yellow" id="avatarCamera" type="button">Tomar foto</button></div>
  </section>`;
  bindUserExtras();
}
function bindUserExtras() {
  const input = document.querySelector("#avatarInput");
  if (input) input.onchange = () => uploadAvatar(input.files[0]);
  const camera = document.querySelector("#avatarCamera");
  if (camera) camera.onclick = () => {
    if (!input) return;
    input.setAttribute("capture", "environment");
    input.click();
  };
}
async function uploadAvatar(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return toast("La foto debe pesar menos de 5 MB", true);
  const path = `${state.profile.id}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return report(uploadError);
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", state.profile.id);
  if (error) return report(error);
  await loadProfile(); toast("Foto de perfil actualizada"); await render();
}

async function renderRanking() {
  const { data, error } = await supabase.from("profiles").select("first_name,last_name,avatar_url,ranking_points").eq("suspended", false).gt("ranking_points", 0).order("ranking_points", { ascending: false }).limit(10);
  if (error) return report(error);
  app.querySelector("#content").innerHTML = `<section class="panel"><h2>🏆 Ranking de los últimos 10 días</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th></tr></thead><tbody>${data.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(`${p.first_name} ${p.last_name}`)}</td><td><b>${p.ranking_points}</b></td></tr>`).join("") || '<tr><td colspan="3">Aún no hay puntos en este periodo.</td></tr>'}</tbody></table></div></section>`;
}

async function renderPrizes() {
  const { data, error } = await supabase.from("prizes").select("*").eq("active", true).order("points_cost");
  if (error) return report(error);
  app.querySelector("#content").innerHTML = `<section class="panel"><h2>Premios disponibles</h2><div class="grid">${data.map(p => `<article class="card prize"><div class="prize-icon">${esc(p.icon || "🎁")}</div><div><h3>${esc(p.name)}</h3><span class="muted">${esc(p.description || "")}</span></div><button class="button yellow redeem" data-id="${p.id}" data-cost="${p.points_cost}">${money(p.points_cost)}</button></article>`).join("") || '<p class="muted">Próximamente habrá premios nuevos.</p>'}</div></section>`;
  document.querySelectorAll(".redeem").forEach(button => button.onclick = () => openRedeem(button.dataset.id, Number(button.dataset.cost)));
}
function openRedeem(prizeId, cost) {
  const box = document.createElement("div");
  box.className = "modal-backdrop";
  box.innerHTML = `<div class="modal"><h2>Confirmar canje</h2><p>Ingresa el código de 6 dígitos que te asignó Tequeñería Delicias.</p>
    <form id="redeem-form" class="stack"><input class="code-input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required><button class="button yellow full" type="submit">Canjear por ${money(cost)}</button><button type="button" class="text-button" id="cancel">Cancelar</button></form></div>`;
  app.appendChild(box);
  box.querySelector("#cancel").onclick = () => box.remove();
  box.querySelector("#redeem-form").onsubmit = async event => {
    event.preventEventDefault = null;
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.rpc("redeem_prize", { p_prize_id: prizeId, p_code: form.get("code") });
    if (error) report(error); else { box.remove(); toast("¡Premio canjeado!"); await loadProfile(); await render(); }
  };
}

function renderGame() {
  app.querySelector("#content").innerHTML = `<section class="panel"><h2>Corre, Delicias</h2><div class="game-shell"><canvas id="gameCanvas"></canvas><div id="gameOverlay" class="game-overlay"><div><strong>¡A jugar!</strong><p>Toca o presiona Espacio para saltar</p><button class="button yellow" id="startGame">Iniciar carrera</button></div></div></div></section>`;
  document.querySelector("#startGame").onclick = startGame;
}

function startGame() {
  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.querySelector("#gameOverlay");
  overlay.classList.add("hidden");
  let running = true, score = 0, speed = 5, frame = 0;
  const player = { x: 90, y: 300, w: 42, h: 58, vy: 0, ground: 300 };
  const obstacles = [];
  function resize() { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; player.ground = canvas.height - 78; player.y = player.ground; }
  resize();
  function jump() { if (player.y >= player.ground) player.vy = -12.5; }
  canvas.onclick = jump;
  window.onkeydown = event => { if (event.code === "Space") { event.preventDefault(); jump(); } };
  function finish() {
    running = false;
    ctx.fillStyle = "#542d16"; ctx.font = "800 32px Nunito"; ctx.fillText(`Carrera terminada: ${Math.floor(score)} pts`, 20, 55);
    overlay.classList.remove("hidden");
    overlay.innerHTML = `<div><strong>${Math.floor(score)} puntos</strong><p>${score > 0 ? "Tus puntos se guardaron." : "Inténtalo de nuevo."}</p><button class="button yellow" id="again">Jugar otra vez</button></div>`;
    document.querySelector("#again").onclick = startGame;
    supabase.rpc("submit_game_score", { p_score: Math.max(0, Math.floor(score)), p_duration_seconds: Math.min(3600, Math.floor(frame / 60)) });
    loadProfile().then(() => { render(); });
  }
  function loop() {
    if (!running) return;
    frame++; score += .12 + speed / 250; speed += .0015;
    if (frame % Math.max(55, 115 - speed * 2) === 0) obstacles.push({ x: canvas.width, y: player.ground + 18, w: 28 + Math.random() * 20, h: 38 + Math.random() * 24 });
    player.vy += .65; player.y += player.vy;
    if (player.y > player.ground) { player.y = player.ground; player.vy = 0; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#85d8ef"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f6c453"; ctx.fillRect(0, player.ground + 58, canvas.width, canvas.height);
    ctx.fillStyle = "#542d16"; ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = "#ffd500"; ctx.beginPath(); ctx.arc(player.x + 21, player.y + 10, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#542d16"; ctx.font = "800 18px Nunito"; ctx.fillText(`${Math.floor(score)} pts`, 16, 28);
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i]; o.x -= speed;
      ctx.fillStyle = "#e33d2f"; ctx.fillRect(o.x, o.y, o.w, o.h);
      if (player.x < o.x + o.w && player.x + player.w > o.x && player.y < o.y + o.h && player.y + player.h > o.y) finish();
      if (o.x + o.w < 0) obstacles.splice(i, 1);
    }
    if (running) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function adminLayout() {
  return `<nav class="admin-tabs">
    <button class="button" data-screen="adminInicio">Inicio</button>
    <button class="button" data-screen="adminUsuarios">Usuarios</button>
    <button class="button" data-screen="adminCodigos">Códigos</button>
    <button class="button" data-screen="adminPremios">Premios</button>
    <button class="button" data-screen="adminCanjes">Canjes</button>
  </nav><section id="content"></section>`;
}
async function renderAdmin(screen) {
  state.screen = screen;
  document.querySelectorAll(".admin-tabs .button").forEach(button => {
    button.classList.toggle("active", button.dataset.screen === screen);
  });
  if (screen === "adminUsuarios") await adminUsers();
  else if (screen === "adminCodigos") await adminCodes();
  else if (screen === "adminPremios") await adminPrizes();
  else if (screen === "adminCanjes") await adminRedemptions();
  else await adminHome();
}
async function adminHome() {
  const [profiles, referrals, alerts] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("referral_code").not("referral_code", "is", null),
    supabase.from("security_alerts").select("*").eq("resolved", false)
  ]);
  app.querySelector("#content").innerHTML = `<div class="grid three">
    <div class="card"><span class="muted">Usuarios registrados</span><div class="metric">${profiles.count || 0}</div></div>
    <div class="card"><span class="muted">Códigos de referido activos</span><div class="metric">${referrals.data?.length || 0}</div></div>
    <div class="card"><span class="muted">Alertas IP pendientes</span><div class="metric">${alerts.data?.length || 0}</div></div>
    </div>
    <section class="panel"><h2>Alertas de seguridad</h2>${alerts.data?.map(a => `<div class="card alert-row"><b>${esc(a.ip_address)}</b><br>${a.accounts_count} cuentas registradas desde la misma IP. ${esc(a.details || "")}<br><button class="button small" onclick="window.resolveAlert('${a.id}')">Marcar revisada</button></div>`).join("") || '<p class="muted">No hay alertas pendientes.</p>'}</section>
    <section class="panel"><button class="button red" id="resetRanking">Reiniciar ranking de 10 días</button></section>`;
  document.querySelector("#resetRanking").onclick = async () => {
    if (!confirm("¿Reiniciar los puntos del ranking de todos los jugadores?")) return;
    const { error } = await supabase.rpc("reset_ranking"); if (error) report(error); else toast("Ranking reiniciado");
  };
}
window.resolveAlert = async id => {
  const { error } = await supabase.from("security_alerts").update({ resolved: true }).eq("id", id);
  if (!error) renderAdmin("adminInicio"); else report(error);
};

async function adminUsers() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) return report(error);
  app.querySelector("#content").innerHTML = `<section class="panel"><div class="toolbar"><label>Buscar por nombre o cédula<input id="userSearch" placeholder="Nombre o cédula"></label></div>
    <div class="table-wrap"><table><thead><tr><th>Jugador</th><th>Cédula</th><th>Referidos</th><th>Saldo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="userRows"></tbody></table></div></section>`;
  const draw = () => {
    const term = document.querySelector("#userSearch").value.toLowerCase();
    document.querySelector("#userRows").innerHTML = data.filter(p => `${p.first_name} ${p.last_name} ${p.id_number}`.toLowerCase().includes(term)).map(p => `<tr>
      <td>${esc(p.first_name)} ${esc(p.last_name)}<br><small>${esc(p.email || "")}</small></td><td>${esc(p.id_number)}</td><td>${p.referrals_count || 0}</td><td>${p.points_balance}</td>
      <td>${p.suspended ? "Suspendido" : "Activo"}</td><td><button class="button small ${p.suspended ? "green" : "red"}" onclick="window.toggleUser('${p.id}',${!p.suspended})">${p.suspended ? "Reactivar" : "Suspender"}</button></td></tr>`).join("") || '<tr><td colspan="6">No hay resultados.</td></tr>';
  };
  document.querySelector("#userSearch").oninput = draw; draw();
}
window.toggleUser = async (id, suspended) => {
  const { error } = await supabase.from("profiles").update({ suspended }).eq("id", id);
  if (!error) { toast(suspended ? "Perfil suspendido" : "Perfil reactivado"); renderAdmin("adminUsuarios"); } else report(error);
};

async function adminCodes() {
  const [users, codes] = await Promise.all([
    supabase.from("profiles").select("id,first_name,last_name,id_number").eq("role", "jugador").order("first_name"),
    supabase.from("redemption_codes").select("*,profiles(first_name,last_name,id_number)").order("created_at", { ascending: false })
  ]);
  app.querySelector("#content").innerHTML = `<section class="panel"><h2>Crear código de 6 dígitos</h2><div class="stack">
    <label>Buscar por nombre o cédula<input id="codeUserSearch"></label>
    <label>Jugador<select id="codeUser"><option value="">Selecciona un jugador</option>${(users.data || []).map(p => `<option value="${p.id}">${esc(p.first_name)} ${esc(p.last_name)} - ${esc(p.id_number)}</option>`).join("")}</select></label>
    <button class="button yellow" id="createCode">Generar y asignar código</button></div></section>
    <section class="panel"><h2>Códigos asignados</h2><div class="table-wrap"><table><thead><tr><th>Código</th><th>Jugador</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${(codes.data || []).map(c => `<tr><td><b>${c.code}</b></td><td>${esc(c.profiles?.first_name || "")} ${esc(c.profiles?.last_name || "")}</td><td>${c.used ? "Usado" : c.active ? "Activo" : "Inactivo"}</td><td><button class="button small red" onclick="window.deleteCode('${c.id}')">Eliminar</button></td></tr>`).join("")}</tbody></table></div></section>`;
  const search = document.querySelector("#codeUserSearch");
  search.oninput = () => {
    const term = search.value.toLowerCase();
    document.querySelector("#codeUser").innerHTML = `<option value="">Selecciona un jugador</option>` + users.data.filter(p => `${p.first_name} ${p.last_name} ${p.id_number}`.toLowerCase().includes(term)).map(p => `<option value="${p.id}">${esc(p.first_name)} ${esc(p.last_name)} - ${esc(p.id_number)}</option>`).join("");
  };
  document.querySelector("#createCode").onclick = async () => {
    const profileId = document.querySelector("#codeUser").value;
    if (!profileId) return toast("Selecciona un jugador", true);
    const { data, error } = await supabase.rpc("create_redemption_code", { p_profile_id: profileId });
    if (error) report(error); else { toast(`Código creado: ${data}`); renderAdmin("adminCodigos"); }
  };
}
window.deleteCode = async id => {
  const { error } = await supabase.from("redemption_codes").delete().eq("id", id);
  if (!error) renderAdmin("adminCodigos"); else report(error);
};

async function adminPrizes() {
  const { data, error } = await supabase.from("prizes").select("*").order("created_at", { ascending: false });
  if (error) return report(error);
  app.querySelector("#content").innerHTML = `<section class="panel"><h2>Nuevo premio</h2><form id="prizeForm" class="grid two">
    <label>Nombre<input name="name" required></label><label>Icono<input name="icon" value="🎁" maxlength="4"></label>
    <label>Puntos requeridos<input name="points_cost" type="number" min="1" required></label><label>Stock (-1 ilimitado)<input name="stock" type="number" value="-1"></label>
    <label style="grid-column:1/-1">Descripción<input name="description"></label><button class="button yellow">Crear premio</button></form></section>
    <section class="panel"><h2>Premios</h2><div class="grid">${data.map(p => `<div class="card"><h3>${esc(p.name)}</h3><p>${money(p.points_cost)}</p><button class="button small red" onclick="window.deletePrize('${p.id}')">Eliminar</button></div>`).join("")}</div></section>`;
  document.querySelector("#prizeForm").onsubmit = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("prizes").insert({ name: form.get("name"), icon: form.get("icon"), points_cost: Number(form.get("points_cost")), stock: Number(form.get("stock")), description: form.get("description"), active: true });
    if (error) report(error); else { toast("Premio creado"); renderAdmin("adminPremios"); }
  };
}
window.deletePrize = async id => {
  const { error } = await supabase.from("prizes").delete().eq("id", id);
  if (!error) renderAdmin("adminPremios"); else report(error);
};
async function adminRedemptions() {
  const { data, error } = await supabase.from("redemptions").select("*,profiles(first_name,last_name),prizes(name)").order("created_at", { ascending: false });
  if (error) return report(error);
  app.querySelector("#content").innerHTML = `<section class="panel"><h2>Historial de canjes</h2><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Premio</th><th>Puntos</th><th>Fecha</th></tr></thead><tbody>${data.map(r => `<tr><td>${esc(r.profiles?.first_name)} ${esc(r.profiles?.last_name)}</td><td>${esc(r.prizes?.name)}</td><td>${r.points_spent}</td><td>${new Date(r.created_at).toLocaleString("es-VE")}</td></tr>`).join("")}</tbody></table></div></section>`;
}

boot().catch(report);
