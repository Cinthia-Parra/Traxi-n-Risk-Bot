const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const inputEl = document.getElementById("chatInput");
const resetBtn = document.getElementById("resetBtn");

const state = {
  step: 0,
  data: {}
};

// Preguntas (incluye 1 extra: tickets mes anterior para poder evaluar A1)
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
Te haré unas preguntas y al final te daré:

✅ Nivel de riesgo
✅ Señales detectadas (rojas/amarillas)
✅ Explicación clara
✅ Acciones recomendadas

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
    botSay(formatResult(result));
    botSay("Si quieres analizar otro cliente, presiona Reiniciar.");
  }
});

function botSay(text) {
  addMessage("bot", text);
}

function meSay(text) {
  addMessage("me", text);
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
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

/** Core logic: reglas rojas/amarillas + clasificación */
function analyze(d) {
  const critical = [];
  const warning = [];

  // Señales críticas (rojas)
  if (d.ticketsAbiertos >= 2) critical.push({ code: "R1", text: "2 o más tickets abiertos sin resolver" });
  if (d.retrasosPagoCiclos >= 2) critical.push({ code: "R2", text: "2 o más retrasos de pago recientes" });
  if (d.quejaCritica === true) critical.push({ code: "R3", text: "Queja crítica o escalada formal" });
  if (d.variacionVolumen <= -30) critical.push({ code: "R4", text: "Caída ≥30% en uso del servicio" });
  if (d.tiempoResolucionHrs > 72) critical.push({ code: "R5", text: "Tiempo promedio de resolución >72 hrs" });

  // Señales de advertencia (amarillas)
  if (Number.isFinite(d.tickets30) && Number.isFinite(d.ticketsMesAnterior) && d.tickets30 > d.ticketsMesAnterior) {
    warning.push({ code: "A1", text: "Incremento de tickets vs mes anterior" });
  }
  if (d.retrasosPagoCiclos === 1) warning.push({ code: "A2", text: "1 retraso de pago reciente" });
  if (d.variacionVolumen <= -15 && d.variacionVolumen >= -29) warning.push({ code: "A3", text: "Caída de uso entre 15% y 29%" });
  if (d.satisfaccion >= 6 && d.satisfaccion <= 7) warning.push({ code: "A4", text: "Satisfacción entre 6 y 7" });
  if (d.antiguedadMeses < 6) warning.push({ code: "A5", text: "Antigüedad menor a 6 meses" });

  // Clasificación
  const red = critical.length;
  const yellow = warning.length;

  let nivel = "Bajo";
  if (red === 0 && yellow <= 1) nivel = "Bajo";
  else if (red >= 2 || (red === 1 && yellow >= 2)) nivel = "Alto";
  else if (red === 1 || yellow >= 2) nivel = "Medio";

  const acciones = getActionsByRisk(nivel);

  // Explicación “de negocio”, sin tecnicismos
  const bullets = [
    ...critical.map(s => `• ${s.text}`),
    ...warning.map(s => `• ${s.text}`)
  ];
  const explicacion = bullets.length
    ? `El cliente presenta señales que suelen correlacionarse con fricción operativa y/o riesgo de abandono:\n${bullets.join("\n")}`
    : "No se detectaron señales relevantes con la información proporcionada.";

  return { nivel, critical, warning, explicacion, acciones };
}

function getActionsByRisk(nivel) {
  if (nivel === "Bajo") return [
    "Seguimiento regular",
    "Reporte mensual de desempeño",
    "Oferta de optimización de ruta o servicio"
  ];
  if (nivel === "Medio") return [
    "Contacto proactivo del ejecutivo",
    "Revisión de SLA y tiempos de atención",
    "Ajuste preventivo del servicio"
  ];
  return [
    "Contacto inmediato personalizado",
    "Priorizar resolución de tickets",
    "Propuesta de plan correctivo",
    "Incentivo comercial o renegociación"
  ];
}

function formatResult(r) {
  const señales = [
    ...r.critical.map(s => `${s.code} — ${s.text}`),
    ...r.warning.map(s => `${s.code} — ${s.text}`)
  ];

  const señalesTxt = señales.length ? señales.join("\n") : "Ninguna";

  return (
`Nivel de riesgo:
[ ${r.nivel} ]

Señales detectadas:
${señalesTxt}

Explicación:
${r.explicacion}

Acciones recomendadas:
${r.acciones.map(a => `- ${a}`).join("\n")}
`
  );
}
