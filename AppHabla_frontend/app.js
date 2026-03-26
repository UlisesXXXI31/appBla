// Importamos los temas 
import { TEMAS_ALEMAN, TEMAS_GOETHEB1 } from './temas.js';

const BASE_URL = 'https://app-bla.vercel.app'; 
const API_URL = `${BASE_URL}/api/practica/hablar`;
let currentSessionId = null;
const ALUMNO_ID = 'alumno_demo_001'; 

// Referencias del DOM
const statusDisplay = document.getElementById('status-display');
const micButton = document.getElementById('mic-button');
const temaSelect = document.getElementById('tema-select');

// --- Función para rellenar el selector de temas ---
function populateTopics() {
    temaSelect.innerHTML = '<option value="" disabled selected>Wähle ein Thema...</option>';
    
    // 1. Temas Generales
    const grupoGeneral = document.createElement('optgroup');
    grupoGeneral.label = "── Allgemein (General) ──";
    TEMAS_ALEMAN.forEach(tema => {
        const option = document.createElement('option');
        option.value = tema.nombre; // Enviamos el nombre directamente
        option.textContent = tema.nombre;
        grupoGeneral.appendChild(option);
    });
    temaSelect.appendChild(grupoGeneral);

    // 2. Temas del Goethe B1
    const grupoGoethe = document.createElement('optgroup');
    grupoGoethe.label = "── Goethe-Zertifikat B1 ──";
    TEMAS_GOETHEB1.forEach(tema => {
        const option = document.createElement('option');
        option.value = tema.id; // Enviamos el ID (p1_... o p2_...)
        option.textContent = tema.nombre;
        grupoGoethe.appendChild(option);
    });
    temaSelect.appendChild(grupoGoethe);
}

// --- Función 1: Captura de Voz (Speech-to-Text) ---
function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        statusDisplay.textContent = "Error: Navegador no compatible.";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;

    statusDisplay.textContent = "Ich höre zu... (Escuchando)";
    micButton.disabled = true;

    recognition.onresult = (event) => {
        const germanText = event.results[0][0].transcript;
        statusDisplay.textContent = `Du: ${germanText}`;
        sendToBackend(germanText);
    };

    recognition.onerror = (event) => {
        statusDisplay.textContent = `Error: ${event.error}`;
        micButton.disabled = false;
    };

    recognition.start();
}

// --- Función 2: Comunicación con el Backend ---
async function sendToBackend(inputAlumno) {
    try {
        statusDisplay.textContent = "Denken... (Pensando)";
        
        // --- CAMBIO CLAVE: Capturamos el valor actual del selector ---
        const temaSeleccionado = temaSelect.value || "General";

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alumnoId: ALUMNO_ID,
                sesionId: currentSessionId,
                inputAlumno: inputAlumno,
                tema: temaSeleccionado // <-- Ahora es dinámico
            })
        });

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

        const data = await response.json();
        currentSessionId = data.sesionId; 
        
        // Mostrar respuesta y hablar
        statusDisplay.textContent = data.iaRespuesta;
        hablar(data.iaRespuesta); 

        micButton.disabled = false;

    } catch (error) {
        console.error("Fallo backend:", error);
        statusDisplay.textContent = `Verbindungsfehler (Error de conexión)`;
        micButton.disabled = false;
    }
}

// --- Función 3: Salida de Voz (Text-to-Speech) ---
function hablar(texto) {
    window.speechSynthesis.cancel();

    // 1. LIMPIEZA: Borramos emojis y símbolos extraños para que no los "lea"
    const textoLimpio = texto.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');

    // 2. Quitamos también asteriscos o etiquetas de formato que Gemini a veces pone
    const textoFinal = textoLimpio.replace(/\*|_|#/g, '');

    const mensaje = new SpeechSynthesisUtterance(textoFinal);
    mensaje.lang = 'de-DE';

    // 3. BUSCAR MEJOR VOZ: Intentamos encontrar una voz "Natural" de Google o Microsoft
    const voces = window.speechSynthesis.getVoices();
    // Buscamos voces alemanas que suelan ser de alta calidad
    const mejorVoz = voces.find(v => v.lang === 'de-DE' && (v.name.includes('Google') || v.name.includes('Natural'))) 
                   || voces.find(v => v.lang === 'de-DE');

    if (mejorVoz) mensaje.voice = mejorVoz;

    mensaje.rate = 0.95; // Velocidad ligeramente pausada para aprendizaje
    mensaje.pitch = 1.0;

    window.speechSynthesis.speak(mensaje);
}
// --- Lógica del Botón Finalizar ---
document.getElementById('end-session-button').onclick = async () => {
    if (!currentSessionId) {
        alert("Inicia una sesión primero.");
        return;
    }

    const btn = document.getElementById('end-session-button');
    btn.innerText = "⏳ Evaluando...";
    btn.disabled = true;

    try {
        const response = await fetch(`${BASE_URL}/api/practica/finalizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sesionId: currentSessionId })
        });

        if (response.ok) {
            const data = await response.json();
            const ev = data.evaluacion;

            alert(`🏆 RESULTADO B1: ${ev.puntuacion}/100\n\nNivel: ${ev.nivelDetectado}\n\nFeedback: ${ev.feedback}\n\nConsejo: ${ev.consejo}`);
            location.reload(); 
        }
    } catch (error) {
        alert("Error al evaluar.");
        btn.innerText = "Finalizar Sesión";
        btn.disabled = false;
    }
};

// --- Iniciar Aplicación ---
populateTopics();
micButton.addEventListener('click', startListening);
statusDisplay.textContent = "Wähle ein Thema und klicke auf das Mikrofon.";
