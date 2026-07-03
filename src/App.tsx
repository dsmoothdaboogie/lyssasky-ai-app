import { Route, Routes } from 'react-router-dom';
import { FunnelProvider } from './funnel/useFunnelState';
import { AdminApp } from './admin/AdminApp';
import { LandingPage } from './funnel/LandingPage';
import { UploadStep } from './funnel/UploadStep';
import { QuestionnaireStep } from './funnel/QuestionnaireStep';
import { EmailStep } from './funnel/EmailStep';
import { MockCheckoutPage } from './funnel/MockCheckoutPage';
import { WaitScreen } from './funnel/WaitScreen';
import { ResultStep } from './funnel/ResultStep';
import { BookingStep } from './funnel/BookingStep';

export default function App() {
  return (
    <FunnelProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/upload" element={<UploadStep />} />
        <Route path="/questionnaire" element={<QuestionnaireStep />} />
        <Route path="/email" element={<EmailStep />} />
        <Route path="/mock-checkout" element={<MockCheckoutPage />} />
        <Route path="/wait" element={<WaitScreen />} />
        <Route path="/result" element={<ResultStep />} />
        <Route path="/book" element={<BookingStep />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </FunnelProvider>
  );
}
