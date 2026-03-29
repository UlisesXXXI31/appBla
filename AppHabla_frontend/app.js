import { TEMAS_ALEMAN, TEMAS_GOETHEB1 } from './temas.js';

const BASE_URL = 'https://app-bla.vercel.app'; 
let conversation = null; // Para manejar la sesión de ElevenLabs
let timerInterval = null;
const TIME_LIMIT = 300; // 5 minutos en segundos

// Referencias del DOM
const statusDisplay = document.getElementById('status-display');
const micButton = document.getElementById('mic-button');
const temaSelect = document.getElementById('tema-select');
const endButton = document.getElementById('end-session-button');

// 1. Rellenar selector de temas (Se queda igual)
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

// 2. Lógica del Cronómetro (300 segundos)
function startTimer() {
    let secondsLeft = TIME_LIMIT;
    statusDisplay.innerHTML = `Verbunden. Zeit: <b id="clock">05:00</b>`;
    
    timerInterval = setInterval(async () => {
        secondsLeft--;
        const m = Math.floor(secondsLeft / 60);
        const s = secondsLeft % 60;
        const clockElem = document.getElementById('clock');
        if(clockElem) clockElem.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        if (secondsLeft <= 30) clockElem.style.color = "red";

        if (secondsLeft <= 0) {
            stopSession();
            alert("⏰ Die Zeit ist um! (El tiempo ha terminado).");
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

// 3. Función para detener todo
async function stopSession() {
    if (conversation) {
        await conversation.endSession();
        conversation = null;
    }
    stopTimer();
    micButton.innerHTML = "🎤 Empezar a hablar";
    micButton.style.backgroundColor = ""; // Reset color
}

// 4. Lógica del Botón Principal (Toggle de Conversación)
micButton.onclick = async () => {
    // Si ya hay una conversación activa, la cerramos
    if (conversation) {
        await stopSession();
        statusDisplay.textContent = "Sitzung beendet (Sesión terminada).";
        return;
    }

    // Si no, iniciamos una nueva
    if (!temaSelect.value) return alert("Wähle zuerst ein Thema!");

    try {
        statusDisplay.textContent = "Verbindung wird hergestellt... (Conectando...)";
        
        // Obtenemos el Agent ID desde tu servidor
        const response = await fetch(`${BASE_URL}/api/practica/conectar`);
        const { agentId } = await response.json();

        // Iniciamos ElevenLabs Conversational AI
        conversation = await ElevenLabsConvAI.Conversation.startSession({
            agentId: agentId,
            onConnect: () => {
                micButton.innerHTML = "🛑 Detener Coach";
                micButton.style.backgroundColor = "#d9534f";
                startTimer();
            },
            onDisconnect: () => {
                stopSession();
            },
            onError: (error) => {
                console.error(error);
                statusDisplay.textContent = "Verbindungsfehler (Error de conexión).";
            },
            onMessage: (message) => {
                // El mensaje de la IA se muestra en tiempo real
                statusDisplay.innerHTML = `Coach conectado. Zeit: <b id="clock"></b><br><br><small>Tutor está hablando...</small>`;
            }
        });

    } catch (error) {
        console.error(error);
        statusDisplay.textContent = "Error al iniciar el Coach.";
    }
};

// 5. Botón Finalizar (Para evaluación final)
endButton.onclick = async () => {
    // En este modo, ElevenLabs guarda la sesión. 
    // Puedes llamar a una función aquí para mostrar un mensaje de despedida
    // o redirigir al historial si lo has programado.
    await stopSession();
    alert("Práctica terminada. ¡Buen trabajo!");
    location.reload();
};

populateTopics();
```

### Cambios Clave:

1.  **Adiós al "Listen" Manual:** Ya no usamos `SpeechRecognition`. ElevenLabs ConvAI escucha y responde continuamente (Full Duplex). El alumno puede incluso interrumpir a la IA.
2.  **Eliminación del Plan B:** Como ElevenLabs ConvAI maneja el audio en tiempo real, ya no necesitamos la función `speak` ni el audio base64 del backend. La voz sale directamente del flujo de ElevenLabs.
3.  **Cronómetro de 300s:** El tiempo empieza justo cuando la IA dice "Hola" (`onConnect`) y se detiene si el alumno pulsa el botón o si llega a cero.
4.  **Flujo Pedagógico:**
    *   El alumno elige el tema.
    *   Se prepara (sin gastar tiempo/créditos).
    *   Pulsa el botón y tiene **5 minutos de inmersión total**.
5.  **Status Display:** He simplificado lo que se ve en pantalla porque en este modo el alumno debe concentrarse en el **oído**, no en leer lo que la IA escribe (aunque podrías añadir los textos en `onMessage`).

### Requisitos en el Backend (`index.js`):
Asegúrate de que tu servidor en Vercel tenga este pequeño "puente" para que el frontend obtenga el ID:

```javascript
app.get('/api/practica/conectar', (req, res) => {
    res.json({ agentId: process.env.ELEVENLABS_AGENT_ID });
});
