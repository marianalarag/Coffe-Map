function PageLoading({ message = 'Cargando...', className = '' }) {
  return (
    <main className={`coffee-page-loading h-full min-h-screen w-full bg-[#1D1A15] flex flex-col items-center justify-center px-6 text-center ${className}`}>
      <div className="coffee-loading-mark" role="img" aria-label="Preparando café">
        <span className="coffee-steam coffee-steam-one" />
        <span className="coffee-steam coffee-steam-two" />
        <span className="coffee-steam coffee-steam-three" />
        <span className="coffee-cup">
        <span className="coffee-cup-coffee" />
        </span>
        <span className="coffee-cup-handle" />
        <span className="coffee-saucer" />
        <span className="coffee-search-glass" aria-hidden="true" />
      </div>
      <p className="coffee-loading-message">{message}</p>
    </main>
  );
}

export default PageLoading;
