import { useEffect, useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  Check,
  CreditCard,
  Crown,
  History,
  Lock,
  LogOut,
  Mail,
  Phone,
  QrCode,
  Shield,
  Smartphone,
  User,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, setAuthToken } from '../lib/api';
import type { SubscriptionPlanItem, TitleItem, TransactionItem, UserProfile } from '../types/ott';
import { formatDuration } from '../utils/ott';

interface ProfileSubscriptionViewProps {
  user: UserProfile | null;
  plans: SubscriptionPlanItem[];
  paymentConfig: Record<string, unknown>;
  titles: TitleItem[];
  watchHistory: Array<{
    titleId: number;
    progressSeconds: number;
    durationSeconds: number;
    completed: boolean;
    updatedAt: string;
  }>;
  onAuthChange: (user: UserProfile | null, token?: string | null) => void;
  onSelectTitle: (title: TitleItem) => void;
  onOpenAdmin: () => void;
}

const LANGUAGES = ['English', 'Hindi', 'Malayalam', 'Tamil', 'Telugu', 'Kannada', 'Japanese', 'Korean'];

export function ProfileSubscriptionView({
  user,
  plans,
  paymentConfig,
  titles,
  watchHistory,
  onAuthChange,
  onSelectTitle,
  onOpenAdmin,
}: ProfileSubscriptionViewProps) {
  // Auth mode
  const [authTab, setAuthTab] = useState<'email' | 'mobile' | 'forgot'>('email');
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('+91');
  const [otpCode, setOtpCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Profile edit
  const [editName, setEditName] = useState(user?.username || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editLangs, setEditLangs] = useState<string[]>(user?.preferredLanguages || ['English', 'Hindi']);
  const [editAgeRating, setEditAgeRating] = useState(user?.maxAgeRating || '18+');
  const [parentalPin, setParentalPin] = useState('');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Checkout
  const [selectedPlanCode, setSelectedPlanCode] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'qr' | 'card_gateway'>('upi');
  const [utrRef, setUtrRef] = useState('');
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms' | null>(null);

  useEffect(() => {
    if (user) {
      setEditName(user.username);
      setEditPhone(user.phone);
      setEditLangs(user.preferredLanguages || ['English', 'Hindi']);
      setEditAgeRating(user.maxAgeRating || '18+');
      apiFetch<{ transactions: TransactionItem[] }>('/api/subscriptions/transactions')
        .then((res) => setTransactions(res.transactions))
        .catch(() => {});
    } else {
      setTransactions([]);
    }
  }, [user]);

  async function handleGoogleSignIn() {
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setAuthToken(idToken);
      const me = await apiFetch<{ user: UserProfile }>('/api/auth/me');
      onAuthChange(me.user, idToken);
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : 'Google Sign-In was cancelled or blocked.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await apiFetch<{ token: string; user: UserProfile }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(isRegister ? { username: usernameInput } : {}),
        }),
      });
      setAuthToken(res.token);
      onAuthChange(res.user, res.token);
      setPassword('');
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const res = await apiFetch<{ message: string; previewCode?: string }>('/api/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: phoneInput }),
      });
      setOtpRequested(true);
      setOtpPreview(res.previewCode || null);
      setAuthMsg(res.message);
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : 'Could not send OTP.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: phoneInput, code: otpCode }),
      });
      setAuthToken(res.token);
      onAuthChange(res.user, res.token);
      setOtpCode('');
      setOtpRequested(false);
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setAuthMsg(res.message);
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : 'Reset request failed.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch {
      // Ignore if local session
    }
    setAuthToken(null);
    onAuthChange(null, null);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          username: editName,
          phone: editPhone,
          preferredLanguages: editLangs,
          maxAgeRating: editAgeRating,
          ...(parentalPin ? { parentalPin } : {}),
        }),
      });
      onAuthChange(res.user);
      setParentalPin('');
      setProfileMsg('Profile preferences and parental controls saved.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Could not save profile.');
    }
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    setCheckoutMsg(null);
    try {
      const res = await apiFetch<{ transaction: TransactionItem; message: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planCode: selectedPlanCode,
          paymentMethod,
          referenceId: utrRef,
        }),
      });
      setTransactions((prev) => [res.transaction, ...prev]);
      setUtrRef('');
      setCheckoutMsg(res.message);
    } catch (err) {
      setCheckoutMsg(err instanceof Error ? err.message : 'Payment submission failed.');
    }
  }

  const upiId = String(paymentConfig.upiId || 'kinostage.ott@okhdfcbank');
  const merchantName = String(paymentConfig.merchantName || 'KinoStage Digital Cinema');
  const selectedPlan = plans.find((p) => p.code === selectedPlanCode);
  const titleMap = new Map(titles.map((t) => [t.id, t]));

  return (
    <div className="max-w-[1440px] mx-auto px-5 sm:px-8 lg:px-12 py-8 pb-20 space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
            {user ? `Account · ${user.username}` : 'Sign In & Membership'}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage your profile, preferred cinema languages, parental controls, and verified subscriptions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenAdmin}
            className="inline-flex items-center gap-2 rounded-xl bg-[#121319] hover:bg-[#1a1c24] border border-white/15 px-4 py-2.5 text-xs font-semibold text-white cursor-pointer"
          >
            <Shield className="w-4 h-4 text-[#D4AF37]" />
            Super Admin Console
          </button>
          {user && (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2.5 text-xs font-semibold text-zinc-200 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: AUTH OR PROFILE */}
      {!user ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 rounded-2xl bg-[#111218] border border-white/[0.08] p-6 sm:p-8 space-y-6">
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-bold text-white">Sign in to KinoStage</h2>
              <p className="text-xs text-zinc-400">
                Sync your Watchlist, Resume Watching, Live Chat identity, and VIP Membership across devices.
              </p>
            </div>

            {/* Google Sign-In */}
            <button
              type="button"
              disabled={authLoading}
              onClick={handleGoogleSignIn}
              className="w-full rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm py-3 px-4 flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
            >
              Continue with Google Sign-In
            </button>

            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <div className="h-px flex-1 bg-white/10" />
              <span>or use Email / Mobile OTP</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex items-center gap-2" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'email'}
                onClick={() => setAuthTab('email')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                  authTab === 'email' ? 'bg-[#E50914] text-white' : 'bg-[#1a1b23] text-zinc-300'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email &amp; Password
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'mobile'}
                onClick={() => setAuthTab('mobile')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                  authTab === 'mobile' ? 'bg-[#E50914] text-white' : 'bg-[#1a1b23] text-zinc-300'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Mobile OTP
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'forgot'}
                onClick={() => setAuthTab('forgot')}
                className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                  authTab === 'forgot' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Forgot Password
              </button>
            </div>

            {authTab === 'email' && (
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {isRegister && (
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Display Name"
                    aria-label="Display Name"
                    className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm text-white"
                  />
                )}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  aria-label="Email address"
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm text-white"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 6 characters)"
                  aria-label="Password"
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm py-3 cursor-pointer"
                >
                  {isRegister ? 'Create KinoStage Account' : 'Sign In with Email'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRegister((r) => !r)}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  {isRegister ? 'Already have an account? Sign in' : 'New to KinoStage? Create an account'}
                </button>
              </form>
            )}

            {authTab === 'mobile' && (
              <form onSubmit={otpRequested ? handleVerifyOtp : handleRequestOtp} className="space-y-4">
                <input
                  type="tel"
                  required
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+91 98765 43210"
                  aria-label="Mobile Number"
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm text-white"
                />
                {otpRequested && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="Enter 6-digit OTP"
                      aria-label="6-digit OTP"
                      className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm font-mono tracking-widest text-white"
                    />
                    {otpPreview && (
                      <p className="text-xs text-[#D4AF37] font-mono">
                        Preview OTP Code: {otpPreview}
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm py-3 cursor-pointer"
                >
                  {otpRequested ? 'Verify OTP & Sign In' : 'Send Mobile OTP'}
                </button>
              </form>
            )}

            {authTab === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your registered email"
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-sm py-3 cursor-pointer"
                >
                  Request Password Reset
                </button>
              </form>
            )}

            {authMsg && <p className="text-xs text-[#D4AF37]">{authMsg}</p>}
          </div>

          <div className="lg:col-span-6 space-y-5">
            <div className="rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-3">
              <h3 className="font-display text-lg font-semibold text-white">Member Benefits</h3>
              <ul className="space-y-2.5 text-sm text-zinc-300">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                  <span>Automatic Resume Watching &amp; personalized cinema recommendations across devices.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                  <span>Real-time identity in 24/7 Reality Show Live Chat, Audience Voting, and Live Studio.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                  <span>Parental PIN controls, age rating filters, and verified UPI/Gateway billing records.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Profile & Parental Controls Form */}
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-7 rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-5"
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-[#1d1f29] border border-white/15 flex items-center justify-center text-white font-display font-bold text-lg">
                  {user.username.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-white">{user.username}</h2>
                  <p className="text-xs text-zinc-400">
                    {user.email} · Role: <span className="capitalize text-zinc-200">{user.role}</span>
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-[#D4AF37] font-semibold">
                  {user.subscriptionTier} Plan
                </p>
                {user.subscriptionExpiresAt && (
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Valid till {new Date(user.subscriptionExpiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 flex items-center gap-1.5" htmlFor="prof-name">
                  <User className="w-3.5 h-3.5" /> Username
                </label>
                <input
                  id="prof-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 flex items-center gap-1.5" htmlFor="prof-phone">
                  <Phone className="w-3.5 h-3.5" /> Phone Number
                </label>
                <input
                  id="prof-phone"
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-zinc-400">Preferred Languages (powers your personalized shelves)</p>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((lang) => {
                  const active = editLangs.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() =>
                        setEditLangs((prev) =>
                          prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                        active
                          ? 'bg-[#E50914] border-[#E50914] text-white'
                          : 'bg-[#090a0e] border-white/10 text-zinc-300'
                      }`}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 flex items-center gap-1.5" htmlFor="prof-age">
                  <Lock className="w-3.5 h-3.5" /> Parental Control Max Rating
                </label>
                <select
                  id="prof-age"
                  value={editAgeRating}
                  onChange={(e) => setEditAgeRating(e.target.value)}
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm text-white"
                >
                  <option value="U">U (All Ages)</option>
                  <option value="7+">7+</option>
                  <option value="13+">13+</option>
                  <option value="16+">16+</option>
                  <option value="18+">18+ (Unrestricted)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400" htmlFor="prof-pin">
                  Set/Update 4-Digit Parental PIN (optional)
                </label>
                <input
                  id="prof-pin"
                  type="password"
                  maxLength={4}
                  pattern="\d{4}"
                  value={parentalPin}
                  onChange={(e) => setParentalPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-3.5 py-2.5 text-sm font-mono text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                type="submit"
                className="rounded-xl bg-[#E50914] hover:bg-[#c80812] text-white font-semibold text-xs px-5 py-3 cursor-pointer"
              >
                Save Profile &amp; Controls
              </button>
              {profileMsg && <p className="text-xs text-emerald-400">{profileMsg}</p>}
            </div>
          </form>

          {/* Watch History */}
          <div className="lg:col-span-5 rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-[#D4AF37]" />
              Recent Watch History
            </h3>
            {watchHistory.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Titles you play will appear here with exact playback resume timestamps.
              </p>
            ) : (
              <div className="space-y-3">
                {watchHistory.slice(0, 6).map((item) => {
                  const t = titleMap.get(item.titleId);
                  if (!t) return null;
                  return (
                    <button
                      key={`${item.titleId}-${item.updatedAt}`}
                      type="button"
                      onClick={() => onSelectTitle(t)}
                      className="w-full text-left rounded-xl bg-[#0a0b0f] border border-white/[0.06] hover:border-white/20 p-3 flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                        <p className="text-xs text-zinc-400 font-mono tabular-nums mt-0.5">
                          {item.completed
                            ? 'Completed'
                            : `Paused at ${formatDuration(item.progressSeconds)} / ${formatDuration(item.durationSeconds)}`}
                        </p>
                      </div>
                      <span className="text-xs text-[#E50914] font-semibold shrink-0">Resume</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 2: SUBSCRIPTION PLANS & VERIFIED UPI / QR CHECKOUT */}
      <section className="space-y-6 border-t border-white/[0.08] pt-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D4AF37] inline-flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" />
            Subscription &amp; Billing
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
            Flexible Streaming Plans
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isCurrent = user?.subscriptionTier === plan.code;
            const isSelected = selectedPlanCode === plan.code;
            return (
              <div
                key={plan.code}
                className={`rounded-2xl p-6 flex flex-col justify-between gap-6 border ${
                  plan.code === 'yearly'
                    ? 'bg-[#14131a] border-[#D4AF37]/40'
                    : 'bg-[#111218] border-white/[0.08]'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-[11px] font-semibold uppercase text-emerald-400">Active</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="font-display text-3xl font-bold text-white">
                      {plan.priceInr === 0 ? 'Free' : `₹${plan.priceInr}`}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {plan.priceInr > 0 ? `/ ${plan.billingCycle} ($${plan.priceUsd})` : plan.billingCycle}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Max Resolution: {plan.maxQuality} · {plan.adsSupported ? 'Ads Supported' : '100% Ad-Free'}
                  </p>
                  <ul className="space-y-2 text-xs text-zinc-300">
                    {plan.featuresJson.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.code !== 'free' && (
                  <button
                    type="button"
                    onClick={() => setSelectedPlanCode(plan.code as 'monthly' | 'yearly')}
                    className={`w-full rounded-xl py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#E50914] text-white'
                        : 'bg-white/10 hover:bg-white/15 text-white'
                    }`}
                  >
                    {isSelected ? 'Selected for Checkout' : `Choose ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* UPI / QR / Gateway Verified Checkout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSubmitPayment}
            className="lg:col-span-7 rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-white">
                Complete Payment — {selectedPlan?.name || 'Premium'} (₹{selectedPlan?.priceInr || 299})
              </h3>
              <span className="text-xs text-zinc-400">Verified Reconciliation Only</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'upi', label: 'UPI ID Transfer', icon: Smartphone },
                { id: 'qr', label: 'Scan UPI QR', icon: QrCode },
                { id: 'card_gateway', label: 'Payment Gateway', icon: CreditCard },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as 'upi' | 'qr' | 'card_gateway')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer border ${
                    paymentMethod === m.id
                      ? 'bg-[#E50914] border-[#E50914] text-white'
                      : 'bg-[#090a0e] border-white/10 text-zinc-300'
                  }`}
                >
                  <m.icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-[#0a0b0f] border border-white/[0.08] p-4 flex flex-col sm:flex-row items-center gap-5">
              {/* Crisp deterministic SVG QR block representing UPI deep link */}
              <div className="w-28 h-28 rounded-xl bg-white p-2.5 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 21 21" className="w-full h-full" aria-label={`UPI QR for ${upiId}`}>
                  <rect width="21" height="21" fill="#ffffff" />
                  <path
                    fill="#070709"
                    d="M1 1h7v7H1V1zm1 1v5h5V2H2zm1 1h3v3H3V3zm10-2h7v7h-7V1zm1 1v5h5V2h-5zm1 1h3v3h-3V3zM1 13h7v7H1v-7zm1 1v5h5v-5H2zm1 1h3v3H3v-3zm7-12h2v2h-2V3zm0 4h2v2h-2V7zm3 2h2v2h-2V9zm-3 2h2v2h-2v-2zm4 2h2v2h-2v-2zm3-2h2v2h-2v-2zm-7 4h2v4h-2v-4zm4 2h4v2h-4v-2zm3-4h2v2h-2v-2z"
                  />
                </svg>
              </div>
              <div className="space-y-1.5 text-xs">
                <p className="text-zinc-400">Authorized Merchant UPI</p>
                <p className="font-mono text-sm font-semibold text-white">{upiId}</p>
                <p className="text-zinc-400">Merchant: {merchantName}</p>
                <p className="text-[11px] text-zinc-500">
                  Security Policy: Subscriptions are never activated from unverified payment screenshots. Submit your official 12-digit UTR / gateway reference ID below for automated gateway or Finance Admin reconciliation.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400" htmlFor="utr-ref">
                UPI UTR / Gateway Reference ID
              </label>
              <input
                id="utr-ref"
                type="text"
                required
                minLength={6}
                value={utrRef}
                onChange={(e) => setUtrRef(e.target.value)}
                placeholder="e.g., UTR432901882741"
                className="w-full rounded-xl bg-[#090a0e] border border-white/10 px-4 py-3 text-sm font-mono text-white"
              />
            </div>

            <button
              type="submit"
              disabled={!user}
              className="rounded-xl bg-[#E50914] hover:bg-[#c80812] disabled:opacity-50 text-white font-semibold text-sm px-6 py-3 cursor-pointer"
            >
              {user ? 'Submit Payment for Verification' : 'Sign In Above to Subscribe'}
            </button>

            {checkoutMsg && <p className="text-xs text-[#D4AF37] leading-relaxed">{checkoutMsg}</p>}
          </form>

          {/* Transaction History */}
          <div className="lg:col-span-5 rounded-2xl bg-[#111218] border border-white/[0.08] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-white">Your Transactions</h3>
            {transactions.length === 0 ? (
              <p className="text-xs text-zinc-500">No subscription transactions recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="rounded-xl bg-[#0a0b0f] border border-white/[0.06] p-3.5 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white uppercase">{tx.planCode} Plan</span>
                      <span className="font-mono text-white tabular-nums">
                        {tx.currency} {tx.amount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-zinc-400">
                      <span className="font-mono">{tx.referenceId}</span>
                      <span
                        className={`font-semibold uppercase ${
                          tx.status === 'verified'
                            ? 'text-emerald-400'
                            : tx.status === 'pending_verification'
                              ? 'text-amber-400'
                              : 'text-red-400'
                        }`}
                      >
                        {tx.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3: LEGAL, PRIVACY & COMPLIANCE */}
      <section className="border-t border-white/[0.08] pt-8 space-y-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
          <button
            type="button"
            onClick={() => setLegalTab(legalTab === 'privacy' ? null : 'privacy')}
            className="hover:text-white underline cursor-pointer"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => setLegalTab(legalTab === 'terms' ? null : 'terms')}
            className="hover:text-white underline cursor-pointer"
          >
            Terms of Service &amp; Content Rights Policy
          </button>
        </div>

        {legalTab === 'privacy' && (
          <div className="rounded-xl bg-[#111218] border border-white/[0.08] p-5 text-xs text-zinc-300 space-y-2 max-w-3xl leading-relaxed">
            <h4 className="font-display text-sm font-semibold text-white">KinoStage Privacy Policy</h4>
            <p>
              We store only the account profile, watchlist, watch history, and verified transaction records required to deliver personalized streaming and billing reconciliation. Authentication tokens remain in memory and are never stored in insecure browser storage.
            </p>
          </div>
        )}

        {legalTab === 'terms' && (
          <div className="rounded-xl bg-[#111218] border border-white/[0.08] p-5 text-xs text-zinc-300 space-y-2 max-w-3xl leading-relaxed">
            <h4 className="font-display text-sm font-semibold text-white">Terms of Service &amp; Broadcast Rights</h4>
            <p>
              KinoStage publishes only authorized OTT titles, licensed live broadcasts, and official YouTube embedded presentations using permitted APIs. Restricted streams are never scraped or downloaded. Copyright holders may file takedown notices directly from any title page.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
