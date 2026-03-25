// Importamos los temas 
import { TEMAS_ALEMAN, temasGoetheB1 } from './temas.js';

const BASE_URL = 'https://app-bla.vercel.app'; 
const API_URL = `${BASE_URL}/api/practica/hablar`;
let currentSessionId = null;
const ALUMNO_ID = 'alumno_demo_001'; // Usar un ID de alumno real

// Referencias del DOM
const statusDisplay = document.getElementById('status-display');
const micButton = document.getElementById('mic-button');
const temaSelect = document.getElementById('tema-select');


//función para rellena el tema seleccionado
function populateTopics() {
     // 1. Limpiar el selector por si acaso
    temaSelect.innerHTML = '<option value="" disabled selected>Selecciona un tema...</option>';
    
     // 2. Añadir Temas Generales
    const grupoGeneral = document.createElement('optgroup');
    grupoGeneral.label = "── Temas Generales ──";
    TEMAS_ALEMAN.forEach(tema => {
        const option = document.createElement('option');
        option.value = tema.id;
        option.textContent = tema.nombre;
        grupoGeneral.appendChild(option);
    });
    temaSelect.appendChild(grupoGeneral);
    // 3. Añadir Temas del Goethe B1
    const grupoGoethe = document.createElement('optgroup');
    grupoGoethe.label = "── Examen Goethe B1 ──";
    temasGoetheB1.forEach(tema => {
        const option = document.createElement('option');
        option.value = tema.id;
        option.textContent = tema.nombre;
        grupoGoethe.appendChild(option);
    });
    temaSelect.appendChild(grupoGoethe);
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
        hablar(data.iaRespuesta); 

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
function hablar(texto) {
    // Cancelar cualquier audio anterior
    window.speechSynthesis.cancel();

    const mensaje = new SpeechSynthesisUtterance(texto);
    mensaje.lang = 'de-DE'; // Forzar idioma Alemán
    mensaje.rate = 0.9;     // Un poco más lento para que se entienda
    
    // IMPORTANTE: En móviles, esto debe ser llamado dentro de un evento de click
    window.speechSynthesis.speak(mensaje);
}

// --- Iniciar la Aplicación ---
micButton.addEventListener('click', startListening);

statusDisplay.textContent = "Haz clic en el micrófono para empezar a hablar en alemán.";

// Función para finalizar la sesión y obtener la evaluación del Goethe B1
document.getElementById('end-session-button').onclick = async () => {
    // 1. Verificación inicial
    if (!currentSessionId) {
        alert("No hay una sesión activa para finalizar.");
        return;
    }

    // 2. Feedback visual (Evita que el usuario pulse varias veces mientras la IA piensa)
    const btn = document.getElementById('end-session-button');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Evaluando tu nivel B1...";
    btn.disabled = true;

    try {
        // 3. Llamada al endpoint de finalizar
        const response = await fetch('https://app-bla.vercel.app/api/practica/finalizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sesionId: currentSessionId })
        });

        if (response.ok) {
            const data = await response.json();
            const ev = data.evaluacion; // Aquí llega la nota de Gemini

            // 4. Mostrar el "Informe de Calificación" al alumno
            alert(`
            🏆 RESULTADO GOETHE-ZERTIFIKAT B1 🏆
            ------------------------------------------
            PUNTUACIÓN: ${ev.puntuacion} / 100
            NIVEL DETECTADO: ${ev.nivelDetectado}

            FEEDBACK DEL EXAMINADOR:
            ${ev.feedback}

            CONSEJO PARA MEJORAR:
            ${ev.consejo}
            ------------------------------------------
            ✅ Tu sesión ha sido guardada con éxito.
            `);

            // 5. Reiniciar la aplicación para una nueva práctica
            location.reload(); 
        } else {
            const errorText = await response.text();
            alert("Error al finalizar: " + errorText);
            btn.innerText = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        console.error("Error de red:", error);
        alert("Error de conexión con el servidor.");
        btn.innerText = originalText;
        btn.disabled = false;
    }
};
