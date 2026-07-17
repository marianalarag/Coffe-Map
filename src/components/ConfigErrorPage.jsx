import { AlertCircle } from 'lucide-react';

function ConfigErrorPage({ hasSupabaseUrl, hasSupabaseKey }) {
  return (
    <main className="min-h-screen w-full bg-[#1D1A15] flex items-center justify-center p-6 text-[#E6DAC1]">
      <section className="w-full max-w-lg rounded-2xl border border-red-300/20 bg-[#27201A] p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="text-red-300" size={28} />
          <h1 className="text-xl font-bold text-white">Falta configuracion de Supabase</h1>
        </div>

        <p className="text-sm leading-relaxed text-[#E6DAC1]/75">
          Este deployment no recibio todas las variables de entorno necesarias durante el build de Vercel.
        </p>

        <div className="mt-5 rounded-xl bg-black/35 p-4 font-mono text-sm">
          <p>VITE_SUPABASE_URL: {hasSupabaseUrl ? 'OK' : 'FALTA'}</p>
          <p>VITE_SUPABASE_PUBLISHABLE_KEY: {hasSupabaseKey ? 'OK' : 'FALTA'}</p>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-[#E6DAC1]/75">
          En Vercel, agrega esas variables en Settings / Environment Variables para Production y haz Redeploy sin build cache.
        </p>
      </section>
    </main>
  );
}

export default ConfigErrorPage;
