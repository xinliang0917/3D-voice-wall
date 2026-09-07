import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { serverConfig } from '../config';
import type { SpeechAdapterLike } from '../speech/createAdapter';
import { isStreamingSpeechAdapter } from '../speech/createAdapter';
import type {
  SpeechStreamingSession,
  SpeechTranscriptionRequest,
  SpeechTranscriptionResult,
} from '../speech/types';

interface SpeechSession {
  chunks: Buffer[];
  contentType: string;
  languageHint: string | null;
  processing: boolean;
  bytes: number;
  streamingSession: SpeechStreamingSession | null;
}

interface ClientMessage {
  type?: string;
  languageHint?: unknown;
  contentType?: unknown;
}

function createSession(): SpeechSession {
  return {
    chunks: [],
    contentType: 'audio/webm;codecs=opus',
    languageHint: serverConfig.speechLanguageHint,
    processing: false,
    bytes: 0,
    streamingSession: null,
  };
}

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data);
}

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function classifyError(error: unknown): string {
  const errorCode = (error as { code?: string }).code;
  if (errorCode === 'asr') return 'asr';
  const message = error instanceof Error ? error.message : String(error);
  if (/429|rate|limit/i.test(message)) return 'rate_limited';
  if (/401|403|key/i.test(message)) return 'auth';
  if (/timeout|abort/i.test(message)) return 'timeout';
  return 'network';
}

function buildResult(
  transcription: SpeechTranscriptionResult,
  isFinal: boolean,
): {
  id: string;
  text: string;
  language?: string;
  languageCode?: string;
  confidence?: number;
  isFinal: boolean;
  timestamp: number;
} {
  const timestamp = Date.now();
  return {
    id: `msg_${timestamp.toString(36)}_${randomUUID().slice(0, 6)}`,
    text: transcription.text,
    language: transcription.language,
    languageCode: transcription.languageCode,
    confidence: transcription.confidence ?? 0.9,
    isFinal,
    timestamp,
  };
}

async function flushSegment(
  socket: WebSocket,
  session: SpeechSession,
  adapter: SpeechAdapterLike,
): Promise<void> {
  if (session.processing) return;

  const audio = Buffer.concat(session.chunks);
  session.chunks = [];
  session.bytes = 0;
  if (audio.length < 256) return;

  session.processing = true;
  sendJson(socket, { type: 'status', status: 'processing' });
  const flushStartedAt = Date.now();

  const request: SpeechTranscriptionRequest = {
    audio,
    contentType: session.contentType,
    languageHint: session.languageHint ?? undefined,
  };

  try {
    const transcription = await adapter.transcribe(request);
    console.log(
      `[speech] final ${transcription.languageCode ?? 'unknown'}: ${transcription.text} ` +
        `(${Date.now() - flushStartedAt}ms)`,
    );
    sendJson(socket, {
      type: 'final',
      result: buildResult(transcription, true),
    });
  } catch (error) {
    console.warn('[speech] transcription failed:', error instanceof Error ? error.message : error);
    sendJson(socket, {
      type: 'error',
      code: classifyError(error),
      message: error instanceof Error ? error.message : '语音识别失败',
    });
  } finally {
    session.processing = false;
  }
}

async function flushStreamingSegment(socket: WebSocket, session: SpeechSession): Promise<void> {
  if (session.processing || !session.streamingSession) return;
  if (session.bytes < 256) {
    session.bytes = 0;
    return;
  }

  session.processing = true;
  sendJson(socket, { type: 'status', status: 'processing' });
  try {
    await session.streamingSession.flush();
  } catch (error) {
    console.warn('[speech] streaming flush failed:', error instanceof Error ? error.message : error);
    sendJson(socket, {
      type: 'error',
      code: classifyError(error),
      message: error instanceof Error ? error.message : '语音识别失败',
    });
  } finally {
    session.processing = false;
    session.bytes = 0;
  }
}

export function attachSpeechWebSocket(httpServer: Server, adapter: SpeechAdapterLike): void {
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024 * 1024,
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const wsPath = serverConfig.wsPath.startsWith('/')
      ? serverConfig.wsPath
      : `/${serverConfig.wsPath}`;
    if (pathname !== wsPath) {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request);
    });
  });

  webSocketServer.on('connection', (socket) => {
    const session = createSession();

    if (isStreamingSpeechAdapter(adapter)) {
      session.streamingSession = adapter.createSession({
        onPartial: (result) => {
          sendJson(socket, { type: 'partial', result: buildResult(result, false) });
        },
        onFinal: (result) => {
          sendJson(socket, { type: 'final', result: buildResult(result, true) });
        },
        onError: (error) => {
          console.warn('[speech] streaming failed:', error instanceof Error ? error.message : error);
          sendJson(socket, {
            type: 'error',
            code: classifyError(error),
            message: error instanceof Error ? error.message : '语音识别失败',
          });
        },
      });
    }

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        const chunk = toBuffer(data);
        if (session.streamingSession) {
          session.streamingSession.feed(chunk);
          session.bytes += chunk.length;
          return;
        }
        session.chunks.push(chunk);
        session.bytes += chunk.length;
        if (session.bytes >= serverConfig.maxSegmentBytes && !session.processing) {
          void flushSegment(socket, session, adapter);
        }
        return;
      }

      try {
        const message = JSON.parse(String(data)) as ClientMessage;
        if (message.type === 'start') {
          session.contentType =
            typeof message.contentType === 'string' && message.contentType
              ? message.contentType
              : 'audio/webm;codecs=opus';
          session.languageHint =
            typeof message.languageHint === 'string'
              ? message.languageHint
              : serverConfig.speechLanguageHint;
          session.streamingSession?.setLanguageHint(session.languageHint);
          sendJson(socket, { type: 'ready' });
        } else if (message.type === 'flush') {
          if (session.streamingSession) {
            void flushStreamingSegment(socket, session);
          } else {
            void flushSegment(socket, session, adapter);
          }
        } else if (message.type === 'stop') {
          session.chunks = [];
          session.bytes = 0;
          void session.streamingSession?.stop();
        }
      } catch {
        sendJson(socket, { type: 'error', code: 'protocol', message: '无效的语音消息' });
      }
    });

    socket.on('close', () => {
      session.chunks = [];
      session.bytes = 0;
      void session.streamingSession?.stop();
    });
  });
}
