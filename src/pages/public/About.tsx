import { Activity, Target, Users, Shield, Heart, ArrowRight, Lock, Server, Cloud } from 'lucide-react';
import { Link } from '@/context/RouterContext';

export function PublicAbout() {
  return (
    <div className="min-h-screen bg-surface pt-16">
      <nav className="fixed top-0 inset-x-0 z-50 bg-bg border-b border-hairline">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded bg-accent-deep text-ink">
              <Activity size={20} />
            </div>
            <span className="font-bold text-ink">PreventAI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-ink-dim hover:text-ink">Sign In</Link>
            <Link to="/register" className="px-4 py-2 rounded bg-accent text-ink text-sm font-medium hover:bg-accent-bright transition-colors">Get Started</Link>
          </div>
        </div>
      </nav>

      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-ink">About PreventAI</h1>
          <p className="mt-4 text-lg text-ink-dim">
            A proactive generative AI cloud framework for personalized preventive health risk mitigation.
            Built to demonstrate how multi-agent AI can transform preventive healthcare.
          </p>
        </div>
      </section>

      <section className="py-12 px-4 sm:px-6 bg-surface-2">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
          <ValueCard icon={<Target size={24} />} title="Our Mission" desc="Empower individuals and clinicians with AI-driven, personalized prevention plans that quantifiably reduce health risk." />
          <ValueCard icon={<Shield size={24} />} title="Safety First" desc="Every AI recommendation is verified by a Safety Agent and reviewed by a clinician before reaching the patient." />
          <ValueCard icon={<Heart size={24} />} title="Patient-Centered" desc="Plans are tailored to individual preferences, constraints, and genetic markers for maximum real-world adherence." />
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-6">Technology Stack</h2>
          <div className="space-y-4">
            <TechRow icon={<Cloud size={20} />} title="Serverless Cloud Architecture" desc="Built on a serverless-first architecture using free-tier cloud services for cost-effective scaling." />
            <TechRow icon={<Server size={20} />} title="Multi-Agent AI Orchestration" desc="Four specialized AI agents (Risk, Plan Generation, Personalization, Safety) coordinate to produce verified prevention plans." />
            <TechRow icon={<Lock size={20} />} title="HIPAA-Aligned Security" desc="Row-level security, role-based access control, encrypted data storage, and clinician-verified recommendations." />
            <TechRow icon={<Users size={20} />} title="Dual-Panel Interface" desc="Dedicated patient and clinician interfaces designed for collaboration and transparency." />
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 bg-bg-deep text-center">
        <h2 className="text-3xl font-bold text-ink">Ready to Get Started?</h2>
        <p className="mt-4 text-ink-faint">Create your account and start your proactive health journey today.</p>
        <Link to="/register" className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded bg-accent text-ink font-medium hover:bg-accent-bright transition-colors ">
          Create Free Account <ArrowRight size={18} />
        </Link>
      </section>
    </div>
  );
}

function ValueCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-surface rounded p-6 border border-hairline ">
      <div className="p-3 rounded bg-accent/10 text-accent w-fit mb-4">{icon}</div>
      <h3 className="font-semibold text-ink mb-2">{title}</h3>
      <p className="text-sm text-ink-dim leading-relaxed">{desc}</p>
    </div>
  );
}

function TechRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 p-2.5 rounded bg-accent/10 text-accent">{icon}</div>
      <div>
        <div className="font-semibold text-ink">{title}</div>
        <div className="text-sm text-ink-dim mt-1">{desc}</div>
      </div>
    </div>
  );
}
