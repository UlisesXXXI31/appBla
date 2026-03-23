// app.js
import { TEMAS_ALEMAN } from './temas.js';

const BASE_URL = 'https://app-bla.vercel.app'; 
const API_URL = `${BASE_URL}/practica/hablar`;
let currentSessionId = null;
const ALUMNO_ID = 'alumno_demo_001'; // Usar un ID de alumno real

// Referencias del DOM
const statusDisplay = document.getElementById('status-display');
const micButton = document.getElementById('mic-button');
const temaSelect = document.getElementById('tema-select');

//función para rellena el tema seleccionado
function populateTopics() {
    TEMAS_ALEMAN.forEach(tema => {
        const option = document.createElement('option');
        option.value = tema.nombre; // El valor que enviamos al backend
        option.textContent = tema.nombre;
        temaSelect.appendChild(option);
    });
}
// --- Función 1: Captura de Voz (Speech-to-Text) ---
function startListening() {
    // Verificar compatibilidad del navegador
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        statusDisplay.textContent = "Error: Tu navegador no soporta Speech Recognition.";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE'; // Configurar a alemán
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    statusDisplay.textContent = "Escuchando... Di algo en alemán.";
    micButton.disabled = true;

    recognition.onresult = (event) => {
        const germanText = event.results[0][0].transcript;
        statusDisplay.textContent = `Tú dijiste: ${germanText}`;
        // Llama a la función principal para enviar el texto al backend
        sendToBackend(germanText);
    };

    recognition.onerror = (event) => {
        statusDisplay.textContent = `Error de voz: ${event.error}`;
        micButton.disabled = false;
    };

    recognition.onend = () => {
        // La interacción termina aquí, la siguiente interacción es automática si hay respuesta del IA
    };

    recognition.start();
}

// --- Función 2: Comunicación con el Backend y Gemini ---
async function sendToBackend(inputAlumno) {
    try {
        statusDisplay.textContent = "Pensando (Llamando a Gemini)...";
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alumnoId: ALUMNO_ID,
                sesionId: currentSessionId, // Será null en la primera llamada
                inputAlumno: inputAlumno,
                tema: "Mi rutina diaria" // Tema inicial, puede ser dinámico
            })
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const data = await response.json();
        
        // 1. Guardar o actualizar el ID de sesión
        currentSessionId = data.sesionId; 

        // 2. Reproducir la respuesta de la IA
        speakGerman(data.iaRespuesta); 

        micButton.disabled = false; // Habilitar el micrófono para la siguiente ronda

    } catch (error) {
        console.error("Fallo al comunicarse con el backend:", error);
        statusDisplay.textContent = `Error de conexión: ${error.message}`;
        micButton.disabled = false;
    }
}

// --- Iniciar la Aplicación ---
micButton.addEventListener('click', startListening);
populateTopics(); // <-- Llama esta función al inicio
statusDisplay.textContent = "Selecciona un tema y haz clic en el micrófono para empezar.";

// --- Función 3: Salida de Voz (Text-to-Speech) ---
function speakGerman(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    // Configurar idioma alemán (crucial para la pronunciación)
    utterance.lang = 'de-DE'; 
    
    utterance.onstart = () => {
        statusDisplay.textContent = `IA dice: ${text}`;
        micButton.disabled = true;
    };
    
    utterance.onend = () => {
        statusDisplay.textContent = `IA terminó. Presiona para continuar.`;
        micButton.disabled = false;
    };

    window.speechSynthesis.speak(utterance);
}

// --- Iniciar la Aplicación ---
micButton.addEventListener('click', startListening);

statusDisplay.textContent = "Haz clic en el micrófono para empezar a hablar en alemán.";

// Agrega una función para finalizar la sesión cuando el usuario decida terminar.
document.getElementById('end-session-button').addEventListener('click', async () => {
    if (currentSessionId) {
        await fetch('${BASE_URL}/api/practica/finalizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sesionId: currentSessionId })
        });
        statusDisplay.textContent = "Sesión de práctica finalizada. ¡Buen trabajo!";
        currentSessionId = null;
    }
    
});
