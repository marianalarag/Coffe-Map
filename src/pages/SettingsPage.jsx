import { createElement, useEffect, useState } from 'react';
import { ArrowLeft, Bell, Check, Download, LockKeyhole, Mail, Save, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import PageLoading from '../components/PageLoading';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';

function SettingsPage() {
  const navigate = useNavigate();
  const { user, userProfile, updateCachedProfile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    setName(userProfile?.username || user.user_metadata?.username || '');
    setEmail(user.email || '');
  }, [navigate, user, userProfile]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      setFeedback({ type: 'error', message: 'Completa tu nombre y correo.' });
      return;
    }

    if (password && password.length < 6) {
      setFeedback({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    setSaving(true);
    setFeedback({ type: '', message: '' });

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          username: trimmedName,
          role: userProfile?.role || 'usuario',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (profileError) throw profileError;

      const emailChanged = trimmedEmail.toLowerCase() !== (user.email || '').toLowerCase();
      const authUpdates = {};
      if (emailChanged) authUpdates.email = trimmedEmail;
      if (password) authUpdates.password = password;

      if (Object.keys(authUpdates).length > 0) {
        const { error: authError } = await supabase.auth.updateUser(authUpdates);
        if (authError) throw authError;
      }

      updateCachedProfile({
        id: user.id,
        username: trimmedName,
        role: userProfile?.role || 'usuario',
        updated_at: new Date().toISOString(),
      });
      setPassword('');
      setFeedback({
        type: 'success',
        message: emailChanged ? 'Guardado. Revisa tu correo para confirmar el cambio.' : 'Tus cambios se guardaron.',
      });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'No se pudieron guardar los cambios.' });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <PageLoading message="Cargando ajustes..." />;

  return (
    <main className="account-settings-page">
      <div className="account-settings-scroll">
        <header className="account-settings-topbar">
          <button type="button" onClick={() => navigate('/profile')} aria-label="Volver al perfil"><ArrowLeft size={22} /></button>
          <div><span>Perfil</span><h1>Ajustes</h1></div>
          <ShieldCheck size={20} />
        </header>

        <section className="account-settings-intro">
          <div className="account-settings-avatar">
            <img src={userProfile?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(name || user.email || 'coffee-user')}`} alt="" />
          </div>
          <div>
            <h2>Tu cuenta Coffee Map</h2>
            <p>Administra tus datos y la forma en que apareces en la comunidad.</p>
          </div>
        </section>

        <form className="account-settings-form" onSubmit={handleSubmit}>
          <SettingsField icon={UserRound} label="Nombre de usuario" value={name} onChange={setName} placeholder="Tu nombre" />
          <SettingsField icon={Mail} label="Correo electrónico" value={email} onChange={setEmail} type="email" placeholder="tu@correo.com" />
          <SettingsField icon={LockKeyhole} label="Nueva contraseña" value={password} onChange={setPassword} type="password" placeholder="Déjala vacía para conservarla" />

          <div className="account-settings-option">
            <Bell size={18} />
            <div><strong>Notificaciones</strong><span>Próximamente podrás controlar tus avisos.</span></div>
            <span className="account-settings-badge">Pronto</span>
          </div>

          {!window.matchMedia('(display-mode: standalone)').matches && window.navigator.standalone !== true && (
            <button
              type="button"
              className="account-settings-install"
              onClick={() => window.dispatchEvent(new Event('coffee-map:pwa-show-install'))}
            >
              <Download size={18} />
              <span><strong>Instalar Coffee Map</strong><small>Gratis, sin App Store ni cuenta de Apple.</small></span>
            </button>
          )}

          {feedback.message && <p className={`account-settings-feedback account-settings-feedback-${feedback.type}`}>{feedback.message}</p>}

          <button type="submit" className="account-settings-save" disabled={saving}>
            {saving ? <span className="account-settings-save-dot" /> : <Save size={17} />}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>

        <div className="account-settings-note"><Check size={15} /> Tus datos se guardan de forma segura.</div>
      </div>
      <BottomNav />
    </main>
  );
}

function SettingsField({ icon, label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="account-settings-field">
      <span>{label}</span>
      <div>{createElement(icon, { size: 17 })}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>
    </label>
  );
}

export default SettingsPage;
