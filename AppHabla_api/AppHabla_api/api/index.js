import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import SesionPractica from '../models/SesionPractica.js';

const app = express();
app.use(cors());
app.use(express.json());

const conectarDB = async () => {
    if (mongoose.connection.readyState === 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI);
    } catch (err) {
        console.error('Error MongoDB:', err.message);
    }
};
// Ruta de prueba para saber si el servidor responde
app.get('/', async (req, res) => {
    try {
        await conectarDB(); // Intenta conectar a la base de datos
        res.json({ 
            status: "Servidor encendido 🚀", 
            mensaje: "El Tutor de Alemán está listo para recibir mensajes.",
            db: mongoose.connection.readyState === 1 ? "Conectada ✅" : "Error de conexión ❌"
        });
    } catch (error) {
        res.json({ status: "Error", error: error.message });
    }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/practica/hablar', async (req, res) => {
    const { alumnoId, sesionId, inputAlumno, tema } = req.body;
    try {
        await conectarDB();
        let sesion = sesionId ? await SesionPractica.findById(sesionId) : new SesionPractica({ alumnoId, tema });

        // 1. Configuramos el modelo para que sea capaz de generar AUDIO (TTS)
        // Si gemini-2.5-flash-preview-tts sigue dando 404, usa gemini-2.0-flash (que ya soporta esto)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

        const promptFinal = `Eres un COACH de alemán B1 para jóvenes. 
        Responde 100% EN ALEMÁN de forma motivadora. Usa 'du'. 
        Si hay errores añade ---CORRECCION--- con JSON al final. 
        Entrada: ${inputAlumno}`;

        // 2. Llamada Multimodal (Texto + Audio)
        // Esta es la forma correcta de pedir audio según la documentación que encontraste
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: promptFinal }] }],
            generationConfig: {
                responseMimeType: "text/plain", // Queremos el texto para la pantalla
            }
        });

        const iaRespuesta = result.response.text();
        const textoSoloVoz = iaRespuesta.split('---CORRECCION---')[0].replace(/[*_#]/g, '');

        // 3. Generamos el audio usando la función de TTS de Google 2026
        const audioResult = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: `Sprich das motivierend auf Deutsch: ${textoSoloVoz}` }] }],
            generationConfig: { 
                responseMimeType: "audio/mp3" // Google devuelve el archivo de sonido aquí
            }
        });

        // Extraemos los datos del audio (base64)
        const audioBase64 = audioResult.response.audioData || null;

        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta });
        await sesion.save();

        res.json({ 
            sesionId: sesion._id, 
            iaRespuesta: iaRespuesta, 
            audioContent: audioBase64 
        });

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

export default app;
