import 'dotenv/config';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { serverConfig } from './config';
import { attachSpeechWebSocket } from './routes/speech';
import { createSpeechAdapter, isStreamingSpeechAdapter } from './speech/createAdapter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const adapter = createSpeechAdapter();

attachSpeechWebSocket(httpServer, adapter);

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    provider: adapter.name,
    streaming: isStreamingSpeechAdapter(adapter),
  });
});

const distPath = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.use((request, response, next) => {
  if (request.path.startsWith('/api/')) {
    next();
    return;
  }
  response.sendFile(path.join(distPath, 'index.html'), (error) => {
    if (error) next(error);
  });
});

const port = serverConfig.port;
httpServer.listen(port, () => {
  console.log(`[speech-server] http://localhost:${port}`);
  console.log(`[speech-server] ASR adapter: ${adapter.name}`);
});
