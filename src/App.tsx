import { Route, Routes } from 'react-router-dom';
import { FunnelProvider } from './funnel/useFunnelState';
import { Placeholder } from './funnel/Placeholder';
import { LandingPage } from './funnel/LandingPage';

export default function App() {
  return (
    <FunnelProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/upload" element={<Placeholder name="Upload" />} />
        <Route path="/questionnaire" element={<Placeholder name="Questionnaire" />} />
        <Route path="/email" element={<Placeholder name="Email" />} />
        <Route path="/mock-checkout" element={<Placeholder name="MockCheckout" />} />
        <Route path="/wait" element={<Placeholder name="Wait" />} />
        <Route path="/result" element={<Placeholder name="Result" />} />
        <Route path="/book" element={<Placeholder name="Booking" />} />
        <Route path="/admin/*" element={<Placeholder name="Admin" />} />
      </Routes>
    </FunnelProvider>
  );
}
