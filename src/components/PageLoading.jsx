function PageLoading({ message = 'Cargando...', className = '' }) {
  return (
    <main className={`h-full min-h-screen w-full bg-[#1D1A15] flex flex-col items-center justify-center px-6 text-center ${className}`}>
      <div className="w-10 h-10 rounded-full border-4 border-[#372821] border-t-[#E6DAC1] animate-spin" />
      <p className="mt-4 text-sm font-semibold text-[#E6DAC1]/60">{message}</p>
    </main>
  );
}

export default PageLoading;
