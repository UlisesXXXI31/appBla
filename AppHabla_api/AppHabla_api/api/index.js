import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/practica/conectar', async (req, res) => {
  // Usamos los nombres exactos de tu captura de Vercel
  const agentId = process.env.ELEVENLABS_AGENT_ID; 
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    return res.status(500).json({ error: "Falta ELEVENLABS_AGENT_ID o API_KEY en Vercel" });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': apiKey }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: "ElevenLabs falló", details: errorText });
    }

    const data = await response.json();
    res.json({ token: data.token });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => res.json({ status: "Servidor ConvAI Listo 🚀" }));

export default app;
