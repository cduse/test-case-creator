import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    const err = await signIn(email.trim(), password);
    setLoading(false);
    if (err) setError(err);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Ionicons name="checkmark-circle" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.appName}>Testify</Text>
          </View>

          <Text style={styles.tagline}>Sign in with your organisation account</Text>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(v => !v)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.loginBtnText}>Sign In</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Don't have an account? Ask your organisation admin to invite you via the Testify web app.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm, gap: Spacing.sm },
  logoIcon: {
    width: 56, height: 56, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center',
  },
  appName: { fontSize: 36, fontWeight: '800', color: Colors.text, letterSpacing: -1 },
  tagline: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl * 1.5 },
  form: { gap: Spacing.md },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontSize: FontSize.md, color: Colors.text,
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: Spacing.md, top: 14 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.danger + '22', borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, flex: 1 },
  loginBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.md },
  hint: {
    marginTop: Spacing.xl, fontSize: FontSize.sm, color: Colors.textMuted,
    textAlign: 'center', lineHeight: 20,
  },
});
