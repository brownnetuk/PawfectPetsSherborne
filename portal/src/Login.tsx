import { useState, type FormEvent } from 'react';
import { requestCode, verifyCode, verifyPhone } from './api';

type Step = 'email' | 'code' | 'phone';

// Three screens: email -> the 6-digit code we emailed -> the last 3 digits
// of the mobile number on their account. See PortalWebLoginService.
export default function Login({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [digits, setDigits] = useState('');
  const [stepToken, setStepToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function startAgain(message = '') {
    setStep('email');
    setCode('');
    setDigits('');
    setStepToken('');
    setError(message);
  }

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await requestCode(email.trim());
      setCode('');
      setStep('code');
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await verifyCode(email.trim(), code);
      setStepToken(res.stepToken);
      setStep('phone');
    });
  };

  const submitDigits = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      try {
        const res = await verifyPhone(email.trim(), stepToken, digits);
        onSignedIn(res.token);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (/start again/i.test(message)) startAgain(message);
        else throw err;
      }
    });
  };

  const resend = () =>
    void run(async () => {
      await requestCode(email.trim());
      setCode('');
      setNotice('We have sent you a new code.');
    });

  return (
    <div className="card narrow">
      {step === 'email' && (
        <form onSubmit={submitEmail}>
          <h2>Sign in</h2>
          <p className="subtitle">
            Enter the email address you registered with us and we will email you a sign-in code.
          </p>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary full" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={submitCode}>
          <h2>Check your email</h2>
          <p className="subtitle">
            If <strong>{email.trim()}</strong> is registered with us, we have sent it a 6-digit code.
            It expires in 10 minutes.
          </p>
          <div className="field">
            <label htmlFor="code">Sign-in code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </div>
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          <button className="btn btn-primary full" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <div className="link-row">
            <button type="button" className="link" onClick={resend} disabled={busy}>
              Send a new code
            </button>
            <button type="button" className="link" onClick={() => startAgain()} disabled={busy}>
              Use a different email
            </button>
          </div>
        </form>
      )}

      {step === 'phone' && (
        <form onSubmit={submitDigits}>
          <h2>One more check</h2>
          <p className="subtitle">
            Enter the last 3 digits of the mobile number on your account.
          </p>
          <div className="field">
            <label htmlFor="digits">Last 3 digits of your mobile</label>
            <input
              id="digits"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{3}"
              maxLength={3}
              required
              className="code-input short"
              value={digits}
              onChange={(e) => setDigits(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary full" disabled={busy || digits.length !== 3}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <div className="link-row">
            <button type="button" className="link" onClick={() => startAgain()} disabled={busy}>
              Start again
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
