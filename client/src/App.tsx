import reactLogo from './assets/react.svg'
import './App.css'

function App() {
  return (
    <div className="app-container flex flex-col items-center justify-center py-24">
      <div className="mb-8 flex gap-8">
        <a
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white p-6 shadow-sm transition hover:shadow-lg"
          href="https://vitejs.dev"
          target="_blank"
          rel="noreferrer"
        >
          <img src="/vite.svg" className="h-16 w-16" alt="Vite logo" />
        </a>
        <a
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white p-6 shadow-sm transition hover:shadow-lg"
          href="https://react.dev"
          target="_blank"
          rel="noreferrer"
        >
          <img src={reactLogo} className="h-16 w-16" alt="React logo" />
        </a>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Vite + React + TypeScript</h1>
      <p className="mt-6 max-w-xl text-center text-lg text-slate-600">
        Start building your next project with a modern Vite setup that already includes Tailwind CSS.
      </p>
      <div className="mt-10 flex gap-4">
        <a
          className="rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          href="https://tailwindcss.com/docs/guides/vite"
          target="_blank"
          rel="noreferrer"
        >
          Tailwind Guide
        </a>
        <a
          className="rounded-lg border border-slate-300 px-6 py-3 text-base font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          href="https://vitejs.dev/guide/"
          target="_blank"
          rel="noreferrer"
        >
          Vite Docs
        </a>
      </div>
    </div>
  )
}

export default App
