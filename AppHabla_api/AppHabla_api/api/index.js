import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/practica/conectar', async (req, res) => {
  // Usamos los nombres de variables que tienes en Vercel
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    return res.status(500).json({ error: "Faltan variables de entorno en Vercel" });
  }

  // LA NUEVA URL QUE HAS ENCONTRADO
  const url = `https://api.elevenlabs.io/v1/convai/agents/${agentId}/generate-conversation-token`;

  try {
    const response = await fetch(url, {
      method: 'POST', // CAMBIO IMPORTANTE: Ahora es POST
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}) // Cuerpo vacío según tu documentación
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Error de ElevenLabs:", errorText);
      return res.status(response.status).json({ 
        error: "ElevenLabs rechazó la autenticación", 
        detalles: errorText 
      });
    }

    const data = await response.json();
    
    // El campo devuelto se llama 'conversation_token' según tu texto
    // Lo enviamos como 'token' para que tu app.js no cambie
    res.json({ token: data.conversation_token });

  } catch (error) {
    console.error("❌ Error interno:", error);
    res.status(500).json({ error: error.message });
  }
});

// Ruta raíz para ver que el servidor responde
app.get('/', (req, res) => res.json({ status: "Servidor ConvAI con Nueva API listo 🚀" }));

export default app
