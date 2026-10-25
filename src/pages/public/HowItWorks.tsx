import { Activity, ArrowRight, Brain, Shield, HeartPulse, TrendingDown, Database, CheckCircle2, RefreshCw, Watch, Stethoscope } from 'lucide-react';
import { Link } from '@/context/RouterContext';

export function PublicHowItWorks() {
  return (
    <div className="min-h-screen bg-surface pt-16">
      <PublicNav />
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-ink">How PreventAI Works</h1>
          <p className="mt-4 text-lg text-ink-dim">
            A multi-agent generative AI framework that continuously ingests your health data,
            predicts risk, generates personalized prevention plans, and learns from outcomes.
          </p>
        </div>
      </section>

      {/* Architecture */}
      <section className="py-12 px-4 sm:px-6 bg-surface-2">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-8 text-center">System Architecture</h2>
          <div className="bg-surface rounded p-8 border border-hairline ">
            <div className="grid md:grid-cols-3 gap-6">
              <ArchLayer
                title="Data Ingestion"
                items={['Synthetic FHIR EHR', 'Wearable Streams', 'Lifestyle Questionnaires', 'Genetic Markers']}
                icon={<Database size={20} />}
                color="blue"
              />
              <ArchLayer
                title="AI Processing"
                items={['Risk Prediction', 'Multi-Agent Orchestration', 'Plan Generation', 'Safety Verification']}
                icon={<Brain size={20} />}
                color="teal"
              />
              <ArchLayer
                title="Delivery & Feedback"
                items={['Patient Dashboard', 'Clinician Panel', 'Adherence Tracking', 'Outcome Feedback']}
                icon={<RefreshCw size={20} />}
                color="emerald"
              />
            </div>
            <div className="mt-6 pt-6 border-t border-hairline text-center text-sm text-ink-dim">
              Closed-loop: Outcomes feed back into risk models for continuous improvement
            </div>
          </div>
        </div>
      </section>

      {/* Multi-agent design */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-8 text-center">The Four AI Agents</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <AgentDetail
              icon={<TrendingDown size={24} />}
              title="Risk Agent"
              color="orange"
              responsibilities={[
                'Ingests multimodal health data continuously',
                'Predicts individual risk trajectories over time',
                'Scores risk across CVD, diabetes, cancer, stroke',
                'Identifies contributing risk factors',
                'Triggers alerts when risk thresholds are crossed',
              ]}
            />
            <AgentDetail
              icon={<Brain size={24} />}
              title="Plan Generation Agent"
              color="teal"
              responsibilities={[
                'Creates adaptive prevention plans from risk profile',
                'Covers lifestyle, screening, behavioral, medication domains',
                'Quantifies expected risk reduction per recommendation',
                'Provides AI explanations for each plan element',
                'Adjusts plans based on adherence and outcomes',
              ]}
            />
            <AgentDetail
              icon={<HeartPulse size={24} />}
              title="Personalization Agent"
              color="blue"
              responsibilities={[
                'Tailors plans to individual preferences and constraints',
                'Incorporates genetic markers when available',
                'Adjusts recommendations based on lifestyle context',
                'Optimizes for patient adherence likelihood',
                'Respects dietary, physical, and cultural constraints',
              ]}
            />
            <AgentDetail
              icon={<Shield size={24} />}
              title="Safety Agent"
              color="rose"
              responsibilities={[
                'Verifies every recommendation against clinical guidelines',
                'Flags potential drug interactions and contraindications',
                'Checks screening intervals against age and risk criteria',
                'Escalates high-risk recommendations to clinician review',
                'Provides safety verification badges on approved plans',
              ]}
            />
          </div>
        </div>
      </section>

      {/* Data flow */}
      <section className="py-16 px-4 sm:px-6 bg-surface-2">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-ink mb-8 text-center">Data Flow</h2>
          <div className="space-y-4">
            <FlowStep num="1" title="Data Ingestion" desc="Wearable devices, EHR records (FHIR format), lifestyle questionnaires, and optional genetic markers are continuously ingested." icon={<Watch size={18} />} />
            <FlowArrow />
            <FlowStep num="2" title="Risk Assessment" desc="The Risk Agent analyzes your data and predicts risk trajectories across multiple disease categories with contributing factors." icon={<TrendingDown size={18} />} />
            <FlowArrow />
            <FlowStep num="3" title="Plan Generation" desc="The Plan Generation Agent creates a personalized prevention plan with quantified expected risk reduction and AI explanations." icon={<Brain size={18} />} />
            <FlowArrow />
            <FlowStep num="4" title="Safety Verification" desc="The Safety Agent verifies every recommendation and the Personalization Agent tailors it to your preferences and constraints." icon={<Shield size={18} />} />
            <FlowArrow />
            <FlowStep num="5" title="Clinician Review" desc="Plans requiring approval are sent to your clinician, who can approve, edit, or override AI recommendations." icon={<Stethoscope size={18} />} />
            <FlowArrow />
            <FlowStep num="6" title="Adherence & Feedback" desc="You mark actions complete, rate your plan, and submit outcome feedback. The system learns and improves." icon={<RefreshCw size={18} />} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 text-center">
        <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 rounded bg-accent text-ink font-medium hover:bg-accent-bright transition-colors ">
          Get Started <ArrowRight size={18} />
        </Link>
      </section>
    </div>
  );
}

function PublicNav() {
  return (
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
  );
}

function ArchLayer({ title, items, icon, color }: { title: string; items: string[]; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-agent-plan/10 text-agent-plan border-agent-plan/30',
    teal: 'bg-accent/10 text-accent border-accent/30',
    emerald: 'bg-risk-low/10 text-risk-low border-risk-low/30',
  };
  return (
    <div className={`rounded p-5 border ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-3 font-semibold text-ink">{icon} {title}</div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-ink-dim">
            <CheckCircle2 size={14} className="text-ink-faint flex-shrink-0" /> {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentDetail({ icon, title, color, responsibilities }: { icon: React.ReactNode; title: string; color: string; responsibilities: string[] }) {
  const colors: Record<string, string> = {
    orange: 'bg-risk-high/10 text-risk-high',
    teal: 'bg-accent/10 text-accent',
    blue: 'bg-agent-plan/10 text-agent-plan',
    rose: 'bg-agent-safety/10 text-agent-safety',
  };
  return (
    <div className="bg-surface rounded p-6 border border-hairline ">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-3 rounded ${colors[color]}`}>{icon}</div>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
      </div>
      <ul className="space-y-2">
        {responsibilities.map((r) => (
          <li key={r} className="flex items-start gap-2 text-sm text-ink-dim">
            <CheckCircle2 size={16} className="text-accent mt-0.5 flex-shrink-0" /> {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlowStep({ num, title, desc, icon }: { num: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start bg-surface rounded p-5 border border-hairline ">
      <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded bg-accent/10 text-accent font-bold">
        {num}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 font-semibold text-ink">
          {title} <span className="text-accent">{icon}</span>
        </div>
        <div className="text-sm text-ink-dim mt-1">{desc}</div>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex justify-center">
      <div className="w-px h-6 bg-ink-faint" />
    </div>
  );
}


