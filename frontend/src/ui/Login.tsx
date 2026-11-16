import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { boot, useGame } from '../sim/engine';

export function Login() {
  const notice = useGame((s) => s.notice);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(username, password);
      useGame.setState({ notice: '' });
      await boot();
    } catch (err) {
      setError(err instanceof Error && 'status' in err ? err.message : 'De server is niet bereikbaar. Draait de backend?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-kaart" onSubmit={submit}>
        <h1>Slagboom De Groene Weide</h1>
        <p className="login-uitleg">
          Simulatie van de oprit met kentekenherkenning. Log in als receptie om een dienst te draaien,
          of als beheerder om ook de kentekenlijst te beheren.
        </p>
        {notice && <p className="melding">{notice}</p>}
        <label>
          Gebruikersnaam
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required maxLength={40} />
        </label>
        <label>
          Wachtwoord
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required maxLength={200} />
        </label>
        {error && <p className="fout" role="alert">{error}</p>}
        <button type="submit" className="knop primair" disabled={busy}>{busy ? 'Bezig…' : 'Log in'}</button>
      </form>
    </main>
  );
}
