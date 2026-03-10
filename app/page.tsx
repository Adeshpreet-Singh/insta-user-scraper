import DataTable from '../components/DataTable';



export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30 scrollbar-hide overflow-y-auto">

      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <header className="mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-4 bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">
            Instagram Scraper Dashboard
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl">
            Visualize and search through your consolidated scraping results.
            Access profile details and direct links at a glance.
          </p>
        </header>

        <section>
          <DataTable data={[]} />
        </section>


        <footer className="mt-20 pt-8 border-t border-slate-800 text-slate-500 text-sm">
          <p>© 2026 Instagram User Scraper Tool. Fully database-driven lead management.</p>
        </footer>

      </div>
    </main>
  );
}
