import { useState } from 'react';
import { Mail, Lock, ArrowRight, ArrowLeft, User, Stethoscope, Heart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link, useRouter } from '@/context/RouterContext';
import { LogoBadge, LogoMark } from '@/components/Logo';
import { Button, Input, Spinner } from '@/components/ui';

export function AuthLogin() {
  const { signIn } = useAuth();
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err, role } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError('Could not sign in. Please check your email and password.');
    } else if (role === 'clinician' || role === 'doctor') {
      navigate('/clinician');
    } else {
      navigate('/patient');
    }
  };

  return (
    <AuthShell title="Welcome Back" subtitle="Sign in to your PreventAI account">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 rounded bg-risk-very-high/10 border border-risk-very-high/30 text-risk-very-high text-sm">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-ink-dim mb-1.5">Email</label>
          <div className="relative">
            <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full pl-11 pr-4 py-2.5 rounded border border-hairline text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-dim mb-1.5">Password</label>
          <div className="relative">
            <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full pl-11 pr-4 py-2.5 rounded border border-hairline text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-accent hover:text-accent">Forgot password?</Link>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? <Spinner className="h-5 w-5" /> : <>Sign In <ArrowRight size={18} /></>}
        </Button>
      </form>
      <div className="mt-6 text-center text-sm text-ink-dim">
        Don't have an account? <Link to="/register" className="text-accent hover:text-accent font-medium">Create one</Link>
      </div>
    </AuthShell>
  );
}

export function AuthRegister() {
  const { signUp, confirmSignUp } = useAuth();
  const { navigate } = useRouter();
  const [role, setRole] = useState<'patient' | 'doctor'>('patient');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowSuccess(false);

    if (needsConfirm) {
      setLoading(true);
      const { error: err, role: confirmedRole } = await confirmSignUp(email, confirmCode);
      setLoading(false);
      if (err) {
        setError(err);
      } else {
        const r = confirmedRole || (role === 'doctor' ? 'clinician' : 'patient');
        navigate(r === 'clinician' || r === 'doctor' ? '/clinician' : '/patient');
      }
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters (Cognito requirement).');
      return;
    }
    setLoading(true);
    const apiRole = role === 'doctor' ? 'clinician' : 'patient';
    const { error: err, needsConfirmation } = await signUp(
      email,
      password,
      apiRole,
      firstName,
      lastName
    );
    setLoading(false);
    if (err) {
      if (err.toLowerCase().includes('already') || err.toLowerCase().includes('registered')) {
        setError('An account with this email already exists. Try signing in instead.');
      } else {
        setError(err);
      }
    } else if (needsConfirmation) {
      setNeedsConfirm(true);
      setShowSuccess(true);
      setError('Check your email for a confirmation code, then enter it below.');
    } else {
      navigate(role === 'doctor' ? '/clinician' : '/patient');
    }
  };

  return (
    <AuthShell title="Create Your Account" subtitle="Join PreventAI and start your proactive health journey">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className={`p-3 rounded border text-sm ${showSuccess ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-risk-very-high/10 border-risk-very-high/30 text-risk-very-high'}`}>
            {error}
            {showSuccess && (
              <div className="mt-2">
                <Link to="/login" className="text-accent font-medium underline">Go to sign in</Link>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-ink-dim mb-2">I am a...</label>
          <div className="grid grid-cols-2 gap-3">
            <RoleCard
              active={role === 'patient'}
              onClick={() => setRole('patient')}
              icon={<Heart size={20} />}
              title="Patient"
              desc="Track my health"
            />
            <RoleCard
              active={role === 'doctor'}
              onClick={() => setRole('doctor')}
              icon={<Stethoscope size={20} />}
              title="Doctor"
              desc="Manage patients"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" required />
          <Input label="Last Name" value={lastName} onChange={setLastName} placeholder="Doe" required />
        </div>
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
        {!needsConfirm && (
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            required
          />
        )}
        {needsConfirm && (
          <Input
            label="Confirmation code"
            type="text"
            value={confirmCode}
            onChange={setConfirmCode}
            placeholder="Code from your email"
            required
          />
        )}

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? (
            <Spinner className="h-5 w-5" />
          ) : needsConfirm ? (
            <>Confirm email <ArrowRight size={18} /></>
          ) : (
            <>Create Account <ArrowRight size={18} /></>
          )}
        </Button>
      </form>
      <div className="mt-6 text-center text-sm text-ink-dim">
        Already have an account? <Link to="/login" className="text-accent hover:text-accent font-medium">Sign in</Link>
      </div>
    </AuthShell>
  );
}

export function AuthForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setSent(true);
  };

  return (
    <AuthShell title="Reset Password" subtitle="We'll send you a link to reset your password">
      {sent ? (
        <div className="text-center py-4">
          <div className="p-3 rounded-full bg-accent/10 text-accent w-fit mx-auto mb-4">
            <Mail size={24} />
          </div>
          <p className="text-ink-dim">
            If an account exists for <span className="font-semibold text-ink">{email}</span>,
            you will receive a password reset link shortly.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? <Spinner className="h-5 w-5" /> : <>Send Reset Link <ArrowRight size={18} /></>}
          </Button>
        </form>
      )}
      <div className="mt-6 text-center">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink-dim">
          <ArrowLeft size={16} /> Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left side */}
      <div className="hidden lg:flex lg:w-1/2 bg-surface-2 relative overflow-hidden">
        <div className="relative flex flex-col justify-center px-12 text-ink">
          {/* The full seal belongs here: on this panel the brand is the
              subject rather than a label in a corner. */}
          <Link to="/" className="mb-12 inline-flex" aria-label="PreventAI home">
            <LogoBadge size={168} />
          </Link>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            Proactive AI for<br />Preventive Health
          </h2>
          <p className="text-accent/15 text-lg leading-relaxed max-w-md">
            Predict health risks before they happen. Get personalized, AI-generated prevention plans
            verified for safety and tailored to you.
          </p>
          <div className="mt-12 space-y-4">
            <Feature text="Multi-agent AI orchestration" />
            <Feature text="Quantified risk reduction predictions" />
            <Feature text="Clinician-verified safety" />
            <Feature text="Closed-loop feedback learning" />
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 bg-surface-2">
        <div className="max-w-md w-full mx-auto">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2.5" aria-label="PreventAI home">
              <LogoMark size={40} />
              <span className="font-display text-2xl uppercase leading-none text-ink">PreventAI</span>
            </Link>
          </div>
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            <p className="text-ink-dim mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function RoleCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded border-2 transition-all ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-hairline hover:border-hairline text-ink-dim'
      }`}
    >
      {icon}
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-ink-faint">{desc}</div>
    </button>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-accent/10">
      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-surface/20">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span>{text}</span>
    </div>
  );
}
