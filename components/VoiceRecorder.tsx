import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface Props {
  onTranscriptionComplete: (uri: string, duration: number) => void;
  disabled?: boolean;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'stopping';

const MAX_DURATION_MS = 120_000;

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceRecorder({ onTranscriptionComplete, disabled }: Props) {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  function startPulse() {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  }

  function stopPulse() {
    pulseLoop.current?.stop();
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }

  function startTimer() {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1000 >= MAX_DURATION_MS) {
          handleStop();
          return prev;
        }
        return prev + 1000;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function handleStart() {
    if (disabled) return;
    setState('requesting');

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setState('idle');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setState('recording');
      startTimer();
      startPulse();
    } catch (e) {
      console.error('Failed to start recording', e);
      setState('idle');
    }
  }

  async function handleStop() {
    if (state !== 'recording' || !recordingRef.current) return;
    setState('stopping');
    stopTimer();
    stopPulse();

    try {
      const recording = recordingRef.current;
      const duration = elapsed;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (uri) {
        onTranscriptionComplete(uri, duration);
      }
    } catch (e) {
      console.error('Failed to stop recording', e);
    } finally {
      setState('idle');
      setElapsed(0);
    }
  }

  const isRecording = state === 'recording';
  const isLoading = state === 'requesting' || state === 'stopping';

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }, isRecording && styles.pulseRingActive]} />
      <TouchableOpacity
        style={[styles.button, isRecording && styles.buttonRecording, (isLoading || disabled) && styles.buttonDisabled]}
        onPress={isRecording ? handleStop : handleStart}
        disabled={isLoading || disabled}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color={Colors.white} size="large" />
        ) : (
          <Text style={styles.icon}>{isRecording ? '⏹' : '🎙️'}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>
        {state === 'idle' && 'Tap to record'}
        {state === 'requesting' && 'Requesting permission...'}
        {state === 'recording' && `Recording · ${formatTime(elapsed)}`}
        {state === 'stopping' && 'Processing...'}
      </Text>

      {isRecording && (
        <Text style={styles.hint}>Tap the button to stop and transcribe</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  pulseRing: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.primary + '11',
    top: Spacing.lg,
  },
  pulseRingActive: { backgroundColor: Colors.recording + '22' },
  button: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: Colors.primary, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  buttonRecording: {
    backgroundColor: Colors.recording,
    shadowColor: Colors.recording,
  },
  buttonDisabled: { opacity: 0.5 },
  icon: { fontSize: 32 },
  label: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginTop: 4 },
  hint: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
