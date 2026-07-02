import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(`Hubo un error al actualizar la contraseña: ${updateError.message}`);
      } else {
        setMessage('Contraseña actualizada con éxito.');
        window.setTimeout(() => {
          navigate('/');
        }, 2500);
      }
    } catch {
      setError('Ocurrió un error inesperado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="h-full min-h-screen w-full bg-[#372821] flex items-center justify-center p-4">
      <section className="w-full max-w-md p-8 flex flex-col gap-4">
        <div className="flex justify-center mb-4">
          <img src="/logo.png" alt="Coffee Map Logo" className="object-contain w-32" />
        </div>

        <h1 className="text-2xl font-bold text-[#E6DAC1] text-center mb-2">Restablecer contraseña</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="text-sm font-semibold text-[#E6DAC1]">
            Nueva contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-[#E6DAC1] px-3 py-2 outline-none focus:ring-2 focus:ring-[#E6DAC1]/50 bg-transparent text-[#E6DAC1]"
            />
          </label>

          <label className="text-sm font-semibold text-[#E6DAC1]">
            Confirmar contraseña
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-[#E6DAC1] px-3 py-2 outline-none focus:ring-2 focus:ring-[#E6DAC1]/50 bg-transparent text-[#E6DAC1]"
            />
          </label>

          {error && <p className="text-sm text-red-300 text-center">{error}</p>}
          {message && <p className="text-sm text-green-300 text-center">{message}</p>}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full h-min font-semibold py-2 rounded-xl transition-all mt-4 ${
              submitting ? 'bg-gray-500 text-gray-300' : 'bg-[#E6DAC1] hover:bg-[#C8B49A] text-[#372821]'
            }`}
          >
            {submitting ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default ResetPasswordPage;
