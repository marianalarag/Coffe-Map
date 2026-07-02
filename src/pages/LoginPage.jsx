import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import PageLoading from '../components/PageLoading';
import { importGoogleMapsLibrary } from '../utils/googleMapsLoader';

function LoginPage() {
  const { user, loading, login, register, resetPassword } = useAuth();
  const { preloadInitialData } = useCoffeeData();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [authMode, setAuthMode] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingReset, setSubmittingReset] = useState(false);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [loginTransition, setLoginTransition] = useState(null);
  const [transitionAnimationDone, setTransitionAnimationDone] = useState(false);
  const enterButtonRef = useRef(null);

  const isRegisterMode = authMode === 'register';
  const isLoginMode = authMode === 'login';
  const isForgotMode = authMode === 'forgot';
  const isLoginSectionOpen = isLoginMode || isForgotMode;

  const handleModeSelect = (mode) => {
    setAuthMode((currentMode) => (currentMode === mode ? null : mode));
    setError('');
    setResetMessage('');
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setError('Ingresa tu correo para restablecer la contraseña.');
      return;
    }

    setError('');
    setResetMessage('');
    setSubmittingReset(true);

    try {
      await resetPassword(email.trim());
      setResetMessage('Te enviamos un enlace de recuperación. Revisa tu correo.');
    } catch {
      setError('No se pudo enviar el correo de recuperación.');
    } finally {
      setSubmittingReset(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setResetMessage('');
    setSubmitting(true);

    try {
      if (isRegisterMode) {
        if (!username.trim()) {
          setError('Ingresa un nombre de usuario.');
          return;
        }
        await register(email.trim(), password, username);
      } else {
        const { data } = await login(email.trim(), password);
        const buttonRect = enterButtonRef.current?.getBoundingClientRect();
        const originX = buttonRect ? buttonRect.left + buttonRect.width / 2 : window.innerWidth / 2;
        const originY = buttonRect ? buttonRect.top + buttonRect.height / 2 : window.innerHeight / 2;
        const diameter = Math.hypot(window.innerWidth, window.innerHeight) * 2;

        window.sessionStorage.setItem('coffee-map:map-entry-animation', 'slide-up');
        setTransitionAnimationDone(false);
        setLoginTransition({
          diameter,
          originX,
          originY,
          complete: false,
        });

        Promise.allSettled([
          preloadInitialData(data.user.id),
          importGoogleMapsLibrary('maps'),
        ]);
      }
    } catch {
      setError(
        isRegisterMode
          ? 'No se pudo crear la cuenta. Verifica el correo o usa una contraseña más segura.'
          : 'No se pudo iniciar sesión. Revisa correo y contraseña.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!loginTransition || loginTransition.complete) return undefined;

    const timeoutId = window.setTimeout(() => {
      setTransitionAnimationDone(true);
    }, 950);

    return () => window.clearTimeout(timeoutId);
  }, [loginTransition]);

  useEffect(() => {
    if (!transitionAnimationDone) return;

    setLoginTransition((current) => {
      if (!current || current.complete) return current;
      return { ...current, complete: true };
    });
  }, [transitionAnimationDone]);

  if (loading && !loginTransition) {
    return <PageLoading message="Cargando sesion..." />;
  }

  if (user && (!loginTransition || loginTransition.complete)) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="min-h-screen w-full bg-[#372821] flex items-center justify-center overflow-y-auto p-4">
      <section className="w-full max-w-md p-8">
        <style>{`
          .form-container {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .form-container.open {
            grid-template-rows: 1fr;
          }
          
          .form-content {
            min-height: 0;
            overflow: hidden;
            opacity: 0;
            transition: opacity 0.3s ease-out;
            transition-delay: 0s;
          }
          
          .form-container.open .form-content {
            opacity: 1;
            transition-delay: 0.2s;
          }

          @keyframes login-button-expand {
            0% {
              transform: scale(0);
            }
            100% {
              transform: scale(1);
            }
          }
        `}</style>

        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="Coffee Map Logo" className="object-contain" />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => handleModeSelect('login')}
              className="w-full h-min font-semibold py-1 rounded-xl transition-all z-10 relative bg-[#E6DAC1] hover:bg-[#C8B49A] text-[#372821]"
            >
              Inicia sesión
            </button>

            <div className={`form-container ${isLoginSectionOpen ? 'open' : ''}`}>
              <div className="form-content">
                {isForgotMode ? (
                  <form onSubmit={handleResetPassword} className="flex flex-col gap-4 pt-4 pb-2">
                    <label className="text-sm font-semibold text-[#E6DAC1]">
                      Correo de recuperación
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setError('');
                        }}
                        required
                        autoComplete="email"
                        className="mt-1 w-full rounded-xl border-2 border-[#E6DAC1]/45 px-3 py-2 outline-none shadow-none focus:shadow-none focus:ring-0 focus:border-[#E6DAC1] bg-transparent text-[#E6DAC1]"
                      />
                    </label>

                    {error && <p className="text-sm text-red-300">{error}</p>}
                    {resetMessage && <p className="text-sm text-green-300">{resetMessage}</p>}

                    <button
                      type="submit"
                      disabled={submittingReset}
                      className={`w-full h-min font-semibold py-1 rounded-xl transition-all mt-2 ${
                        submittingReset ? 'bg-gray-500 text-gray-300' : 'bg-[#E6DAC1] hover:bg-[#C8B49A] text-[#372821]'
                      }`}
                    >
                      {submittingReset ? 'Enviando...' : 'Enviar enlace'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleModeSelect('login')}
                      className="text-sm text-[#E6DAC1]/80 text-center underline hover:text-[#E6DAC1] transition-colors"
                    >
                      Volver a iniciar sesión
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-4 pb-2">
                    <label className="text-sm font-semibold text-[#E6DAC1]">
                      Correo
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        autoComplete="email"
                        className="mt-1 w-full rounded-xl border-2 border-[#E6DAC1]/45 px-3 py-2 outline-none shadow-none focus:shadow-none focus:ring-0 focus:border-[#E6DAC1] bg-transparent text-[#E6DAC1]"
                      />
                    </label>

                    <label className="text-sm font-semibold text-[#E6DAC1]">
                      Contraseña
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setError('');
                        }}
                        required
                        autoComplete="current-password"
                        className="mt-1 w-full rounded-xl border-2 border-[#E6DAC1]/45 px-3 py-2 outline-none shadow-none focus:shadow-none focus:ring-0 focus:border-[#E6DAC1] bg-transparent text-[#E6DAC1]"
                      />
                    </label>

                    {error && isLoginMode && !submitting && !loginTransition && (
                      <p className="text-sm text-red-300">{error}</p>
                    )}

                    <button
                      ref={enterButtonRef}
                      type="submit"
                      disabled={submitting}
                      className={`w-full h-min font-semibold py-1 rounded-xl transition-all mt-2 bg-[#E6DAC1] hover:bg-[#C8B49A] disabled:cursor-wait disabled:hover:bg-[#E6DAC1] ${
                        loginTransition ? 'text-[#E6DAC1]' : 'text-[#372821]'
                      }`}
                    >
                      {submitting ? 'Ingresando...' : 'Entrar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleModeSelect('forgot')}
                      className="text-sm text-[#E6DAC1]/80 text-center underline hover:text-[#E6DAC1] transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => handleModeSelect('register')}
              className="w-full h-min font-semibold py-1 rounded-xl transition-all z-10 relative border-2 border-[#E6DAC1] text-[#E6DAC1] hover:bg-white/10"
            >
              Crear cuenta
            </button>

            <div className={`form-container ${isRegisterMode ? 'open' : ''}`}>
              <div className="form-content">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-4 pb-2">
                  <label className="text-sm font-semibold text-[#E6DAC1]">
                    Nombre de usuario
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      required={isRegisterMode}
                      autoComplete="username"
                      className="mt-1 w-full rounded-xl border-2 border-[#E6DAC1]/45 px-3 py-2 outline-none shadow-none focus:shadow-none focus:ring-0 focus:border-[#E6DAC1] bg-transparent text-[#E6DAC1]"
                    />
                  </label>

                  <label className="text-sm font-semibold text-[#E6DAC1]">
                    Correo
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="email"
                      className="mt-1 w-full rounded-xl border-2 border-[#E6DAC1]/45 px-3 py-2 outline-none shadow-none focus:shadow-none focus:ring-0 focus:border-[#E6DAC1] bg-transparent text-[#E6DAC1]"
                    />
                  </label>

                  <label className="text-sm font-semibold text-[#E6DAC1]">
                    Contraseña
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-xl border-2 border-[#E6DAC1]/45 px-3 py-2 outline-none shadow-none focus:shadow-none focus:ring-0 focus:border-[#E6DAC1] bg-transparent text-[#E6DAC1]"
                    />
                  </label>

                  {error && isRegisterMode && <p className="text-sm text-red-300">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className={`w-full h-min font-semibold py-1 rounded-xl transition-all mt-2 ${
                      submitting ? 'border-2 border-gray-500 text-gray-500' : 'border-2 border-[#E6DAC1] text-[#E6DAC1] hover:bg-white/10'
                    }`}
                  >
                    {submitting ? 'Creando...' : 'Registrarse'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loginTransition && (
        <div
          className="fixed z-[60] rounded-full bg-[#E6DAC1] pointer-events-none"
          style={{
            width: `${loginTransition.diameter}px`,
            height: `${loginTransition.diameter}px`,
            left: `${loginTransition.originX - loginTransition.diameter / 2}px`,
            top: `${loginTransition.originY - loginTransition.diameter / 2}px`,
            transform: 'scale(0)',
            animation: 'login-button-expand 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
          onAnimationEnd={() => setTransitionAnimationDone(true)}
        />
      )}
    </main>
  );
}

export default LoginPage;
