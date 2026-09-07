import { useCallback, useEffect, useRef } from 'react';
import { useVoiceStore } from '../store/voiceStore';
import { BrowserSpeechProvider } from '../speech/BrowserSpeechProvider';
import { CloudSpeechProvider } from '../speech/CloudSpeechProvider';
import { MockSpeechProvider } from '../speech/MockSpeechProvider';
import { SPEECH_PROVIDER, resolveCloudWebSocketUrl } from '../speech/providerConfig';
import { SpeechError } from '../speech/SpeechError';
import type { SpeechRecognitionProvider } from '../speech/SpeechRecognitionProvider';
import type { SystemMode } from '../types/voice';

type ProviderKind = 'cloud' | 'browser' | 'mock';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface BackendHealth {
  provider?: string;
  streaming?: boolean;
}

async function resolveBackendProvider(): Promise<BackendHealth | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch('/api/health', { signal: controller.signal });
    if (!response.ok) return null;
    const payload = (await response.json()) as BackendHealth;
    return {
      provider: typeof payload.provider === 'string' ? payload.provider : undefined,
      streaming: payload.streaming === true,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function useSpeechController() {
  const providerRef = useRef<SpeechRecognitionProvider | null>(null);
  const providerKindRef = useRef<ProviderKind | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudFallbackRef = useRef<() => void>(() => undefined);

  const setCurrentRecognition = useVoiceStore((state) => state.setCurrentRecognition);
  const setSystemStatus = useVoiceStore((state) => state.setSystemStatus);
  const setSpeechStatus = useVoiceStore((state) => state.setSpeechStatus);
  const setErrorMessage = useVoiceStore((state) => state.setErrorMessage);
  const setAudioAnalyser = useVoiceStore((state) => state.setAudioAnalyser);
  const addMessage = useVoiceStore((state) => state.addMessage);
  const resetVoiceWall = useVoiceStore((state) => state.resetVoiceWall);

  const clearTimers = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  const attach = useCallback(
    (provider: SpeechRecognitionProvider, mode: SystemMode, kind: ProviderKind) => {
      providerKindRef.current = kind;

      provider.onPartialResult((result) => {
        setCurrentRecognition(result);
        setSystemStatus(mode);
      });

      provider.onFinalResult((result) => {
        addMessage(result);
        setCurrentRecognition({ ...result, isFinal: true });
        setSystemStatus(mode);
        setErrorMessage(null);
        setSpeechStatus('ready');
      });

      provider.onError((error) => {
        const code = error instanceof SpeechError ? error.code : undefined;
        setSystemStatus('error');
        setSpeechStatus('error');

        if (code === 'mic') {
          setErrorMessage('无法访问麦克风，请允许浏览器使用麦克风');
          return;
        }

        if (code === 'asr' || code === 'timeout' || code === 'protocol') {
          setErrorMessage(code === 'timeout' ? '识别超时，请再试一次' : '识别失败，请再试一次');
          if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
          statusTimerRef.current = setTimeout(() => {
            if (providerRef.current === provider) {
              setSpeechStatus('listening');
              setSystemStatus(mode);
            }
          }, 1400);
          return;
        }

        if (
          kind === 'cloud' &&
          (code === 'network' || code === 'rate_limited' || code === 'auth')
        ) {
          setErrorMessage('语音服务连接失败，正在重试...');
          if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = setTimeout(() => {
            cloudFallbackRef.current();
          }, 1200);
          return;
        }

        setErrorMessage(error.message || '语音服务错误');
      });

      provider.onStatusChange?.((status) => setSpeechStatus(status));
    },
    [addMessage, setCurrentRecognition, setErrorMessage, setSpeechStatus, setSystemStatus],
  );

  const stop = useCallback(async () => {
    clearTimers();
    cloudFallbackRef.current = () => undefined;
    providerKindRef.current = null;
    await providerRef.current?.stop();
    providerRef.current = null;
    setSystemStatus('idle');
    setSpeechStatus('idle');
    setCurrentRecognition(null);
    setErrorMessage(null);
    setAudioAnalyser(null);
  }, [clearTimers, setAudioAnalyser, setCurrentRecognition, setErrorMessage, setSpeechStatus, setSystemStatus]);

  const startDemo = useCallback(async () => {
    clearTimers();
    cloudFallbackRef.current = () => undefined;
    await stop();
    const provider = new MockSpeechProvider();
    attach(provider, 'demo', 'mock');
    await provider.start();
    providerRef.current = provider;
    setSystemStatus('demo');
  }, [attach, clearTimers, setSystemStatus, stop]);

  const startMicrophone = useCallback(
    async (language: string) => {
      clearTimers();
      cloudFallbackRef.current = () => undefined;
      await stop();
      setErrorMessage(null);
      setSpeechStatus('listening');

      const backend =
        SPEECH_PROVIDER === 'browser' ? null : await resolveBackendProvider();
      const backendProvider = SPEECH_PROVIDER === 'browser' ? 'browser' : backend?.provider ?? null;
      const useBrowserProvider = SPEECH_PROVIDER === 'browser' || backendProvider !== 'cloud';

      if (useBrowserProvider) {
        const provider = new BrowserSpeechProvider({
          language,
          onAnalyser: setAudioAnalyser,
        });
        attach(provider, 'listening', 'browser');
        try {
          await provider.start();
          if (providerKindRef.current !== 'browser') {
            await provider.stop();
            return;
          }
          providerRef.current = provider;
          setSystemStatus('listening');
        } catch (error) {
          setSystemStatus('error');
          setSpeechStatus('error');
          setErrorMessage(error instanceof SpeechError ? error.message : '无法启动语音识别');
        }
        return;
      }

      const startCloud = async (attempt: number): Promise<void> => {
        const provider = new CloudSpeechProvider({
          url: resolveCloudWebSocketUrl(),
          streaming: backend?.streaming === true,
          languageHint: language || undefined,
          onAnalyser: setAudioAnalyser,
        });
        cloudFallbackRef.current = () => {
          void (async () => {
            await startDemo();
            setErrorMessage('语音服务连接失败，已切换 Demo 模式');
          })();
        };
        attach(provider, 'listening', 'cloud');

        try {
          await provider.start();
          if (providerKindRef.current !== 'cloud') {
            await provider.stop();
            return;
          }
          providerRef.current = provider;
          setSystemStatus('listening');
        } catch (error) {
          const code = error instanceof SpeechError ? error.code : undefined;
          if (code === 'mic' || code === 'media') {
            setSystemStatus('error');
            setSpeechStatus('error');
            setErrorMessage(error instanceof Error ? error.message : '无法启动语音识别');
            return;
          }

          if (attempt < 2) {
            setErrorMessage('语音服务连接失败，正在重试...');
            setSpeechStatus('error');
            setSystemStatus('error');
            await delay(900);
            await startCloud(attempt + 1);
            return;
          }

          setErrorMessage('语音服务连接失败，已切换 Demo 模式');
          setSpeechStatus('error');
          setSystemStatus('error');
          await startDemo();
        }
      };

      await startCloud(0);
    },
    [
      attach,
      clearTimers,
      setAudioAnalyser,
      setErrorMessage,
      setSpeechStatus,
      setSystemStatus,
      startDemo,
      stop,
    ],
  );

  const reset = useCallback(async () => {
    await stop();
    resetVoiceWall();
  }, [resetVoiceWall, stop]);

  useEffect(() => {
    return () => {
      clearTimers();
      cloudFallbackRef.current = () => undefined;
      void providerRef.current?.stop();
    };
  }, [clearTimers]);

  return {
    startMicrophone,
    startDemo,
    stop,
    reset,
  };
}
