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
    // 1. Comprobación crítica: ¿Se ha cargado la librería?
    if (typeof ElevenLabsConvAI === 'undefined') {
        console.error("La librería de ElevenLabs no se ha cargado.");
        statusDisplay.textContent = "Error: El navegador bloqueó la conexión de voz. Por favor, desactiva el 'escudo' o 'prevención de seguimiento' y refresca.";
        return;
    }

    if (conversation) {
        await conversation.endSession();
        conversation = null;
        micButton.innerHTML = "🎤 Hablar";
        return;
    }

    try {
        statusDisplay.textContent = "Conectando...";
        
        const response = await fetch(`${BASE_URL}/api/practica/conectar`);
        const { agentId } = await response.json();

        // 2. Iniciamos usando el objeto global verificado
        conversation = await ElevenLabsConvAI.Conversation.startSession({
            agentId: agentId,
            onConnect: () => {
                micButton.innerHTML = "🛑 Detener";
                statusDisplay.textContent = "¡Conectado! Habla ahora...";
                startTimer();
            },
            onDisconnect: () => {
                stopSession();
            },
            onError: (error) => {
                console.error("Error de ElevenLabs:", error);
                statusDisplay.textContent = "Error de audio.";
            }
        });
    } catch (error) {
        console.error("Error al iniciar:", error);
        statusDisplay.textContent = "No se pudo conectar.";
    }
};

endButton.onclick = stopSession;

// Iniciar carga de temas
populateTopics();
