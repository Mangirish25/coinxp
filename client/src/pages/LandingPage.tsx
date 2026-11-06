import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { HealthStatus } from '../components/HealthStatus';

export function LandingPage() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl pt-8 md:pt-16"
    >
      <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs font-medium text-brand-700">
        <Sparkles className="h-3.5 w-3.5" /> Your money habits, in progress
      </div>
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
        Make progress with <span className="text-brand-600">every money decision.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-ink-500 md:text-lg">
        CoinXP is being built to make financial awareness, consistency, and thoughtful goals feel
        rewarding.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/register"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700"
        >
          Get started <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/login"
          className="rounded-xl border border-black/10 bg-white px-5 py-3 text-sm font-medium text-ink-700 hover:bg-canvas"
        >
          Log in
        </Link>
      </div>
      <div className="mt-12 rounded-card border border-black/5 bg-white p-5 shadow-sm">
        <HealthStatus />
      </div>
    </motion.section>
  );
}
