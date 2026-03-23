import 'dotenv/config'; 
import express from 'express';
import mongoose from 'mongoose';
import SesionPractica from '../models/SesionPractica.js'; // Ajustado si index.js está en /api
import cors from 'cors';
import { GoogleGenAI } from '@google/generative-ai';

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json()); 

// --- 🚀 NUEVA RUTA BASE (Para evitar el Cannot GET /) ---
app.get('/', (req, res) => {
    res.json({ 
        estado: "Conectado", 
        mensaje: "API de Práctica de Alemán activa 🚀",
        endpoints: ["/api/practica/hablar", "/api/practica/finalizar", "/profesor/progreso/:id"]
    });
});

// --- Conexión a MongoDB ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => {
        console.error('❌ Error MongoDB:', err.message);
    });

// --- Inicialización de Gemini ---
const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- Endpoints ---

// Endpoint 1: Hablar
app.post('/api/practica/hablar', async (req, res) => {
    const { alumnoId, sesionId, inputAlumno, tema } = req.body;
    
    // Validación de entrada
    if (!alumnoId || !inputAlumno) {
        return res.status(400).json({ error: "Faltan datos obligatorios (alumnoId o inputAlumno)." });
    }

    try {
        // 1. Recuperar o Crear Sesión
        let sesion;
        if (sesionId) {
            sesion = await SesionPractica.findById(sesionId);
        }
        
        if (!sesion) {
            sesion = new SesionPractica({ 
                alumnoId, 
                tema: tema || 'Mi rutina diaria',
                interacciones: [] 
            }); 
            await sesion.save();
        }
        
        // 2. Construcción del Prompt (Instrucciones claras para la IA)
        const prompt = `
            Eres un profesor de alemán especializado en nivel B1. 
            El tema de la conversación es: "${sesion.tema}".
            El alumno dice: "${inputAlumno}".
            
            REGLAS:
            1. Responde de forma natural en alemán para continuar la conversación.
            2. Si detectas un error gramatical, ortográfico o de vocabulario, añade al final el texto exacto "---CORRECCION---" seguido de un objeto JSON con este formato: {"fraseOriginal": "...", "tipoError": "...", "fraseCorregida": "..."}.
            3. Si no hay errores, no incluyas la sección de corrección.
        `;

        // 3. Llamada a la API de Gemini (Uso correcto del SDK)
        const result = await model.generateContent(prompt);
        const response = result.response;
        const fullText = response.text();
        
        // 4. Separar la respuesta de la corrección
        let iaRespuesta = fullText;
        let correccionData = null;
        
        if (fullText.includes('---CORRECCION---')) {
            const parts = fullText.split('---CORRECCION---');
            iaRespuesta = parts[0].trim();
            
            try {
                // Limpiamos posibles etiquetas de Markdown que Gemini suele añadir
                let jsonString = parts[1].trim().replace(/```json|```/g, "");
                correccionData = JSON.parse(jsonString);
            } catch (e) {
                console.error("Error al parsear el JSON de la IA:", e);
                // Si falla el parseo, al menos guardamos el texto plano o lo dejamos nulo
            }
        }
        
        // 5. Registrar la interacción en MongoDB
        // Asegúrate de que los nombres de los campos coincidan con tu Modelo
        sesion.interacciones.push({ 
            alumnoInput: inputAlumno, 
            iaRespuesta: iaRespuesta, 
            correccion: correccionData 
        });
        
        await sesion.save();
        
        // 6. Enviar respuesta al frontend
        res.json({
            sesionId: sesion._id,
            iaRespuesta: iaRespuesta,
            correccion: correccionData // Opcional: enviarlo para mostrarlo en el front inmediatamente
        });

    } catch (error) {
        console.error('Error en el endpoint /hablar:', error);
        res.status(500).json({ 
            error: 'Fallo interno en el servidor.', 
            detalles: error.message 
        });
    }
});
// Endpoint 2: Finalizar
app.post('/api/practica/finalizar', async (req, res) => {
    try {
        const sesion = await SesionPractica.findByIdAndUpdate(
            req.body.sesionId,
            { fechaFin: new Date(), estado: 'completada' },
            { new: true }
        );
        res.json({ message: 'Finalizada', sesion });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Endpoint 3: Profesor
app.get('/profesor/progreso/:alumnoId', async (req, res) => {
    try {
        const sesiones = await SesionPractica.find({ alumnoId: req.params.alumnoId, estado: 'completada' });
        res.json({ total: sesiones.length, sesiones });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Exportación para Vercel
export default app;
