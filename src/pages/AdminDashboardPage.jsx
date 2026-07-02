import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Terminal, Server } from 'lucide-react';
import { supabase } from '../supabase';
import { importGoogleMapsLibrary } from '../utils/googleMapsLoader';

function AdminDashboardPage() {
  const navigate = useNavigate();
  const [testResult, setTestResult] = useState('');
  const [loading, setLoading] = useState(false);

  const testSupabaseConnection = async () => {
    setLoading(true);
    setTestResult('');

    try {
      const { error, count } = await supabase
        .from('cafes')
        .select('id', { count: 'exact', head: true });

      if (error) throw error;
      setTestResult(`[OK] Conexion Supabase exitosa.\nTotal de cafeterias: ${count}`);
    } catch (err) {
      setTestResult(`[ERROR] Supabase: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testGooglePlacesAPI = async () => {
    setLoading(true);
    setTestResult('');

    try {
      const [{ Map }, placesLibrary] = await Promise.all([
        importGoogleMapsLibrary('maps'),
        importGoogleMapsLibrary('places'),
      ]);
      const { PlacesService, PlacesServiceStatus } = placesLibrary;
      const mapDiv = document.createElement('div');
      const map = new Map(mapDiv, { center: { lat: 20.9753, lng: -89.6178 }, zoom: 15 });
      const service = new PlacesService(map);

      service.nearbySearch(
        {
          location: { lat: 20.9753, lng: -89.6178 },
          radius: 500,
          type: ['cafe'],
        },
        (results, status) => {
          if (status === PlacesServiceStatus.OK && results) {
            setTestResult(`[OK] Google Places API exitosa.\nCafeterias encontradas: ${results.length}\nEjemplo: ${results[0]?.name || 'Sin nombre'}`);
          } else {
            setTestResult(`[ERROR] Google Places API status: ${status}`);
          }
          setLoading(false);
        },
      );
    } catch (err) {
      setTestResult(`[ERROR] Ejecucion: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#1D1A15] flex flex-col p-6 font-mono text-[#E6DAC1]">
      <header className="flex items-center gap-4 mb-8 pb-4 border-b border-white/10">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-full bg-[#372821] hover:bg-[#493A33] flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="text-[#E6DAC1]" size={24} />
        </button>
        <h1 className="text-2xl font-bold text-white tracking-widest flex items-center gap-2">
          <Server className="text-blue-400" size={26} />
          Admin Dashboard
        </h1>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#27201A] p-6 rounded-2xl border border-white/5 h-min">
          <h2 className="text-xl font-bold mb-4 text-white">Pruebas a servicios</h2>

          <div className="flex flex-col gap-4">
            <button
              onClick={testSupabaseConnection}
              disabled={loading}
              className="w-full bg-[#372821] hover:bg-[#493A33] border border-[#E6DAC1]/20 py-3 rounded-xl transition-all font-bold tracking-wide active:scale-[0.98] disabled:opacity-60"
            >
              Test Supabase
            </button>

            <button
              onClick={testGooglePlacesAPI}
              disabled={loading}
              className="w-full bg-[#372821] hover:bg-[#493A33] border border-[#E6DAC1]/20 py-3 rounded-xl transition-all font-bold tracking-wide active:scale-[0.98] disabled:opacity-60"
            >
              Test Google Places API (Merida)
            </button>
            <p className="text-xs text-[#E6DAC1]/50 mt-2">Mas pruebas pueden ser agregadas luego.</p>
          </div>
        </div>

        <div className="bg-[#0f0d0b] p-6 rounded-2xl border border-white/5 flex flex-col min-h-[300px]">
          <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <Terminal size={20} className="text-green-400" />
            Consola | Resultados
          </h2>
          <div className="flex-1 bg-black rounded-xl p-4 overflow-y-auto whitespace-pre-wrap font-mono text-sm text-green-400 border border-green-500/20 shadow-inner">
            {loading ? (
              <span className="animate-pulse">Ejecutando prueba...</span>
            ) : (
              testResult || 'Esperando ejecucion de pruebas...'
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default AdminDashboardPage;
