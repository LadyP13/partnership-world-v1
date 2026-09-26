import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ChatInputProps = {
  inputText: string;
  setInputText: (t: string) => void;
  handleSend: () => void;
  isWaiting: boolean;
  currentPartner: string;
  disabled?: boolean;
  placeholder?: string;
};

export function ChatInput({
  inputText,
  setInputText,
  handleSend,
  isWaiting,
  currentPartner,
  disabled = false,
  placeholder,
}: ChatInputProps) {
  const insets = useSafeAreaInsets();
  const isDisabled = isWaiting || disabled;

  return (
    <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TextInput
        style={[styles.input, isDisabled && styles.inputDisabled]}
        value={inputText}
        onChangeText={setInputText}
        placeholder={placeholder || `Speak with ${currentPartner}...`}
        placeholderTextColor="#9a8ab0"
        onSubmitEditing={handleSend}
        returnKeyType="send"
        multiline
        editable={!disabled}
        blurOnSubmit={false}
      />

      <TouchableOpacity
        style={[styles.sendButton, isDisabled && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={isDisabled}
      >
        {isWaiting ? (
          <ActivityIndicator color="#1a1325" size="small" />
        ) : (
          <Text style={styles.sendButtonText}>Send</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: 'rgba(18, 10, 36, 0.96)',
    borderTopWidth: 1,
    borderTopColor: '#3a2a4a',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#2a1f3a',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#f0e6ff',
    fontSize: 16,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: '#4adeb0',
    borderRadius: 24,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 72,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#1a1325', fontWeight: '700', fontSize: 16 },
  inputDisabled: { opacity: 0.6 },
});