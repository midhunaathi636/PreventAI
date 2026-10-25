import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RouterProvider, useRouter } from '@/context/RouterContext';
import { AppLayout } from '@/components/AppLayout';
import { Spinner } from '@/components/ui';

// Public pages
import { PublicHome } from '@/pages/public/Home';
import { PublicHowItWorks } from '@/pages/public/HowItWorks';
import { PublicAbout } from '@/pages/public/About';
import { PublicPrivacy, PublicTerms } from '@/pages/public/Legal';
import { PublicContact } from '@/pages/public/Contact';

// Auth pages
import { AuthLogin, AuthRegister, AuthForgotPassword } from '@/pages/auth/Auth';

// Patient pages
import { PatientOverview } from '@/pages/patient/Overview';
import { PatientRiskTrajectory } from '@/pages/patient/RiskTrajectory';
import { PatientMyPlan } from '@/pages/patient/MyPlan';
import { PatientWearables } from '@/pages/patient/Wearables';
import { PatientProfile } from '@/pages/patient/Profile';
import { PatientSettings } from '@/pages/patient/Settings';
import { PatientCare } from '@/pages/patient/Care';

// Clinician pages
import { ClinicianPatients } from '@/pages/clinician/Patients';
import { ClinicianPatientDetail } from '@/pages/clinician/PatientDetail';
import { ClinicianRiskMonitor } from '@/pages/clinician/RiskMonitor';
import { ClinicianPlansReview } from '@/pages/clinician/PlansReview';
import { ClinicianAnalytics } from '@/pages/clinician/Analytics';
import { DoctorCare } from '@/pages/clinician/Care';

function Routes() {
  const { user, profile, loading } = useAuth();
  const { path } = useRouter();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2">
        <Spinner className="h-10 w-10" />
      </div>
    );
  }

  // Public routes
  const publicRoutes: Record<string, () => React.ReactNode> = {
    '/': () => <PublicHome />,
    '/how-it-works': () => <PublicHowItWorks />,
    '/about': () => <PublicAbout />,
    '/privacy': () => <PublicPrivacy />,
    '/terms': () => <PublicTerms />,
    '/contact': () => <PublicContact />,
    '/login': () => <AuthLogin />,
    '/register': () => <AuthRegister />,
    '/forgot-password': () => <AuthForgotPassword />,
  };

  // If not signed in
  if (!user || !profile) {
    // Auth pages should render for non-authenticated users
    if (publicRoutes[path]) return <>{publicRoutes[path]()}</>;
    // Default to home for any other route
    return <PublicHome />;
  }

  // Authenticated user — redirect auth pages to their dashboard
  if (path === '/login' || path === '/register' || path === '/forgot-password') {
    return <DashboardRouter />;
  }

  // Public pages are accessible to authenticated users too
  if (publicRoutes[path]) return <>{publicRoutes[path]()}</>;

  // Patient/clinician routes require layout
  return <DashboardRouter />;
}

function DashboardRouter() {
  const { profile } = useAuth();
  const { path } = useRouter();

  if (!profile) return <PublicHome />;

  const patientRoutes: Record<string, () => React.ReactNode> = {
    '/patient': () => <PatientOverview />,
    '/patient/risk': () => <PatientRiskTrajectory />,
    '/patient/my-plan': () => <PatientMyPlan />,
    '/patient/current-plan': () => <PatientMyPlan />,
    '/patient/adherence': () => <PatientMyPlan />,
    '/patient/wearables': () => <PatientWearables />,
    '/patient/profile': () => <PatientProfile />,
    '/patient/settings': () => <PatientSettings />,
    '/patient/care': () => <PatientCare />,
  };

  const clinicianRoutes: Record<string, () => React.ReactNode> = {
    '/clinician': () => <ClinicianPatients />,
    '/doctor': () => <ClinicianPatients />,
    '/clinician/care': () => <DoctorCare />,
    '/doctor/care': () => <DoctorCare />,
    '/clinician/risk-monitor': () => <ClinicianRiskMonitor />,
    '/clinician/plans-review': () => <ClinicianPlansReview />,
    '/clinician/analytics': () => <ClinicianAnalytics />,
  };

  // Patient detail route (dynamic)
  const patientDetailMatch = path.match(/^\/(?:clinician|doctor)\/patient\/(.+)$/);

  if (profile.role === 'clinician' || profile.role === 'doctor') {
    if (patientDetailMatch) {
      return <AppLayout><ClinicianPatientDetail patientId={patientDetailMatch[1]} /></AppLayout>;
    }
    if (clinicianRoutes[path]) return <AppLayout>{clinicianRoutes[path]()}</AppLayout>;
    // Default to clinician patients page
    return <AppLayout><ClinicianPatients /></AppLayout>;
  }

  // Patient role
  if (patientRoutes[path]) return <AppLayout>{patientRoutes[path]()}</AppLayout>;
  // Default to patient overview
  return <AppLayout><PatientOverview /></AppLayout>;
}

function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </RouterProvider>
  );
}

export default App;
