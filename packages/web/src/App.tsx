import { useReviewStore } from './store';
import { HomePage } from './components/HomePage';
import { ReviewPage } from './components/ReviewPage';

export function App() {
  const started = useReviewStore((s) => s.summary !== null);
  return started ? <ReviewPage /> : <HomePage />;
}
