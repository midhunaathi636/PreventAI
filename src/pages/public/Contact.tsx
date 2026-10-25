import { useState } from 'react';
import { Activity, Mail, MessageSquare, Send, MapPin, Phone } from 'lucide-react';
import { Link } from '@/context/RouterContext';
import { Button, Input, Textarea, Card } from '@/components/ui';

export function PublicContact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => {
      setName('');
      setEmail('');
      setMessage('');
      setSent(false);
    }, 3000);
  };

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
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-ink">Get in Touch</h1>
            <p className="mt-4 text-lg text-ink-dim">Have questions about PreventAI? We'd love to hear from you.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <ContactInfoCard icon={<Mail size={20} />} title="Email" value="contact@preventai.demo" />
              <ContactInfoCard icon={<Phone size={20} />} title="Phone" value="+1 (555) 010-2026" />
              <ContactInfoCard icon={<MapPin size={20} />} title="Location" value="Cloud-based, serverless architecture" />
            </div>

            <Card className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Your Name" value={name} onChange={setName} placeholder="Jane Doe" required />
                <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="jane@example.com" required />
                <Textarea label="Message" value={message} onChange={setMessage} placeholder="How can we help you?" rows={4} />
                <Button type="submit" className="w-full" disabled={sent}>
                  {sent ? (
                    <><MessageSquare size={18} /> Message Sent!</>
                  ) : (
                    <><Send size={18} /> Send Message</>
                  )}
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactInfoCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="flex items-center gap-4 bg-surface rounded p-5 border border-hairline ">
      <div className="p-3 rounded bg-accent/10 text-accent">{icon}</div>
      <div>
        <div className="text-sm text-ink-dim">{title}</div>
        <div className="font-semibold text-ink">{value}</div>
      </div>
    </div>
  );
}
