import { Conversation } from 'https://cdn.jsdelivr.net/npm/@elevenlabs/convai-sdk@0.1.0/+esm';
import { TEMAS_ALEMAN, TEMAS_GOETHEB1 } from './temas.js';

const BASE_URL = 'https://app-bla.vercel.app'; 
let conversation = null;
let timerInterval = null;
const TIME_LIMIT = 300; // 5 minutos

const statusDisplay = document.getElementById('status-display');
const micButton = document.getElementById('mic-button');
const temaSelect = document.getElementById('tema-select');
const endButton = document.getElementById('end-session-button');
const timerDisplay = document.getElementById('timer-display');

// 1. Rellenar selector de temas
function populateTopics() {
    temaSelect.innerHTML = '<option value="" disabled selected>Wähle ein Thema...</option>';
    const g1 = document.createElement('optgroup');
    g1.label = "── Temas Generales ──";
    TEMAS_ALEMAN.forEach(t => {
        let o = document.createElement('option');
        o.value = t.nombre; o.textContent = t.nombre; g1.appendChild(o);
    });
    temaSelect.appendChild(g1);
    const g2 = document.createElement('optgroup');
    g2.label = "── Examen Goethe B1 ──";
    TEMAS_GOETHEB1.forEach(t => {
        let o = document.createElement('option');
        o.value = t.id; o.textContent = t.nombre; g2.appendChild(o);
    });
    temaSelect.appendChild(g2);
}

// 2. Gestión del tiempo
function startTimer() {
    let secondsLeft = TIME_LIMIT;
    timerInterval = setInterval(async () => {
        secondsLeft--;
        const m = Math.floor(secondsLeft / 60);
        const s = secondsLeft % 60;
        if(timerDisplay) timerDisplay.innerText = `${m}:${s.toString().padStart(2, '0')}`;
        if (secondsLeft <= 0) stopSession();
    }, 1000);
}

async function stopSession() {
    if (conversation) {
        await conversation.endSession();
        conversation = null;
    }
    clearInterval(timerInterval);
    micButton.innerHTML = "🎤 Hablar";
    if(timerDisplay) timerDisplay.innerText = "5:00";
}

// 3. Lógica del botón de Hablar (Conversación Real)
micButton.onclick = async () => {
    if (conversation) {
        await stopSession();
        statusDisplay.textContent = "Sesión terminada.";
        return;
    }

    if (!temaSelect.value) return alert("¡Elige un tema primero!");

    try {
        statusDisplay.textContent = "Conectando con el Coach...";
        
        const response = await fetch(`${BASE_URL}/api/practica/conectar`);
        const { agentId } = await response.json();

        // ElevenLabs maneja el micrófono automáticamente
        conversation = await Conversation.startSession({
            agentId: agentId,
            onConnect: () => {
                micButton.innerHTML = "🛑 Detener";
                statusDisplay.textContent = "¡Conectado! Habla ahora en alemán...";
                startTimer();
            },
            onDisconnect: () => {
                stopSession();
            },
            onError: (err) => {
                console.error(err);
                statusDisplay.textContent = "Error de conexión.";
            }
        });
 } catch (error) {
        // Esto nos dirá en la consola si es culpa del micro, del ID o de la librería
        console.error("Error detallado:", error); 
        statusDisplay.textContent = "Error al iniciar: " + error.message;
    }
};

endButton.onclick = stopSession;

// Iniciar carga de temas
populateTopics();
