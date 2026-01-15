const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const inputEl = document.getElementById("chatInput");
const resetBtn = document.getElementById("resetBtn");

const state = {
  step: 0,
  data: {}
};

const questions = [
  { key: "tipoCliente", prompt: "Tipo de cliente: Logística / Transporte de personal / Corporativo", parse: parseText },
  { key: "antiguedadMeses", prompt: "Antigüedad del cliente (meses). Ej: 10", parse: parseNumber },
  { key: "tickets30", prompt: "Número de tickets en los últimos 30 días. Ej: 5", parse: parseNumber },
  { key: "ticketsMesAnterior", prompt: "Número de tickets del mes anterior (para comparar). Ej: 3", parse: parseNumber },
  { key: "ticketsAbiertos", prompt: "Número de tickets abiertos / no resueltos. Ej: 2", parse: parseNumber },
  { key: "tiempoResolucionHrs", prompt: "Tiempo promedio de resolución (horas). Ej: 80", parse: parseNumber },
  { key: "tipoTickets", prompt: "Tipo de tickets predominante: incidente / solicitud", parse: parseText },
  { key: "retrasosPagoCiclos", prompt: "Retrasos de pago en últimos 3 ciclos (0 a 3). Ej: 2", parse: parseNumber },
  { key: "renegociaciones", prompt: "¿Historial previo de renegociaciones? (sí / no)", parse: parseYesNo },
  { key: "variacionVolumen", prompt: "Variación en volumen del servicio (%) vs periodo anterior. Ej: -25 o 10", parse: parseNumber },
  { key: "cambiosBruscos", prompt: "¿Cambios bruscos en demanda? (sí / no)", parse: parseYesNo },
  { key: "satisfaccion", prompt: "Nivel de satisfacción reportado (1–10). Ej: 7", parse: parseNumber },
  { key: "quejaCritica", prompt: "¿Quejas críticas recientes o escalada formal? (sí / no)", parse: parseYesNo },
];

init();

function init() {
  messagesEl.innerHTML = "";
  state.step = 0;
  state.data = {};
  botSay(
`Hola 👋 Soy el analista de riesgo de clientes de Traxión.
Te haré unas preguntas para evaluar la salud de tu cuenta.

Al finalizar obtendrás:
✅ Nivel de riesgo (Semáforo)
✅ Diagnóstico de señales detectadas
✅ Acciones preventivas sugeridas

Empezamos: ${questions[0].prompt}`
  );
}

resetBtn.addEventListener("click", init);

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;

  meSay(text);
  inputEl.value = "";

  const q = questions[state.step];
  const parsed = q.parse(text);

  if (parsed === null) {
    botSay(`No pude interpretar tu respuesta 😅\nIntenta de nuevo.\n👉 ${q.prompt}`);
    return;
  }

  state.data[q.key] = parsed;
  state.step++;

  if (state.step < questions.length) {
    botSay(questions[state.step].prompt);
  } else {
    const result = analyze(state.data);
    botSay(formatResult(result), result.nivel); // Se envía el nivel para el color
    botSay("Si quieres analizar otro cliente, presiona Reiniciar.");
  }
});

function botSay(text, riskLevel = null) {
  addMessage("bot", text, riskLevel);
}

function meSay(text) {
  addMessage("me", text);
}

function addMessage(role, text, riskLevel = null) {
  const div = document.createElement("div");
  // Se añade la clase de riesgo si existe (risk-alto, risk-medio, risk-bajo)
  const riskClass = riskLevel ? ` risk-${riskLevel.toLowerCase()}` : "";
  div.className = `msg ${role}${riskClass}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/** Parsers */
function parseNumber(s) {
  const cleaned = s.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  return Number(cleaned[0]);
}
function parseYesNo(s) {
  const t = s.trim().toLowerCase();
  if (["si", "sí", "s", "yes", "y"].includes(t)) return true;
  if (["no", "n"].includes(t)) return false;
  return null;
}
function parseText(s) {
  const t = s.trim();
  return t.length ? t : null;
}

/** Lógica de Negocio: Detección de señales tempranas */
function analyze(d) {
  const critical = [];
  const warning = [];

  // Señales críticas (Rojas)
  if (d.ticketsAbiertos >= 2) critical.push({ code: "R1", text: "Tickets abiertos sin resolución" });
  if (d.retrasosPagoCiclos >= 2) critical.push({ code: "R2", text: "Inconsistencia recurrente en pagos" });
  if (d.quejaCritica === true) critical.push({ code: "R3", text: "Escalada formal de inconformidad" });
  if (d.variacionVolumen <= -30) critical.push({ code: "R4", text: "Caída crítica de volumen operativo" });
  if (d.tiempoResolucionHrs > 72) critical.push({ code: "R5", text: "SLA de resolución excedido (>72h)" });

  // Señales de advertencia (Amarillas)
  if (d.tickets30 > d.ticketsMesAnterior) warning.push({ code: "A1", text: "Tendencia incremental en tickets" });
  if (d.retrasosPagoCiclos === 1) warning.push({ code: "A2", text: "Primer retraso en ciclo de pago" });
  if (d.variacionVolumen <= -15 && d.variacionVolumen > -30) warning.push({ code: "A3", text: "Reducción moderada de actividad" });
  if (d.satisfaccion <= 7) warning.push({ code: "A4", text: "Satisfacción en zona de riesgo" });
  if (d.antiguedadMeses < 6) warning.push({ code: "A5", text: "Curva de aprendizaje inicial (Cliente nuevo)" });

  const red = critical.length;
  const yellow = warning.length;

  let nivel = "Bajo";
  if (red >= 2 || (red === 1 && yellow >= 2)) nivel = "Alto";
  else if (red === 1 || yellow >= 2) nivel = "Medio";

  const acciones = getActionsByRisk(nivel);

  const bullets = [
    ...critical.map(s => `• ${s.text}`),
    ...warning.map(s => `• ${s.text}`)
  ];

  const explicacion = bullets.length
    ? `Se detectaron comportamientos atípicos en la cuenta:\n${bullets.join("\n")}`
    : "La cuenta mantiene métricas estables de operación.";

  return { nivel, critical, warning, explicacion, acciones };
}

function getActionsByRisk(nivel) {
  if (nivel === "Bajo") return [
    "Mantener comunicación estándar",
    "Enviar reporte de eficiencia mensual",
    "Explorar oportunidades de crecimiento"
  ];
  if (nivel === "Medio") return [
    "Llamada proactiva del ejecutivo de cuenta",
    "Auditoría interna de tickets pendientes",
    "Visita presencial de cortesía"
  ];
  return [
    "Intervención inmediata de la gerencia",
    "Plan de choque para resolución de tickets",
    "Sesión de renegociación o ajuste comercial",
    "Prioridad 1 en soporte operativo"
  ];
}

function formatResult(r) {
  const señalesTxt = [...r.critical, ...r.warning].length 
    ? [...r.critical, ...r.warning].map(s => `${s.code}: ${s.text}`).join("\n") 
    : "Sin alertas";

  return (
`DIAGNÓSTICO DE SALUD:
Nivel: ${r.nivel.toUpperCase()}

Alertas:
${señalesTxt}

Análisis Operativo:
${r.explicacion}

Acciones Sugeridas:
${r.acciones.map(a => `- ${a}`).join("\n")}
`
  );
}