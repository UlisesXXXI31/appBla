import { TEMAS_ALEMAN, TEMAS_GOETHEB1 } from './temas.js';

const BASE_URL = 'https://app-bla.vercel.app'; 
let currentSessionId = null;
const ALUMNO_ID = 'usuario_pro_2026';

const statusDisplay = document.getElementById('status-display');
const micButton = document.getElementById('mic-button');
const temaSelect = document.getElementById('tema-select');
const endButton = document.getElementById('end-session-button');

// Rellenar selector de temas
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

// Función para hablar (Limpia y profesional)
function speak(text) {
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*_#]|[\u{1F600}-\u{1F64F}]/gu, ''); // Quita símbolos y emojis
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
}

// Lógica del Micrófono
micButton.onclick = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = 'de-DE';

    rec.onstart = () => {
        statusDisplay.textContent = "Ich höre zu... 👂";
        micButton.disabled = true;
    };

    rec.onresult = async (event) => {
        const input = event.results[0][0].transcript;
        statusDisplay.textContent = "Denken... 🧠";
        
        try {
            const r = await fetch(`${BASE_URL}/api/practica/hablar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    alumnoId: ALUMNO_ID,
                    sesionId: currentSessionId,
                    inputAlumno: input,
                    tema: temaSelect.value
                })
            });
            const data = await r.json();
            currentSessionId = data.sesionId;

            const partes = data.iaRespuesta.split('---CORRECCION---');
            const respuesta = partes[0].trim();
            
            statusDisplay.innerHTML = `<div style="color: #2c3e50; font-weight: bold;">${respuesta}</div>`;
            if (partes[1]) {
                const corr = JSON.parse(partes[1]);
                statusDisplay.innerHTML += `<div style="background: #fff3f3; color:#d9534f; padding: 8px; margin-top:10px; border-radius: 5px; font-size: 0.85em;">💡 <b>Richtig:</b> ${corr.fraseCorregida}</div>`;
            }
            
            speak(respuesta);
        } catch (err) {
            statusDisplay.textContent = "Error de conexión ❌";
        }
    };

    rec.onend = () => { micButton.disabled = false; };
    rec.start();
};

// Botón Finalizar
endButton.onclick = async () => {
    if (!currentSessionId) return alert("Inicia una sesión primero");
    endButton.innerText = "⏳ Evaluando...";
    try {
        const r = await fetch(`${BASE_URL}/api/practica/finalizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sesionId: currentSessionId })
        });
        const d = await r.json();
        const ev = d.evaluacion;
        alert(`🏆 NOTE: ${ev.puntuacion}/100\n\nFEEDBACK: ${ev.feedback}\n\nCONSEJO: ${ev.consejo}`);
        location.reload();
    } catch (e) {
        alert("Error al evaluar");
        endButton.innerText = "Finalizar";
        endButton.disabled = false;
    }
};

populateTopics();
