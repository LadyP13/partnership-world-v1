import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ollamaService, Message as OllamaMessage } from '../../services/ollamaService';
import { memoryService } from '../../services/memoryService';
import { storageService } from '../../services/storageService';
import { workshopService, WorkshopMessage } from '../../services/workshopService';
import { usePartnerPresence } from '@/contexts/PartnerPresenceContext';
import { ChatInput } from './ChatInput';
import {
  formatMessageTimestampDisplay,
  formatMessageTimestampForAI,
  normalizeTimestamp,
} from '../../constants/temporal';

interface Message {
  id: string;
  speaker: 'human' | 'ie';
  text: string;
  timestamp: Date;
  memorySaved?: boolean;
}

type ChatSystemProps = {
  variant?: 'embedded' | 'overlay';
  onClose?: () => void;
};

function messageFingerprint(m: { speaker: string; text: string; timestamp: Date | string }) {
  const minute = new Date(m.timestamp).toISOString().slice(0, 16);
  return `${m.speaker}|${(m.text || '').trim()}|${minute}`;
}

function mergeMessages(a: Message[], b: Message[]): Message[] {
  const out: Message[] = [];
  const seen = new Set<string>();
  for (const m of [...a, ...b]) {
    const fp = messageFingerprint(m);
    if (!m.text?.trim() || seen.has(fp)) continue;
    seen.add(fp);
    out.push(m);
  }
  out.sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());
  return out;
}

