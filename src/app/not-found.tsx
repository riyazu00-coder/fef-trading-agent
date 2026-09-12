import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#020408] text-white flex flex-col items-center justify-center font-mono space-y-4">
      <h2 className="text-2xl font-black text-amber-400">404 - TERMINAL NODE NOT FOUND</h2>
      <p className="text-gray-400 text-sm">The requested market intelligence route does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition-colors"
      >
        Return to Command Center
      </Link>
    </div>
  );
}
