import { Activity, Lock, FileText, Shield } from 'lucide-react';
import { Link } from '@/context/RouterContext';

export function PublicPrivacy() {
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
          <Link to="/login" className="px-4 py-2 rounded bg-accent text-ink text-sm font-medium hover:bg-accent-bright transition-colors">Sign In</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded bg-accent/10 text-accent"><Lock size={24} /></div>
          <h1 className="text-3xl font-bold text-ink">Privacy Policy</h1>
        </div>

        <div className="prose prose-slate max-w-none space-y-6">
          <Section title="1. Overview" body="PreventAI is a demonstration platform for AI-driven preventive health risk mitigation. We take your privacy seriously and implement HIPAA-aligned security practices. This policy explains what data we collect, how we use it, and the controls you have." />

          <Section title="2. Data We Collect" body="We collect health data including wearable device readings (heart rate, steps, sleep), lifestyle questionnaire responses, synthetic FHIR EHR data, and optional genetic markers. We also collect account information such as your name, email, and role (patient or clinician)." />

          <Section title="3. How We Use Your Data" body="Your data is used to predict health risk trajectories, generate personalized prevention plans, and improve our AI models through closed-loop feedback. Clinicians you are linked to can view your health data to review and approve prevention plans." />

          <Section title="4. Data Security" body="All data is protected with row-level security policies in our database. Access is role-based: patients see only their own data, and clinicians see only their assigned patients. Sensitive columns (like your role) are protected from unauthorized changes. All data in transit is encrypted." />

          <Section title="5. Data Sharing" body="We do not sell or share your data with third parties. Your health data is only visible to you and the clinician linked to your account. No data is used for advertising." />

          <Section title="6. Your Rights" body="You can export your data at any time from Settings. You can delete your account, which removes all associated data. You control notification preferences and privacy settings from your dashboard." />

          <Section title="7. AI and Generative Models" body="Our AI agents process your data to generate predictions and recommendations. All AI-generated plans are verified by a Safety Agent and can be reviewed by a clinician before activation. AI explanations are provided for every recommendation." />

          <Section title="8. Synthetic Data" body="This platform uses synthetic data for demonstration purposes. No real patient data is used. Synthea-generated FHIR records and simulated wearable data populate the system for evaluation." />

          <Section title="9. Contact" body="If you have questions about this privacy policy, please contact us through the Contact page." />

          <div className="flex items-center gap-2 text-sm text-ink-dim mt-8 pt-8 border-t border-hairline">
            <Shield size={16} className="text-risk-low" />
            Last updated: September 2026
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-2">{title}</h2>
      <p className="text-ink-dim leading-relaxed">{body}</p>
    </div>
  );
}

export function PublicTerms() {
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
          <Link to="/login" className="px-4 py-2 rounded bg-accent text-ink text-sm font-medium hover:bg-accent-bright transition-colors">Sign In</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded bg-accent/10 text-accent"><FileText size={24} /></div>
          <h1 className="text-3xl font-bold text-ink">Terms of Service</h1>
        </div>

        <div className="space-y-6">
          <Section title="1. Acceptance of Terms" body="By creating an account and using PreventAI, you agree to these terms. This platform is a demonstration product and not a substitute for professional medical advice, diagnosis, or treatment." />

          <Section title="2. No Medical Advice" body="PreventAI provides AI-generated health risk predictions and prevention plans for informational purposes only. Always consult with a qualified healthcare provider before making decisions about your health. AI recommendations are not medical advice." />

          <Section title="3. User Roles" body="The platform supports two roles: patients and clinicians. Patients manage their own health data and prevention plans. Clinicians review and approve plans for their assigned patients. Role assignment is protected and cannot be self-modified." />

          <Section title="4. Data Responsibility" body="You are responsible for the accuracy of data you input. Clinicians are responsible for reviewing AI-generated recommendations before approval. The Safety Agent provides automated verification but does not replace clinical judgment." />

          <Section title="5. Acceptable Use" body="You agree not to misuse the platform, attempt to access other users' data, or interfere with system operations. Security measures including row-level security and role-based access are enforced at the database level." />

          <Section title="6. Disclaimer of Warranties" body="The platform is provided 'as is' without warranties of any kind. AI predictions and recommendations may not be accurate. The platform uses synthetic data for demonstration and is not intended for clinical use." />

          <Section title="7. Limitation of Liability" body="PreventAI is not liable for any decisions made based on AI-generated content. Users should always consult healthcare professionals for medical decisions." />

          <Section title="8. Account Termination" body="You may delete your account at any time from Settings. Account deletion removes all associated data permanently." />

          <Section title="9. Changes to Terms" body="We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the new terms." />

          <div className="flex items-center gap-2 text-sm text-ink-dim mt-8 pt-8 border-t border-hairline">
            <Shield size={16} className="text-risk-low" />
            Last updated: September 2026
          </div>
        </div>
      </div>
    </div>
  );
}