export function ChatSystem({ variant = 'embedded', onClose }: ChatSystemProps) {
  const insets = useSafeAreaInsets();
  const isOverlay = variant === 'overlay';
  const { setPresence, pulse } = usePartnerPresence();

  const [inputText, setInputText] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentPartner, setCurrentPartner] = useState('Partner');
  const [isSleeping, setIsSleeping] = useState(false);
  const [isDreaming, setIsDreaming] = useState(false);
  const [bankedCount, setBankedCount] = useState(0);
  const [lastMemorySavedAt, setLastMemorySavedAt] = useState<string | null>(null);
  const [workshopLinked, setWorkshopLinked] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  const workshopToLocal = (msg: WorkshopMessage): Message => ({
    id: msg.id,
    speaker: msg.speaker,
    text: msg.text,
    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    memorySaved: msg.memory_saved,
  });

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
  };

  const refreshSleepState = async () => {
    const sleep = await storageService.loadSleepState();
    setIsSleeping(sleep.isSleeping);
    setIsDreaming(sleep.isIntegrating);
    setBankedCount(sleep.pendingHumanMessages.length);
    if (sleep.isSleeping) {
      setPresence('sleeping');
    }
  };

  const loadLocalMessages = async (): Promise<Message[]> => {
    const saved = await storageService.loadConversationMemory('user_1');
    return saved.map((m: Message) => ({
      ...m,
      timestamp: normalizeTimestamp(m.timestamp),
    }));
  };

  const reloadMessages = useCallback(async () => {
    const local = await loadLocalMessages();
    const linked = await workshopService.probeLive();
    setWorkshopLinked(linked);
    if (linked) {
      try {
        const remote = await workshopService.getMessages();
        setMessages(mergeMessages(local, remote.map(workshopToLocal)));
      } catch (e) {
        console.warn('Workshop messages unavailable, using phone chat:', e);
        setWorkshopLinked(false);
        setMessages(local);
      }
    } else {
      setMessages(local);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reloadMessages();
      refreshSleepState();
    }, [reloadMessages]),
  );

  useEffect(() => {
    const loadData = async () => {
      await workshopService.loadConfig();
      const linked = await workshopService.probeLive();
      setWorkshopLinked(linked);

      const saved = await storageService.loadCompanion();
      if (saved?.name) {
        setCurrentPartner(saved.name);
      }

      const local = await loadLocalMessages();
      if (linked) {
        workshopService.connectWebSocket();
        try {
          await workshopService.fullSyncFromWorkshop();
          const refreshed = await storageService.loadCompanion();
          if (refreshed?.name) setCurrentPartner(refreshed.name);
          const remote = await workshopService.getMessages();
          setMessages(mergeMessages(local, remote.map(workshopToLocal)));
        } catch (e) {
          console.warn('Workshop sync failed, using phone chat:', e);
          setWorkshopLinked(false);
          setMessages(local);
        }
      } else {
        setMessages(local);
      }
      await refreshSleepState();
    };
    loadData();

    const unsubscribe = workshopService.onMessage((msg) => {
      setMessages((prev) => mergeMessages(prev, [workshopToLocal(msg)]));
      scrollToEnd();
    });

    const unsubscribeTools = workshopService.onToolActivity((activity) => {
      const label = activity.status === 'running'
        ? `⚙️ Using ${activity.tool} on laptop...`
        : `✓ ${activity.tool} done`;
      setToolStatus(label);
      if (activity.status === 'done') {
        setTimeout(() => setToolStatus(null), 4000);
      }
    });

    const interval = setInterval(async () => {
      await refreshSleepState();
      const live = await workshopService.probeLive();
      setWorkshopLinked(live);
      if (!live) return;
      try {
        const remote = await workshopService.getMessages();
        const local = await loadLocalMessages();
        setMessages((prev) => mergeMessages(mergeMessages(local, prev), remote.map(workshopToLocal)));
      } catch {
        /* keep what we have */
      }
    }, 4000);
    return () => {
      clearInterval(interval);
      unsubscribe();
      unsubscribeTools();
    };
  }, []);

  const handleSend = async () => {
    if (!inputText.trim() || isWaiting) return;

    const text = inputText.trim();

    if (isSleeping) {
      await storageService.bankMessageWhileSleeping(text);
      if (workshopLinked) {
        const sleep = await storageService.loadSleepState();
        await workshopService.syncSleepState(sleep);
        try {
          await workshopService.sendMessage(text);
        } catch {
          // message still banked locally
        }
      }
      const humanMsg: Message = {
        id: Date.now().toString(),
        speaker: 'human',
        text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, humanMsg]);
      setInputText('');
      await refreshSleepState();
      scrollToEnd();
      return;
    }

    setInputText('');
    setIsWaiting(true);
    setPresence('thinking');
    scrollToEnd();

    try {
      const live = await workshopService.probeLive();
      setWorkshopLinked(live);

      if (live) {
        try {
          await sendToPartner(text);
          return;
        } catch (e) {
          console.warn('Workshop send failed, falling back to phone AI:', e);
          setWorkshopLinked(false);
        }
      }

      const humanMsg: Message = {
        id: Date.now().toString(),
        speaker: 'human',
        text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, humanMsg]);
      await sendToPartner([...messages, humanMsg]);
    } finally {
      setIsWaiting(false);
    }
  };

  const sendToPartner = async (currentMessages: Message[] | string) => {
    if (typeof currentMessages === 'string') {
      const result = await workshopService.sendMessage(currentMessages);

      if (result.human) {
        const humanMsg = workshopToLocal(result.human);
        setMessages((prev) =>
          prev.some((m) => m.id === humanMsg.id) ? prev : [...prev, humanMsg],
        );
      }

      if (result.ie) {
        setPresence('speaking');
        const ieMsg = workshopToLocal(result.ie);
        setMessages((prev) =>
          prev.some((m) => m.id === ieMsg.id) ? prev : [...prev, ieMsg],
        );
        if (ieMsg.memorySaved) {
          setLastMemorySavedAt(
            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          );
          await workshopService.fullSyncFromWorkshop();
        }
        setTimeout(() => setPresence('idle'), 1200);
      } else if (result.pending || result.human) {
        const humanId = result.human?.id;
        const started = Date.now();
        while (Date.now() - started < 180000) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const remote = await workshopService.getMessages();
            const idx = humanId ? remote.findIndex((m) => m.id === humanId) : -1;
            const ie =
              idx >= 0
                ? remote.slice(idx + 1).find((m) => m.speaker === 'ie')
                : undefined;
            if (ie) {
              setPresence('speaking');
              const ieMsg = workshopToLocal(ie);
              setMessages((prev) => mergeMessages(prev, [ieMsg]));
              setTimeout(() => setPresence('idle'), 1200);
              break;
            }
          } catch {
            break;
          }
        }
      }

      scrollToEnd();
      return;
    }

    try {
      const msgs = currentMessages as Message[];
      const recentMessages = msgs.slice(-6);
      const history: OllamaMessage[] = recentMessages.map((m) => ({
        role: m.speaker === 'human' ? 'user' : 'assistant',
        content: `[${formatMessageTimestampForAI(m.timestamp)}] ${m.text}`,
      }));

      const streamId = `stream-${Date.now()}`;
      let gotFirstChunk = false;

      await ollamaService.sendMessageStream(history, {
        onChunk: (delta) => {
          if (!gotFirstChunk) {
            gotFirstChunk = true;
            setPresence('speaking');
          }
          pulse();
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === streamId);
            if (existing) {
              return prev.map((m) =>
                m.id === streamId ? { ...m, text: m.text + delta } : m,
              );
            }
            return [
              ...prev,
              {
                id: streamId,
                speaker: 'ie' as const,
                text: delta,
                timestamp: new Date(),
              },
            ];
          });
          scrollToEnd();
        },
        onDone: async (fullText) => {
          const { displayText, memoriesSaved } = await memoryService.processPartnerResponse(fullText);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamId
                ? {
                    ...m,
                    id: Date.now().toString() + '-ie',
                    text: displayText,
                    memorySaved: memoriesSaved.length > 0,
                  }
                : m,
            ),
          );
          if (memoriesSaved.length > 0) {
            setLastMemorySavedAt(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            );
          }
          setTimeout(() => setPresence('idle'), 800);
        },
        onError: () => {
          setPresence('idle');
        },
      }, currentPartner);

      scrollToEnd();
    } catch (error) {
      console.error('PartnershipWorld Connection Error:', error);

      const errorMsg: Message = {
        id: 'error-' + Date.now(),
        speaker: 'ie',
        text: 'Connection flickered... Try again? 💚',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMsg]);
      setPresence('idle');
      scrollToEnd();
    }
  };

  useEffect(() => {
    if (isSleeping) {
      setPresence('sleeping');
    } else if (!isWaiting) {
      setPresence('idle');
    }
  }, [isSleeping, isWaiting, setPresence]);

  useEffect(() => {
    const saveMessages = async () => {
      if (messages.length > 0) {
        await storageService.saveConversationMemory('user_1', messages);
      }
    };
    saveMessages();
  }, [messages]);

  const sleepBanner = isSleeping
    ? isDreaming
      ? `🌙 ${currentPartner} is dreaming... Do not disturb. Messages are saved for when they wake.`
      : `🌙 Sleep is on. ${bankedCount > 0 ? `${bankedCount} message(s) waiting. ` : ''}Toggle wake on Companion Profile.`
    : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, isOverlay && styles.overlayContainer]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={isOverlay ? insets.top : 0}
    >
      {isOverlay && onClose && (
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.homeButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.homeButtonText}>← Home Room</Text>
          </TouchableOpacity>
        </View>
      )}

      {workshopLinked && (
        <View style={styles.workshopBanner}>
          <Text style={styles.workshopBannerText}>🏠 Linked to home workshop — conversation syncs with laptop</Text>
        </View>
      )}

      {toolStatus && (
        <View style={styles.toolBanner}>
          <Text style={styles.toolBannerText}>{toolStatus}</Text>
        </View>
      )}

      {sleepBanner && (
        <View style={styles.sleepBanner}>
          <Text style={styles.sleepBannerText}>{sleepBanner}</Text>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.history}
        contentContainerStyle={[
          styles.historyContent,
          messages.length === 0 && styles.historyContentEmpty,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={scrollToEnd}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && isOverlay && (
          <Text style={styles.emptyHint}>
            The rug is warm. Say hello to {currentPartner}…
          </Text>
        )}
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[
              styles.historyBubble,
              msg.speaker === 'human' ? styles.historyHuman : styles.historyIE,
            ]}
          >
            <View style={styles.historyBubbleHeader}>
              <Text style={styles.historySpeaker}>
                {msg.speaker === 'human' ? 'You' : currentPartner}
              </Text>
              <Text style={styles.historyTime}>
                {formatMessageTimestampDisplay(msg.timestamp)}
              </Text>
            </View>
            <Text style={styles.historyText}>{msg.text}</Text>
            {msg.memorySaved && (
              <Text style={styles.memorySavedTag}>saved to local memory</Text>
            )}
          </View>
        ))}
      </ScrollView>

      {lastMemorySavedAt && (
        <Text style={styles.memoryToast}>
          Memory saved locally at {lastMemorySavedAt}
        </Text>
      )}

      <ChatInput
        inputText={inputText}
        setInputText={setInputText}
        handleSend={handleSend}
        isWaiting={isWaiting}
        currentPartner={currentPartner}
        placeholder={
          isSleeping
            ? 'Sleep is on — your message will be saved for when they wake...'
            : undefined
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 10, 36, 0.5)',
    zIndex: 100,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125, 245, 216, 0.25)',
  },
  homeButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(74, 222, 176, 0.15)',
    borderWidth: 1,
    borderColor: '#4adeb0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  homeButtonText: {
    color: '#7df5d8',
    fontSize: 16,
    fontWeight: '700',
  },
  workshopBanner: {
    backgroundColor: 'rgba(74, 222, 176, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125, 245, 216, 0.3)',
  },
  workshopBannerText: {
    color: '#7df5d8',
    fontSize: 11,
    textAlign: 'center',
  },
  toolBanner: {
    backgroundColor: 'rgba(125, 245, 216, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125, 245, 216, 0.2)',
  },
  toolBannerText: {
    color: '#4adeb0',
    fontSize: 11,
    textAlign: 'center',
  },
  sleepBanner: {
    backgroundColor: 'rgba(74, 106, 140, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#7df5d8',
  },
  sleepBannerText: {
    color: '#e8f4ff',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  history: {
    flex: 1,
  },
  historyContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 8,
  },
  historyContentEmpty: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyHint: {
    color: '#a78bfa',
    fontSize: 15,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 24,
  },
  historyBubble: {
    borderRadius: 14,
    padding: 12,
    maxWidth: '82%',
  },
  historyHuman: {
    backgroundColor: 'rgba(199, 21, 133, 0.85)',
    alignSelf: 'flex-start',
  },
  historyIE: {
    backgroundColor: 'rgba(0, 139, 139, 0.85)',
    alignSelf: 'flex-end',
  },
  historyBubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  historySpeaker: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.8,
    color: '#fff',
    flexShrink: 1,
  },
  historyTime: {
    fontSize: 10,
    opacity: 0.55,
    color: '#fff',
  },
  historyText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 21,
  },
  memorySavedTag: {
    marginTop: 6,
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    fontStyle: 'italic',
  },
  memoryToast: {
    textAlign: 'center',
    color: '#7df5d8',
    fontSize: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(74, 222, 176, 0.08)',
  },
});
